"""Preview public game assets without exposing repository or private files."""
import argparse
import hashlib
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from urllib.parse import unquote, urlsplit


def source_build_id(root, game="snake"):
    if game == "sudoku":
        files = [root / "sudoku-game/index.html", root / "sudoku-game/style.css"]
        directories = [("shared", (".js", ".css")), ("sudoku-game/js", (".js",))]
    else:
        files = [root / 'index.html', root / 'snake-game/index.html', root / 'snake-game/style.css']
        directories = [('shared', ('.js', '.css')), ('snake-game/js', ('.js',))]
    for directory, extensions in directories:
        for target in (root / directory).rglob('*'):
            relative = target.relative_to(root)
            if any(part == 'private' or part.startswith('.') or '.local.' in part for part in relative.parts):
                continue
            if target.is_symlink():
                raise ValueError('Symbolic links cannot be fingerprinted')
            if target.is_file() and target.suffix in extensions:
                files.append(target)
    digest = hashlib.sha256()
    for target in sorted(files, key=lambda target: target.relative_to(root).as_posix()):
        digest.update(target.relative_to(root).as_posix().encode() + b'\0')
        digest.update(target.read_bytes() + b'\0')
    return 'sha256-' + digest.hexdigest()[:16]


class FreshAssetsHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def public_path(self):
        path = unquote(urlsplit(self.path).path)
        parts = Path(path).parts
        if any(part == 'private' or part.startswith('.') or '.local.' in part for part in parts):
            return False
        root = Path(self.directory).resolve()
        target = Path(self.translate_path(self.path)).resolve()
        if not target.is_relative_to(root):
            return False
        relative = target.relative_to(root)
        if any(part == 'private' or part.startswith('.') or '.local.' in part for part in relative.parts):
            return False
        if relative == Path('.') or relative == Path('index.html'):
            return True
        return (relative.parts[0] in ('snake-game', 'sudoku-game', 'shared') and
                (target.is_dir() or target.suffix in ('.html', '.css', '.js', '.json')))

    def deployment_config(self, head=False):
        # Only the public endpoint is returned; the private file is never served.
        path = unquote(urlsplit(self.path).path)
        if path not in ('/snake-game/analytics-config.json', '/sudoku-game/analytics-config.json'):
            return False
        game = path.split('-game/')[0].lstrip('/')
        override = Path(self.directory) / (game + '-game/private/analytics-config.json')
        try:
            config = json.loads(override.read_text()) if override.is_file() else {}
            endpoint = config.get('analyticsEndpoint', '')
            if not isinstance(endpoint, str):
                raise ValueError('Invalid endpoint setting')
            body = json.dumps({'analyticsEndpoint': endpoint, 'environment': 'development',
                               'buildId': source_build_id(Path(self.directory), game)}).encode()
        except (OSError, ValueError, TypeError, AttributeError):
            body = b'{"analyticsEndpoint":""}'
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if not head:
            self.wfile.write(body)
        return True

    def do_GET(self):
        if not self.public_path():
            self.send_error(404)
        elif not self.deployment_config():
            super().do_GET()

    def do_HEAD(self):
        if not self.public_path():
            self.send_error(404)
        elif not self.deployment_config(head=True):
            super().do_HEAD()

    def list_directory(self, path):
        self.send_error(404)
        return None


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bind', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8000)
    parser.add_argument('--directory', default=str(Path(__file__).resolve().parent))
    args = parser.parse_args()
    handler = partial(FreshAssetsHandler, directory=args.directory)
    with ThreadingHTTPServer((args.bind, args.port), handler) as server:
        server.serve_forever()
