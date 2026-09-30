// x402 pricing for Sessia's agent surface.
//
// Sessia sells one thing to other agents: a research read on a tokenized stock. The
// paywall is x402 v2, the same shape the BNB Agent Studio SDK signs against, and the
// settlement asset is U on BNB Chain. The 402 body below carries the fields both
// observed vintages of the SDK read (the challenge in the buyer demo and the quote
// the payment CLI returns), so a Studio agent does not have to care which one it
// parses.
export const X402_VERSION = 2;
export const PAYMENT_HEADER = 'X-PAYMENT';

/** Canonical U on BNB mainnet, from the SDK's own asset catalog. */
export const U_BSC = {
  address: '0xce24439f2d9c6a2289f741120fe202248b666666',
  symbol: 'U',
  name: 'United Stables',
  version: '2',
  decimals: 18,
  network: 'eip155:56',
};

export const PRICE_USD = 0.05;
export const MAX_TIMEOUT_SECONDS = 300;

/** Price in the asset's base units, as a string. Never a float on the wire. */
export function priceToBaseUnits(priceUsd, decimals = U_BSC.decimals) {
  const scale = 10n ** BigInt(decimals);
  const scaled = BigInt(Math.round(priceUsd * 1e6)) * scale / 1000000n;
  return scaled.toString();
}

/** The payment route: environment wins, so testnet and a new asset need no code. */
export function paymentRoute(env = process.env) {
  return {
    network: env.X402_NETWORK || U_BSC.network,
    asset: env.X402_ASSET || U_BSC.address,
    symbol: env.X402_ASSET_SYMBOL || U_BSC.symbol,
    assetName: env.X402_ASSET_NAME || U_BSC.name,
    assetVersion: env.X402_ASSET_VERSION || U_BSC.version,
    decimals: env.X402_ASSET_DECIMALS ? Number(env.X402_ASSET_DECIMALS) : U_BSC.decimals,
    payTo: (env.X402_PAY_TO || '').trim() || null,
    transferMethod: 'eip3009',
  };
}

/** True when the paywall can actually charge: a payee and a way to settle. */
export function paymentsConfigured(env = process.env) {
  const route = paymentRoute(env);
  return Boolean(route.payTo && facilitatorUrl(env));
}

export function facilitatorUrl(env = process.env) {
  return (env.X402_FACILITATOR_URL || '').replace(/\/$/, '') || null;
}

/** The 402 body: one route, priced in base units, with the EIP-712 domain attached. */
export function challenge({ resource, description, priceUsd = PRICE_USD, env = process.env }) {
  const route = paymentRoute(env);
  return {
    x402Version: X402_VERSION,
    accepts: [
      {
        scheme: 'exact',
        network: route.network,
        asset: route.asset,
        payTo: route.payTo,
        amount: priceToBaseUnits(priceUsd, route.decimals),
        maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
        extra: { name: route.assetName, version: route.assetVersion },
        tokenName: route.assetName,
        transferMethod: route.transferMethod,
        preferred: true,
        requiresApproval: false,
        description: `${description}. ${priceUsd} U on ${route.network} via eip3009.`,
      },
    ],
    resource,
    error: `${PAYMENT_HEADER} header is required`,
  };
}

/** Decode the base64 envelope a buyer sends back. Shape errors are named. */
export function parsePaymentEnvelope(headerValue) {
  if (!headerValue || typeof headerValue !== 'string') {
    throw new Error('missing X-PAYMENT header');
  }
  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(headerValue, 'base64').toString('utf-8'));
  } catch {
    throw new Error('X-PAYMENT is not base64 encoded JSON');
  }
  const authorization = decoded?.payload?.authorization;
  if (!authorization) throw new Error('X-PAYMENT payload has no authorization');
  return {
    x402Version: decoded.x402Version,
    scheme: decoded.scheme,
    network: decoded.network,
    payload: decoded.payload,
    authorization: {
      from: authorization.from,
      to: authorization.to,
      value: String(authorization.value),
      validAfter: Number(authorization.validAfter),
      validBefore: Number(authorization.validBefore),
      nonce: authorization.nonce,
    },
    signature: decoded.payload?.signature,
  };
}

/**
 * The checks a seller can make on its own: right chain, right payee, enough money,
 * still valid, well formed. Signature recovery is the facilitator's job, so this is
 * a gate in front of it, not a replacement for it.
 */
export function checkTerms({ envelope, requirement, now = Math.floor(Date.now() / 1000) }) {
  const problems = [];
  if (envelope.network && requirement.network && envelope.network !== requirement.network) {
    problems.push(`network ${envelope.network} does not match ${requirement.network}`);
  }
  const auth = envelope.authorization;
  if (!auth) return { ok: false, problems: ['no authorization in envelope'] };
  if (requirement.payTo && String(auth.to).toLowerCase() !== requirement.payTo.toLowerCase()) {
    problems.push('authorization pays the wrong address');
  }
  try {
    if (BigInt(auth.value) < BigInt(requirement.amount)) {
      problems.push('authorization is below the asking price');
    }
  } catch {
    problems.push('authorization amount is not an integer');
  }
  if (auth.validBefore && auth.validBefore < now) problems.push('authorization has expired');
  if (!auth.nonce || !/^0x[0-9a-f]{64}$/i.test(auth.nonce)) problems.push('nonce missing or malformed');
  if (!envelope.signature || !/^0x[0-9a-f]{130}$/i.test(envelope.signature)) {
    problems.push('signature missing or malformed');
  }
  return { ok: problems.length === 0, problems };
}

/** Ask the facilitator to verify, then optionally settle. No facilitator, no service. */
export async function verifyPayment({ header, requirement, env = process.env, fetchImpl = fetch }) {
  const url = facilitatorUrl(env);
  if (!url) return { ok: false, reason: 'facilitator not configured' };

  let envelope;
  try {
    envelope = parsePaymentEnvelope(header);
  } catch (error) {
    return { ok: false, reason: error.message };
  }
  const terms = checkTerms({ envelope, requirement });
  if (!terms.ok) return { ok: false, reason: terms.problems.join('; ') };

  const call = async (path) => {
    const response = await fetchImpl(`${url}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        x402Version: X402_VERSION,
        paymentPayload: envelope.payload,
        paymentRequirements: requirement,
      }),
    });
    return { response, body: await response.json().catch(() => ({})) };
  };

  const { response, body } = await call('/verify');
  if (!response.ok || body.isValid === false || body.valid === false) {
    return { ok: false, reason: body.invalidReason || body.error || `facilitator returned ${response.status}` };
  }
  return { ok: true, payer: body.payer || envelope.authorization.from, raw: body, settle: () => call('/settle') };
}
