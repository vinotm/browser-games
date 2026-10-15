// Export only the public site. Repository files and private material are excluded.
import { cp, mkdir, readdir, rm, lstat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'dist');
const files = ['index.html', 'snake-game/index.html', 'snake-game/style.css',
  'snake-game/analytics-config.json', 'snake-game/LUCIDE-LICENSE'];

async function collect(relative, extensions) {
  const path = join(root, relative);
  if ((await lstat(path)).isSymbolicLink()) throw new Error('Symbolic links cannot be published');
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.name === 'private' || entry.name.startsWith('.') || entry.name.includes('.local.')) continue;
    if (entry.isSymbolicLink()) throw new Error('Symbolic links cannot be published');
    const next = join(relative, entry.name);
    if (entry.isDirectory()) await collect(next, extensions);
    else if (extensions.some((extension) => entry.name.endsWith(extension))) files.push(next);
  }
}

await collect('shared', ['.js', '.css']);
await collect('snake-game/js', ['.js']);
let endpoint = process.env.SNAKE_ANALYTICS_ENDPOINT ?? '';
if (endpoint) {
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new Error('SNAKE_ANALYTICS_ENDPOINT must be a public HTTPS URL without credentials or a fragment');
  }
  endpoint = url.href;
}
// Validate inputs before replacing an existing export.
for (const file of files) {
  if (!(await lstat(join(root, file))).isFile()) throw new Error('Expected a regular public source file');
}
await rm(output, { recursive: true, force: true });
for (const file of files) {
  await mkdir(dirname(join(output, file)), { recursive: true });
  await cp(join(root, file), join(output, file));
}
await writeFile(join(output, 'snake-game/analytics-config.json'),
  JSON.stringify({ analyticsEndpoint: endpoint }, null, 2) + '\n');
console.log(`Exported ${files.length} public files to dist/. Analytics ${endpoint ? 'enabled' : 'disabled'}.`);
