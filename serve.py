"""Only this study folder is served, on loopback. No other project files are exposed."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse
import webbrowser


class StudyHandler(SimpleHTTPRequestHandler):
    def copyfile(self, source, outputfile):
        try:
            super().copyfile(source, outputfile)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            # Closing a PDF tab or navigating away is not a server failure.
            pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def list_directory(self, path):
        self.send_error(403, "Directory listing is disabled")


def main():
    parser = argparse.ArgumentParser(description="민사논증 연습실 내부 서버")
    parser.add_argument("--port", type=int, default=4192)
    parser.add_argument("--open", action="store_true")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    handler = partial(StudyHandler, directory=str(root))
    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    except OSError as error:
        raise SystemExit(f"서버를 열지 못했습니다: {error}. 포트를 바꿔 실행할 수 있습니다: python serve.py --port 4193") from error
    url = f"http://127.0.0.1:{args.port}/"
    print(f"민사논증 연습실: {url}", flush=True)
    print("종료: 이 창에서 Ctrl+C. 앱의 기록은 브라우저에 보관됩니다.", flush=True)
    if args.open:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
