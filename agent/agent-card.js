// Sessia's agent identity.
//
// Built to the BNB Agent Studio shapes: an EIP-8004 registration file, served at
// /.well-known/agent-card.json (the discovery path the Studio SDK points A2A at),
// plus the base64 data URI the identity registry stores on chain. The same file
// is what a Studio agent reads to find out what this endpoint does and what it
// costs.
import { canonicalJson, keccakOfCanonicalJson } from './canonical.js';
import { paymentRoute } from './x402.js';

export const AGENT_NAME = 'Sessia';
export const AGENT_DESCRIPTION =
  'Research agent for tokenized stocks on BNB Chain. Reads the on-chain pool, the APRO oracle and the Binance Web3 RWA registry, then answers with sources.';
export const A2A_WELL_KNOWN_PATH = '/.well-known/agent-card.json';
export const DATA_URI_PREFIX = 'data:application/json;base64,';

/** Capabilities this agent sells. One capability today, priced per call. */
export const CAPABILITIES = [
  {
    id: 'stock-research',
    name: 'Tokenized stock research on BNB Chain',
    description:
      'Price per issuer, oracle against pool divergence, market session, and the company behind the token.',
    input: 'A ticker, a contract address, or a question in plain words.',
    output: 'A JSON research note with every number sourced and a manifest hash.',
    priceUsd: 0.05,
  },
];

function endpoint(name, baseUrl, suffix, extra = {}) {
  return { name, endpoint: `${baseUrl}${suffix}`, ...extra };
}

/** Services block: the same shape the SDK's AgentEndpoint serialises to. */
export function services(baseUrl) {
  return [
    endpoint('web', baseUrl, '/'),
    endpoint('A2A', baseUrl, '/api/agent/task', { version: '0.2.0' }),
    endpoint('ERC8183', baseUrl, '/api/agent/task', { version: '1.0.0' }),
    endpoint('x402', baseUrl, '/api/agent/research', { version: '2' }),
  ];
}

/** The EIP-8004 registration file, key for key as the SDK generates it. */
export function buildRegistrationFile({
  baseUrl,
  agentId = null,
  identityRegistry = null,
  chainId = null,
  supportedTrust = ['reputation', 'crypto-economic'],
} = {}) {
  const registrations = [];
  if (agentId !== null && identityRegistry && chainId !== null) {
    registrations.push({
      agentId: Number(agentId),
      agentRegistry: `eip155:${chainId}:${identityRegistry}`,
    });
  }

  const file = {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: AGENT_NAME,
    description: AGENT_DESCRIPTION,
    image: `${baseUrl}/logo.png`,
    services: services(baseUrl),
    registrations,
  };
  if (supportedTrust && supportedTrust.length > 0) file.supportedTrust = supportedTrust;
  return file;
}

/** keccak256 of the registration file's canonical JSON, as the SDK computes it. */
export function registrationFileHash(file) {
  return keccakOfCanonicalJson(file);
}

/** The data URI handed to the identity registry's register() call. */
export function agentUri(opts) {
  const file = buildRegistrationFile(opts);
  return {
    uri: `${DATA_URI_PREFIX}${Buffer.from(canonicalJson(file), 'utf-8').toString('base64')}`,
    file,
    hash: registrationFileHash(file),
  };
}

/** Identity values come from the environment once the agent is registered. */
export function identityFromEnv(env = process.env) {
  const agentId = env.SESSIA_AGENT_ID ? Number(env.SESSIA_AGENT_ID) : null;
  const identityRegistry = (env.SESSIA_IDENTITY_REGISTRY || '').trim() || null;
  const chainId = env.SESSIA_AGENT_CHAIN_ID ? Number(env.SESSIA_AGENT_CHAIN_ID) : null;
  return { agentId, identityRegistry, chainId };
}

/**
 * The public discovery document: the registration file, plus what this endpoint
 * sells and what it costs. Everything here is derived, nothing is hardcoded twice.
 */
export function buildAgentCard({ baseUrl, env = process.env }) {
  const file = buildRegistrationFile({ baseUrl, ...identityFromEnv(env) });
  return {
    ...file,
    capabilities: CAPABILITIES,
    x402: Object.assign(paymentRoute(env), {
      protocol: 'x402',
      version: 2,
      priceUsd: CAPABILITIES[0].priceUsd,
      maxTimeoutSeconds: 300,
    }),
    hash: registrationFileHash(file),
  };
}
