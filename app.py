#!/usr/bin/env python3
"""Desktop app entry point — wraps the server in a native window via pywebview."""

import threading
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from server import main as start_server, PORT, get_post_count
from backend.db import init_db


def main():
    init_db()
    count = get_post_count()
    print(f"Starting desktop app... ({count} posts in database)")

    # Start HTTP server in background thread
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()

    # Open native window
    try:
        import webview
        webview.create_window(
            "深夜研报 — 雪球帖子浏览器",
            f"http://localhost:{PORT}",
            width=1280,
            height=860,
            min_size=(900, 600),
        )
        webview.start()
    except ImportError:
        print("\npywebview not installed. Install with: pip install pywebview")
        print(f"Server running at http://localhost:{PORT} — press Ctrl+C to exit.")
        try:
            import time
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\nShutting down.")
            sys.exit(0)


if __name__ == "__main__":
    main()
