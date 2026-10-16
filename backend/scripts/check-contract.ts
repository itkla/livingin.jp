/**
 * Contract gate run in CI and by `npm run check`:
 *   1. contracts/openapi.json must equal the document generated from the zod schemas.
 *   2. Compared with the base branch's contract (--base <file>), breaking changes require a
 *      version bump (see src/contract/version.ts).
 */
import { existsSync, readFileSync } from 'node:fs';
import { compareContracts, versionAllowsBreaking } from '../src/contract/compat';
import { CONTRACT_FILE, renderContract } from './generate-openapi';

let failed = false;
const generated = renderContract();
const committed = existsSync(CONTRACT_FILE) ? readFileSync(CONTRACT_FILE, 'utf8') : '';
if (generated !== committed) {
  console.error('✗ contracts/openapi.json is out of date. Run `npm run contract:generate` and commit the result.');
  failed = true;
} else {
  console.log('✓ contracts/openapi.json matches the schemas.');
}

const baseIndex = process.argv.indexOf('--base');
const basePath = baseIndex > -1 ? process.argv[baseIndex + 1] : process.env.CONTRACT_BASE_FILE;
if (!basePath) {
  console.log('• No base contract given (--base <file>); skipping the compatibility check.');
} else if (!existsSync(basePath) || readFileSync(basePath, 'utf8').trim() === '') {
  console.log(`• Base contract ${basePath} does not exist (first contract); skipping the compatibility check.`);
} else {
  const base = JSON.parse(readFileSync(basePath, 'utf8'));
  const head = JSON.parse(generated);
  const changes = compareContracts(base, head);
  const breaking = changes.filter((c) => c.kind === 'breaking');
  const notices = changes.filter((c) => c.kind === 'notice');
  for (const c of notices) console.log(`  notice   ${c.location}: ${c.message}`);
  for (const c of breaking) console.log(`  BREAKING ${c.location}: ${c.message}`);
  const bv = base.info?.version ?? '0.0.0';
  const hv = head.info?.version ?? '0.0.0';
  if (breaking.length && !versionAllowsBreaking(bv, hv)) {
    console.error(`✗ ${breaking.length} breaking change(s) without a contract version bump (${bv} -> ${hv}). Bump CONTRACT_VERSION and document the migration for frontend consumers.`);
    failed = true;
  } else {
    console.log(`✓ Compatibility: ${breaking.length} breaking (${breaking.length ? `allowed by ${bv} -> ${hv}` : 'none'}), ${notices.length} notice(s).`);
  }
}

process.exit(failed ? 1 : 0);
