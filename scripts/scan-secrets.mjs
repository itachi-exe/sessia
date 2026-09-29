#!/usr/bin/env node
// Scans every tracked file for credential shapes. CI runs it on each push.
// Usage: node scripts/scan-secrets.mjs   (findings are printed masked)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Shapes that must never reach a repository.
const PATTERNS = [
  ['deepseek_key', /sk-[A-Za-z0-9_-]{20,}/g],
  ['telegram_bot_token', /\b\d{8,10}:[A-Za-z0-9_-]{30,}/g],
  ['vercel_blob_token', /vercel_blob_rw_[A-Za-z0-9_]{10,}/g],
  ['github_token', /gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/g],
  ['private_key_pem', /-----BEGIN [A-Z ]*PRIVATE KEY/],
  ['hex_private_key', /(?<![0-9a-fA-F])0x[0-9a-fA-F]{64}(?![0-9a-fA-F])|(?<![0-9a-fA-F])[0-9a-f]{64}(?![0-9a-fA-F])/g],
  ['aws_key', /AKIA[0-9A-Z]{16}/g],
  ['assigned_secret', /(secret|password|api[_-]?key|private[_-]?key)\s*[:=]\s*["'][A-Za-z0-9+/_=-]{16,}["']/gi],
];

// Every entry needs a reason. Keep this list short and specific.
const ALLOW = [
  { file: 'test/limits.test.mjs', shape: 'hex_private_key', why: 'public Anvil test key, labelled in the file' },
];

const mask = (value) => (value.length <= 8 ? '*'.repeat(value.length) : `${value.slice(0, 4)}...${value.length} chars`);

const SKIP = [/^package-lock\.json$/, /\.(png|jpg|jpeg|ico|svg|woff2?)$/i];
const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter((f) => f && !SKIP.some((s) => s.test(f)));

const allowed = (file, shape) => ALLOW.some((a) => a.file === file && a.shape === shape);
const findings = [];

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const [shape, pattern] of PATTERNS) {
    if (allowed(file, shape)) continue;
    const hits = text.match(pattern);
    if (hits) findings.push({ file, shape, sample: mask(hits[0]) });
  }
}

// History mode walks every blob in every commit, including files that were deleted.
if (process.argv.includes('--history')) {
  const listing = execFileSync('git', ['rev-list', '--objects', '--all'], { encoding: 'utf8' }).trim().split('\n');
  const typed = execFileSync('git', ['cat-file', '--batch-check=%(objecttype) %(objectname) %(rest)'], { input: listing.join('\n'), encoding: 'utf8' }).split('\n');
  const blobs = typed.map((line) => line.split(' ')).filter(([type]) => type === 'blob').map(([, hash, path]) => [hash, path]);
  const seen = new Set();
  for (const [hash, path] of blobs) {
    if (!path || seen.has(hash) || SKIP.some((s) => s.test(path))) continue;
    seen.add(hash);
    let text = '';
    try { text = execFileSync('git', ['cat-file', 'blob', hash]).toString('utf8'); } catch { continue; }
    for (const [shape, pattern] of PATTERNS) {
      if (allowed(path, shape)) continue;
      const hits = text.match(pattern);
      if (hits) findings.push({ file: `${path} @ ${hash.slice(0, 7)}`, shape, sample: mask(hits[0]) });
    }
  }
  console.log(`history: ${seen.size} blobs scanned`);
}

if (findings.length === 0) {
  console.log('clean: no credential shapes found');
  process.exit(0);
}
console.log(`found ${findings.length} suspect(s):`);
for (const finding of findings) console.log(`  ${finding.file}  ${finding.shape}  ${finding.sample}`);
process.exit(1);
