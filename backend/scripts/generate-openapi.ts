import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildOpenApiDocument } from '../src/contract/openapi';
import { allOperations } from '../src/modules';

export const CONTRACT_FILE = fileURLToPath(new URL('../contracts/openapi.json', import.meta.url));

export function renderContract(): string {
  return `${JSON.stringify(buildOpenApiDocument(allOperations), null, 2)}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(CONTRACT_FILE, renderContract());
  console.log(`Wrote ${CONTRACT_FILE}`);
}
