#!/usr/bin/env python3
"""
Local HTTP server for browsing xueqiu posts stored in SQLite.
Serves API + static frontend.
"""

import json
import os
import re
import sys
import time
import random
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, unquote
from html import unescape as html_unescape
from datetime import datetime

import requests

sys.path.insert(0, os.path.dirname(__file__))
from backend.db import get_posts, get_post, get_post_count, upsert_post, log_scrape

PORT = 8899
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "frontend")
COOKIE_FILE = os.path.join(os.path.dirname(__file__), "cookie.txt")
USER_ID = "4533843739"

XUEQIU = "https://xueqiu.com"

# ---- Helpers ----

def load_cookie():
    if os.path.exists(COOKIE_FILE):
        with open(COOKIE_FILE) as f:
            c = f.read().strip()
            if c:
                return c
    return None


def xq_headers(referer=""):
    h = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "X-Requested-With": "XMLHttpRequest",
    }
    if referer:
        h["Referer"] = referer
    cookie = load_cookie()
    if cookie:
        h["Cookie"] = cookie
    return h


def rand_sleep(lo=0.5, hi=1.5):
    time.sleep(random.uniform(lo, hi))


def clean_html(raw):
    raw = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", raw, flags=re.DOTALL)
    raw = re.sub(r"<br\s*/?>", "\n", raw)
    raw = re.sub(r"</?(?:p|div|h\d|li|tr)[^>]*>", "\n", raw)
    raw = re.sub(r"<[^>]+>", "", raw)
    raw = html_unescape(raw)
    raw = re.sub(r"\n{3,}", "\n\n", raw)
    raw = re.sub(r"[ \t]+", " ", raw)
    raw = re.sub(r" *\n *", "\n", raw)
    return raw.strip()


# ---- Re-scrape logic ----

def extract_article_text(html):
    # SNOWMAN_STATUS
    m = re.search(r"SNOWMAN_STATUS\s*=\s*(\{.*?\});\s*\n", html, re.DOTALL)
    if not m:
        m = re.search(r"window\.SNOWMAN_STATUS\s*=\s*(\{.*?\});", html, re.DOTALL)
    if m:
        try:
            data = json.loads(m.group(1))
            text = data.get("text") or data.get("description") or ""
            if text:
                return clean_html(text), data
        except json.JSONDecodeError:
            pass

    # article__bd
    m = re.search(r'<div[^>]*class="[^"]*article__bd[^"]*"[^>]*>(.*?)</div>\s*<(?:div|article)', html, re.DOTALL)
    if m:
        return clean_html(m.group(1)), None

    # detail__content
    m = re.search(r'<div[^>]*class="[^"]*detail__content[^"]*"[^>]*>(.*?)</div>', html, re.DOTALL)
    if m:
        return clean_html(m.group(1)), None

    return "", None


def fetch_comments(status_id):
    all_comments = []
    max_id = -1
    while True:
        url = f"{XUEQIU}/statuses/v3/comments.json?id={status_id}&type=4&size=20&max_id={max_id}"
        resp = requests.get(url, headers=xq_headers(f"{XUEQIU}/"), timeout=30)
        if resp.status_code != 200:
            break
        data = resp.json()
        comments = data.get("comments", [])
        all_comments.extend(comments)
        next_id = data.get("next_max_id")
        if next_id is None or next_id == -1 or next_id == "-1":
            break
        max_id = next_id
        rand_sleep(0.8, 1.5)
    return all_comments


def refresh_single_post(target, status_id):
    cookie = load_cookie()
    if not cookie:
        raise RuntimeError("Cookie file not found")

    url = f"{XUEQIU}{target}"
    resp = requests.get(url, headers=xq_headers(url), timeout=30)
    if resp.status_code != 200:
        raise RuntimeError(f"HTTP {resp.status_code}")

    article_text, meta = extract_article_text(resp.text)
    rand_sleep(0.5, 1.0)
    comments = fetch_comments(status_id)

    return article_text, comments, meta


# ---- Server ----

HTML_TEMPLATE = open(os.path.join(FRONTEND_DIR, "index.html"), encoding="utf-8").read()


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)

        if path == "/":
            self.send_html()
        elif path == "/api/posts":
            self.api_get_posts(parsed)
        elif path.startswith("/api/posts/") and path.endswith("/refresh"):
            self.send_error(404)  # refresh is POST only
        elif path.startswith("/api/posts/"):
            self.api_get_post(path)
        else:
            self.send_error(404)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)

        if path.startswith("/api/posts/") and path.endswith("/refresh"):
            self.api_refresh_post(path)
        else:
            self.send_error(404)

    # ---- HTML ----

    def send_html(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(HTML_TEMPLATE.encode("utf-8"))

    # ---- API: list posts ----

    def api_get_posts(self, parsed):
        from urllib.parse import parse_qs
        qs = parse_qs(parsed.query)
        search = qs.get("q", [""])[0] or None
        posts = get_posts(search=search)
        # Return lightweight list
        result = [
            {
                "id": p["id"],
                "title": p["title"],
                "description": p["description"][:120],
                "created_at": p["created_at"],
                "like_count": p["like_count"],
                "fav_count": p["fav_count"],
                "retweet_count": p["retweet_count"],
                "reply_count": p["reply_count"],
                "comment_count": p["comment_count"],
            }
            for p in posts
        ]
        self.send_json(result)

    # ---- API: single post ----

    def api_get_post(self, path):
        try:
            post_id = int(path.rsplit("/", 1)[-1])
        except ValueError:
            self.send_error(404)
            return

        data = get_post(post_id)
        if not data:
            self.send_error(404)
            return

        post = data["post"]
        result = {
            "status": json.loads(post.get("raw_status", "{}")),
            "article_text": post["article_text"],
            "comments": data["comments"],
        }
        self.send_json(result)

    # ---- API: refresh ----

    def api_refresh_post(self, path):
        try:
            post_id = int(path.rsplit("/", 2)[-2])
        except ValueError:
            self.send_error(404)
            return

        data = get_post(post_id)
        if not data:
            self.send_json({"error": "Post not found"}, 404)
            return

        post = data["post"]
        target = post.get("target", "")
        if not target:
            self.send_json({"error": "Missing target"}, 400)
            return

        try:
            article_text, comments, meta = refresh_single_post(target, post_id)
        except RuntimeError as e:
            log_scrape(post_id, "refresh", "error", str(e))
            self.send_json({"error": str(e)}, 500)
            return

        # Merge status
        status = json.loads(post.get("raw_status", "{}"))
        if meta:
            status.update(meta)

        upsert_post(status, article_text, comments)
        log_scrape(post_id, "refresh", "success", f"Refreshed at {datetime.now().isoformat()}")

        # Return updated
        updated = get_post(post_id)
        if updated:
            raw = json.loads(updated["post"].get("raw_status", "{}"))
            self.send_json({
                "status": raw,
                "article_text": updated["post"]["article_text"],
                "comments": updated["comments"],
            })
        else:
            self.send_json({"error": "Failed to read back"}, 500)

    # ---- Utils ----

    def send_json(self, data, code=200):
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def log_message(self, fmt, *args):
        pass


def main():
    if not load_cookie():
        print("[WARN] No cookie.txt found — refresh will not work.")

    from backend.db import init_db
    init_db()

    count = get_post_count()
    print(f"SQLite ready. {count} posts in database.")
    print(f"\n  Open http://localhost:{PORT}\n")

    server = HTTPServer(("127.0.0.1", PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        server.shutdown()


if __name__ == "__main__":
    main()
