"""Preview public game assets without exposing repository or private files."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from urllib.parse import unquote, urlsplit


class FreshAssetsHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def public_path(self):
        path = unquote(urlsplit(self.path).path)
        parts = Path(path).parts
        if any(part == 'private' or part.startswith('.') for part in parts):
            return False
        root = Path(self.directory).resolve()
        target = Path(self.translate_path(self.path)).resolve()
        if not target.is_relative_to(root):
            return False
        relative = target.relative_to(root)
        if any(part == 'private' or part.startswith('.') for part in relative.parts):
            return False
        if relative == Path('.') or relative == Path('index.html'):
            return True
        return (relative.parts[0] in ('snake-game', 'shared') and
                (target.is_dir() or target.suffix in ('.html', '.css', '.js', '.json')))

    def deployment_config(self, head=False):
        # Only the public endpoint is returned; the private file is never served.
        if unquote(urlsplit(self.path).path) != '/snake-game/analytics-config.json':
            return False
        override = Path(self.directory) / 'snake-game/private/analytics-config.json'
        if not override.is_file():
            return False
        try:
            config = json.loads(override.read_text())
            endpoint = config.get('analyticsEndpoint', '')
            if not isinstance(endpoint, str):
                raise ValueError('Invalid endpoint setting')
            body = json.dumps({'analyticsEndpoint': endpoint}).encode()
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
