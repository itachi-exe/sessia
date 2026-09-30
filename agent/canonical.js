// Canonical JSON, byte-identical to the BNB Agent SDK.
//
// Every hash in the agent commerce stack (ERC-8004 registration files, ERC-8183
// deliverable manifests) is taken over this exact string form: object keys sorted
// recursively, no whitespace around separators, everything above code point 0x7e
// escaped. The SDK documents that as Python's
// json.dumps(x, sort_keys=True, separators=(',', ':')), and the two languages have
// to agree byte for byte or the on-chain hash will not match what the buyer
// computed.
//
// Numbers are the sharp edge: JavaScript cannot tell 2 from 2.0, so every amount
// and price that crosses this boundary is a string.
import { keccak256, toBytes } from 'viem';

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortValue(value[key]);
    return out;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new TypeError('canonicalJson: non-finite numbers are not allowed');
  }
  return value;
}

function escapeAscii(text) {
  let out = '';
  for (const char of text) {
    const code = char.codePointAt(0);
    if (code > 0x7e) {
      // Astral characters escape as a surrogate pair, which is what Python emits.
      for (let i = 0; i < char.length; i += 1) {
        out += `\\u${char.charCodeAt(i).toString(16).padStart(4, '0')}`;
      }
    } else {
      out += char;
    }
  }
  return out;
}

/** Canonical JSON string for a value. */
export function canonicalJson(value) {
  return escapeAscii(JSON.stringify(sortValue(value)));
}

/** keccak256 over the canonical JSON of a value. */
export function keccakOfCanonicalJson(value) {
  return keccak256(toBytes(canonicalJson(value)));
}
