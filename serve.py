"""Tiny dev server: like `python3 -m http.server`, but tells the browser never to cache,
so edited ES modules are always picked up on reload."""
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5178
ROOT = os.path.dirname(os.path.abspath(__file__))


class NoCache(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    http.server.ThreadingHTTPServer(('127.0.0.1', PORT), NoCache).serve_forever()
