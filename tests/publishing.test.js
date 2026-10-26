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
    for (const item of ['LICENSE', 'index.html', 'shared', 'snake-game', 'sudoku-game', 'sos-game', 'scripts', 'preview_server.py']) {
      cpSync(join(source, item), join(temporary, item), {
        recursive: true,
        filter: (path) => !path.split(/[\\/]/).includes('private'),
      });
    }
    for (const path of ['snake-game/private/prototype-preview', 'snake-game/private/analytics-dashboard',
      'sos-game/private/feature-preview', 'sudoku-game/private/feature-preview', 'sudoku-solver', 'analytics', '.git']) {
      mkdirSync(join(temporary, path), { recursive: true });
      writeFileSync(join(temporary, path, 'unpublished.txt'), 'not a public asset');
      writeFileSync(join(temporary, path, 'index.html'), '<p>Private review page</p>');
      writeFileSync(join(temporary, path, 'dashboard.js'), 'window.privateReview = true;');
    }
    writeFileSync(join(temporary, 'snake-game/js/settings.local.js'), 'local-only');
    const build = (endpoint = '', extra = {}) => spawnSync(process.execPath, ['scripts/build.mjs'], {
      cwd: temporary, env: { ...process.env, CF_PAGES: '', SNAKE_ENVIRONMENT: '',
        SNAKE_ANALYTICS_ENDPOINT: endpoint, SOS_ANALYTICS_ENDPOINT: '', SOS_ENVIRONMENT: '', ...extra }, encoding: 'utf8',
    });
    let result = build();
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(readdirSync(join(temporary, 'dist')).sort(), ['LICENSE', 'index.html', 'shared', 'snake-game', 'sos-game', 'sudoku-game']);
    for (const [game, page] of [['homepage', 'index.html'], ['snake', 'snake-game/index.html'],
      ['sudoku', 'sudoku-game/index.html'], ['sos', 'sos-game/index.html']]) {
      const image = `shared/social/${game}-v1.png`;
      const bytes = readFileSync(join(temporary, 'dist', image));
      assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
      assert.equal(bytes.readUInt32BE(16), 1200);
      assert.equal(bytes.readUInt32BE(20), 630);
      const head = readFileSync(join(temporary, 'dist', page), 'utf8').split('</head>')[0];
      assert.ok(head.includes(`property="og:image" content="https://browser-games-7cp.pages.dev/${image}"`));
      assert.ok(head.includes('name="twitter:card" content="summary_large_image"'));
    }
    assert.equal(readdirSync(join(temporary, 'dist/snake-game')).includes('private'), false);
    assert.equal(readdirSync(join(temporary, 'dist/snake-game/js')).includes('settings.local.js'), false);
    assert.equal(readdirSync(join(temporary, 'dist/sos-game')).includes('private'), false);
    assert.ok(readFileSync(join(temporary, 'dist/sos-game/js/opponent-worker.js')).length);
    const sosConfig = JSON.parse(readFileSync(join(temporary, 'dist/sos-game/analytics-config.json')));
    assert.equal(sosConfig.analyticsEndpoint, '');
    assert.match(sosConfig.buildId, /^sha256-[a-f0-9]{16}$/);
    assert.equal(readdirSync(join(temporary, 'dist/sos-game')).includes('analytics'), false);
    result = build('', { SOS_ANALYTICS_ENDPOINT: 'https://sos.test/exec', SOS_ENVIRONMENT: 'development' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(readFileSync(join(temporary, 'dist/sos-game/analytics-config.json'))).analyticsEndpoint, 'https://sos.test/exec');
    result = build('', { SOS_ANALYTICS_ENDPOINT: 'http://sos.test/exec' });
    assert.notEqual(result.status, 0);
    result = build(); assert.equal(result.status, 0, result.stderr);
    const firstConfig = JSON.parse(readFileSync(join(temporary, 'dist/snake-game/analytics-config.json')));
    assert.match(firstConfig.buildId, /^sha256-[a-f0-9]{16}$/);
    assert.deepEqual(firstConfig,
      { analyticsEndpoint: '', environment: 'production', buildId: firstConfig.buildId });
    const sudokuConfig = JSON.parse(readFileSync(join(temporary, 'dist/sudoku-game/analytics-config.json')));
    assert.equal(sudokuConfig.analyticsEndpoint, '');
    assert.match(sudokuConfig.buildId, /^sha256-[a-f0-9]{16}$/);
    assert.equal(readdirSync(join(temporary, 'dist/sudoku-game')).includes('analytics'), false);
    assert.equal(readdirSync(join(temporary, 'dist/sudoku-game')).includes('private'), false);
    // The preview reads its private override, emits only public fields, and hashes
    // exactly the same public sources as the static build, without a Git checkout.
    writeFileSync(join(temporary, 'snake-game/private/analytics-config.json'), JSON.stringify({
      analyticsEndpoint: 'https://preview.test/exec', private_note: 'never expose',
    }));
    const preview = spawnSync(process.env.PYTHON ?? 'python3', ['-c', `
import io, json
from pathlib import Path
from preview_server import source_build_id
assert source_build_id(Path('.'), 'sos') == '${sosConfig.buildId}'
from preview_server import FreshAssetsHandler
h = FreshAssetsHandler.__new__(FreshAssetsHandler)
h.directory = '.'
for path in ['/snake-game/private/dashboard/index.html', '/snake-game/js/settings.local.js', '/sudoku-game/private/dev-helpers/legacy-puzzle.js']:
    h.path = path
    assert not h.public_path(), path
for game in ['homepage', 'snake', 'sudoku', 'sos']:
    h.path = '/shared/social/' + game + '-v1.png'
    assert h.public_path(), h.path
h.path = '/shared/social/unpublished.png'
assert not h.public_path()
h.path = '/snake-game/analytics-config.json'
h.wfile = io.BytesIO()
h.send_response = lambda *a: None
h.send_header = lambda *a: None
h.end_headers = lambda: None
assert h.deployment_config()
print(h.wfile.getvalue().decode())
`], { cwd: temporary, encoding: 'utf8' });
    assert.equal(preview.status, 0, preview.stderr);
    assert.deepEqual(JSON.parse(preview.stdout), { analyticsEndpoint: 'https://preview.test/exec',
      environment: 'development', buildId: firstConfig.buildId });
    result = build('', { CF_PAGES: '1', CF_PAGES_BRANCH: 'snake' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(readFileSync(join(temporary, 'dist/snake-game/analytics-config.json'))).environment, 'preview');
    result = build('', { CF_PAGES: '1', CF_PAGES_BRANCH: 'main' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(readFileSync(join(temporary, 'dist/snake-game/analytics-config.json'))).environment, 'production');
    result = build('', { SNAKE_ENVIRONMENT: 'development' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(readFileSync(join(temporary, 'dist/snake-game/analytics-config.json'))).environment, 'development');
    result = build('', { SUDOKU_ANALYTICS_ENDPOINT: 'https://sudoku.test/exec', SUDOKU_ENVIRONMENT: 'preview' });
    assert.equal(result.status, 0, result.stderr);
    const configuredSudoku = JSON.parse(readFileSync(join(temporary, 'dist/sudoku-game/analytics-config.json')));
    assert.equal(configuredSudoku.analyticsEndpoint, 'https://sudoku.test/exec');
    assert.equal(configuredSudoku.environment, 'preview');
    writeFileSync(join(temporary, 'sudoku-game/private-note.local.js'), 'not public');
    writeFileSync(join(temporary, 'sudoku-game/js/puzzle.js'), readFileSync(join(temporary, 'sudoku-game/js/puzzle.js')) + '\n// Sudoku-only change\n');
    result = build();
    assert.equal(result.status, 0, result.stderr);
    assert.notEqual(JSON.parse(readFileSync(join(temporary, 'dist/sudoku-game/analytics-config.json'))).buildId, sudokuConfig.buildId);
    assert.equal(JSON.parse(readFileSync(join(temporary, 'dist/snake-game/analytics-config.json'))).buildId, firstConfig.buildId);
    writeFileSync(join(temporary, 'snake-game/js/config.js'), readFileSync(join(temporary, 'snake-game/js/config.js')) + '\n// updated rules\n');
    result = build('https://example.test/exec');
    assert.equal(result.status, 0, result.stderr);
    const updatedConfig = JSON.parse(readFileSync(join(temporary, 'dist/snake-game/analytics-config.json')));
    assert.equal(updatedConfig.analyticsEndpoint, 'https://example.test/exec');
    assert.notEqual(updatedConfig.buildId, firstConfig.buildId);
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
