// ERC-8183 job wire format, as the BNB Agent SDK defines it.
//
// A buyer posts a JobDescription, the seller answers with a DeliverableManifest, and
// the hash of that manifest's canonical JSON is what goes on chain. Both sides have to
// hash the same bytes, so the response is built through the canonical serialiser here
// rather than JSON.stringify.
import { canonicalJson, keccakOfCanonicalJson } from './canonical.js';

export class JobError extends Error {
  constructor(message, code = 'INVALID_JOB') {
    super(message);
    this.name = 'JobError';
    this.code = code;
  }
}

/**
 * Accept a description as an object or as the JSON string a buyer would post.
 * `job_id` and `chain_id` are the two fields the manifest has to echo back, so a
 * description without them cannot be delivered against.
 */
export function parseJobDescription(input) {
  let description = input;
  if (typeof input === 'string') {
    try {
      description = JSON.parse(input);
    } catch {
      throw new JobError('job description is not valid JSON');
    }
  }
  if (!description || typeof description !== 'object') {
    throw new JobError('job description must be an object');
  }
  const jobId = description.job_id ?? description.jobId;
  const chainId = description.chain_id ?? description.chainId;
  if (jobId === undefined || jobId === null) throw new JobError('job description has no job_id');
  if (chainId === undefined || chainId === null) throw new JobError('job description has no chain_id');
  return {
    jobId: Number(jobId),
    chainId: Number(chainId),
    capability: description.capability || description.service || 'stock-research',
    input: description.input ?? description.task ?? null,
    raw: description,
  };
}

/** The deliverable as a manifest: response plus the ids the buyer posted. */
export function buildDeliverable({ jobId, chainId, payload, deliverableUrl = null }) {
  const manifest = {
    response: canonicalJson(payload),
    job_id: Number(jobId),
    chain_id: Number(chainId),
  };
  return {
    manifest,
    hash: keccakOfCanonicalJson(manifest),
    optParams: deliverableUrl ? { deliverable_url: deliverableUrl } : {},
  };
}

/** Status values the SDK's JobStatus enum carries, for readable replies. */
export const JOB_STATUS = ['Open', 'Funded', 'Submitted', 'Completed', 'Rejected', 'Expired'];
