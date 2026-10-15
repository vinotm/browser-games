import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// Match preview_server.py: public HTML/CSS/JS only, no credentials or Git metadata.
export async function sourceBuildId(root, files) {
  const hash = createHash('sha256');
  for (const file of files.filter(file => /\.(html|css|js)$/.test(file)).sort()) {
    hash.update(file).update('\0').update(await readFile(join(root, file))).update('\0');
  }
  return `sha256-${hash.digest('hex').slice(0, 16)}`;
}
