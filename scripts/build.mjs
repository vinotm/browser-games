// Export only the public site. Repository files and private material are excluded.
import { cp, mkdir, readdir, rm, lstat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceBuildId } from './source-version.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'dist');
const files = ['LICENSE', 'index.html', 'snake-game/index.html', 'snake-game/style.css',
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
const environment = process.env.SNAKE_ENVIRONMENT || (process.env.CF_PAGES === '1' &&
  process.env.CF_PAGES_BRANCH !== 'main' ? 'preview' : 'production');
if (!['development', 'preview', 'production'].includes(environment)) {
  throw new Error('SNAKE_ENVIRONMENT must be development, preview, or production');
}
const buildId = await sourceBuildId(root, files);
let endpoint = process.env.SNAKE_ANALYTICS_ENDPOINT ?? '';
if (endpoint) {
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new Error('SNAKE_ANALYTICS_ENDPOINT must be a public HTTPS URL without credentials or a fragment');
  }
  endpoint = url.href;
}
// Sudoku has an independent source fingerprint and endpoint.
const sudokuFiles = ['sudoku-game/index.html', 'sudoku-game/style.css', 'sudoku-game/analytics-config.json'];
const snakeFileCount = files.length;
await collect('sudoku-game/js', ['.js']);
sudokuFiles.push(...files.splice(snakeFileCount));
const sudokuBuildId = await sourceBuildId(root, [...sudokuFiles, ...files.filter(file => file.startsWith('shared/'))]);
const sudokuEnvironment = process.env.SUDOKU_ENVIRONMENT || (process.env.CF_PAGES === '1' &&
  process.env.CF_PAGES_BRANCH !== 'main' ? 'preview' : 'production');
if (!['development', 'preview', 'production'].includes(sudokuEnvironment)) throw new Error('Invalid SUDOKU_ENVIRONMENT');
let sudokuEndpoint = process.env.SUDOKU_ANALYTICS_ENDPOINT ?? '';
if (sudokuEndpoint) {
  const url = new URL(sudokuEndpoint);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('Invalid SUDOKU_ANALYTICS_ENDPOINT');
  sudokuEndpoint = url.href;
}
files.push(...sudokuFiles);
const sosFiles = ['sos-game/index.html', 'sos-game/style.css', 'sos-game/analytics-config.json'];
const beforeSos = files.length;
await collect('sos-game/js', ['.js']);
sosFiles.push(...files.splice(beforeSos));
const sosBuildId = await sourceBuildId(root, [...sosFiles, ...files.filter(file => file.startsWith('shared/'))]);
const sosEnvironment = process.env.SOS_ENVIRONMENT || (process.env.CF_PAGES === '1' &&
  process.env.CF_PAGES_BRANCH !== 'main' ? 'preview' : 'production');
if (!['development', 'preview', 'production'].includes(sosEnvironment)) throw new Error('Invalid SOS_ENVIRONMENT');
let sosEndpoint = process.env.SOS_ANALYTICS_ENDPOINT ?? '';
if (sosEndpoint) {
  const url = new URL(sosEndpoint);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('Invalid SOS_ANALYTICS_ENDPOINT');
  sosEndpoint = url.href;
}
files.push(...sosFiles);
// Validate every input before replacing an existing export.
for (const file of files) {
  const stat = await lstat(join(root, file));
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Expected a regular public source file');
}
await rm(output, { recursive: true, force: true });
for (const file of files) {
  await mkdir(dirname(join(output, file)), { recursive: true });
  await cp(join(root, file), join(output, file));
}
await writeFile(join(output, 'snake-game/analytics-config.json'),
  JSON.stringify({ analyticsEndpoint: endpoint, environment, buildId }, null, 2) + '\n');
await writeFile(join(output, 'sudoku-game/analytics-config.json'),
  JSON.stringify({ analyticsEndpoint: sudokuEndpoint, environment: sudokuEnvironment, buildId: sudokuBuildId }, null, 2) + '\n');
await writeFile(join(output, 'sos-game/analytics-config.json'),
  JSON.stringify({ analyticsEndpoint: sosEndpoint, environment: sosEnvironment, buildId: sosBuildId }, null, 2) + '\n');
console.log(`Exported ${files.length} public files to dist/. Analytics ${endpoint ? 'enabled' : 'disabled'}.`);
