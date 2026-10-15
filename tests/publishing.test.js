import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

test('public export excludes unpublished sources, deployment state and private overrides', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'browser-games-export-'));
  const source = fileURLToPath(new URL('../', import.meta.url));
  try {
    for (const item of ['index.html', 'shared', 'snake-game', 'scripts']) {
      cpSync(join(source, item), join(temporary, item), {
        recursive: true,
        filter: (path) => !path.split(/[\\/]/).includes('private'),
      });
    }
    for (const path of ['snake-game/private', 'sudoku-solver', 'analytics', '.git']) {
      mkdirSync(join(temporary, path), { recursive: true });
      writeFileSync(join(temporary, path, 'unpublished.txt'), 'not a public asset');
    }
    writeFileSync(join(temporary, 'snake-game/js/settings.local.js'), 'local-only');
    const build = (endpoint = '') => spawnSync(process.execPath, ['scripts/build.mjs'], {
      cwd: temporary, env: { ...process.env, SNAKE_ANALYTICS_ENDPOINT: endpoint }, encoding: 'utf8',
    });
    let result = build();
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(readdirSync(join(temporary, 'dist')).sort(), ['index.html', 'shared', 'snake-game']);
    assert.equal(readdirSync(join(temporary, 'dist/snake-game')).includes('private'), false);
    assert.equal(readdirSync(join(temporary, 'dist/snake-game/js')).includes('settings.local.js'), false);
    assert.deepEqual(JSON.parse(readFileSync(join(temporary, 'dist/snake-game/analytics-config.json'))),
      { analyticsEndpoint: '' });
    result = build('https://example.test/exec');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(readFileSync(join(temporary, 'dist/snake-game/analytics-config.json'))).analyticsEndpoint,
      'https://example.test/exec');
    const before = readFileSync(join(temporary, 'dist/snake-game/analytics-config.json'), 'utf8');
    result = build('https://user:password@example.test/exec');
    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(join(temporary, 'dist/snake-game/analytics-config.json'), 'utf8'), before);
    symlinkSync(join(temporary, 'snake-game/private/unpublished.txt'), join(temporary, 'snake-game/js/alias.js'));
    result = build();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Symbolic links cannot be published/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
