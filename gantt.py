#!/usr/bin/env python3
"""Easy Gantt launcher.

Serves the app on http://127.0.0.1 and opens it in your default browser.
Only the Python 3 standard library is needed, so it works on any Linux
distribution (and macOS / Windows).

    python3 gantt.py                 # start and open the browser
    python3 gantt.py --port 8765     # use a fixed port
    python3 gantt.py --no-browser    # just serve; open the URL yourself
    python3 gantt.py --install-desktop   # add "Easy Gantt" to your app menu
"""
import argparse
import functools
import http.server
import os
import socketserver
import stat
import sys
import threading
import webbrowser

APP_DIR = os.path.dirname(os.path.abspath(__file__))


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):  # keep the terminal tidy
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def install_desktop_entry():
    apps = os.path.join(os.path.expanduser("~"), ".local", "share", "applications")
    os.makedirs(apps, exist_ok=True)
    path = os.path.join(apps, "easy-gantt.desktop")
    script = os.path.abspath(__file__)
    with open(path, "w", encoding="utf-8") as f:
        f.write(
            "[Desktop Entry]\n"
            "Type=Application\n"
            "Name=Easy Gantt\n"
            "Comment=Simple Gantt charts with dependencies and critical path\n"
            f'Exec={sys.executable} "{script}"\n'
            "Icon=x-office-calendar\n"
            "Terminal=false\n"
            "Categories=Office;ProjectManagement;\n"
        )
    os.chmod(path, os.stat(path).st_mode | stat.S_IXUSR)
    print(f"Installed {path}. Look for 'Easy Gantt' in your applications menu.")


def main():
    ap = argparse.ArgumentParser(description="Run the Easy Gantt app locally.")
    ap.add_argument("--port", type=int, default=8765, help="port to listen on (default 8765, 0 = any free port)")
    ap.add_argument("--host", default="127.0.0.1", help="interface to bind (default 127.0.0.1)")
    ap.add_argument("--no-browser", action="store_true", help="do not open a browser window")
    ap.add_argument("--install-desktop", action="store_true", help="create a Linux application-menu shortcut and exit")
    args = ap.parse_args()

    if args.install_desktop:
        install_desktop_entry()
        return

    handler = functools.partial(QuietHandler, directory=APP_DIR)
    try:
        httpd = Server((args.host, args.port), handler)
    except OSError:
        # Port busy (maybe Easy Gantt is already running) - fall back to a free port.
        httpd = Server((args.host, 0), handler)
    url = f"http://{args.host}:{httpd.server_address[1]}/index.html"
    print(f"Easy Gantt is running at {url}")
    print("Press Ctrl+C to stop.")
    if not args.no_browser:
        threading.Timer(0.4, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
