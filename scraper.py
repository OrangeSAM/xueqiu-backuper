#!/usr/bin/env python3
"""
Xueqiu user timeline scraper.
Fetches all original posts, full article content, and comments for a given user.
Rate-limited to avoid IP bans. Supports resume on interruption.
"""

import requests
import json
import time
import random
import os
import re
import sys
from datetime import datetime
from html import unescape

# ============ CONFIG ============

USER_ID = "4533843739"
OUTPUT_DIR = f"output_{USER_ID}"

# Rate limiting: random delay between API calls (seconds)
DELAY_MIN = 3.0
DELAY_MAX = 7.0
# Extra delay between processing each post (article + comments)
INTER_POST_DELAY = (4.0, 8.0)

# Retry on failure
MAX_RETRIES = 3
RETRY_DELAY = 10.0

# Cookie file (copy the full cookie string from browser DevTools)
COOKIE_FILE = "cookie.txt"

# ============ HEADERS ============

BASE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
    "accept": "*/*",
    "accept-language": "zh-CN,zh;q=0.9",
    "x-requested-with": "XMLHttpRequest",
}

# ============ HELPERS ============

def load_cookie():
    if os.path.exists(COOKIE_FILE):
        with open(COOKIE_FILE) as f:
            cookie = f.read().strip()
            if cookie:
                return cookie
    print(f"[FATAL] Cookie file '{COOKIE_FILE}' not found or empty.")
    print(f"Create {COOKIE_FILE} with your xueqiu.com browser cookie string.")
    sys.exit(1)

def parse_cookie_to_dict(cookie_str):
    """Parse a cookie header string into a dict."""
    result = {}
    for item in cookie_str.split("; "):
        if "=" in item:
            key, value = item.split("=", 1)
            result[key] = value
    return result

def get_session(cookie_str):
    s = requests.Session()
    s.headers.update(BASE_HEADERS)
    s.cookies.update(parse_cookie_to_dict(cookie_str))
    return s

def rand_delay(lo, hi):
    delay = random.uniform(lo, hi)
    print(f"  Sleeping {delay:.1f}s ...")
    time.sleep(delay)

def api_get(session, url, referer=None):
    """Make an API request with retries."""
    headers = {}
    if referer:
        headers["Referer"] = referer
    for attempt in range(MAX_RETRIES):
        try:
            resp = session.get(url, headers=headers, timeout=30)
            if resp.status_code == 200:
                return resp
            elif resp.status_code == 429:
                wait = RETRY_DELAY * (attempt + 1)
                print(f"  Rate limited (429), waiting {wait}s ...")
                time.sleep(wait)
            elif resp.status_code in (401, 403):
                print(f"  Auth failed ({resp.status_code}) — cookie may have expired.")
                return None
            else:
                print(f"  HTTP {resp.status_code}, retrying ({attempt+1}/{MAX_RETRIES}) ...")
                time.sleep(RETRY_DELAY)
        except requests.RequestException as e:
            print(f"  Request error: {e}, retrying ({attempt+1}/{MAX_RETRIES}) ...")
            time.sleep(RETRY_DELAY)
    print(f"  Failed after {MAX_RETRIES} retries.")
    return None

def save_json(data, filepath):
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def load_json(filepath):
    if os.path.exists(filepath):
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    return None

# ============ ARTICLE TEXT EXTRACTION ============

def extract_article_text(html):
    """Extract the main article text from a xueqiu.com article page."""
    # Try to find article content in known xueqiu HTML patterns.
    # The full article is typically in <div class="article__bd"> or
    # embedded in a script tag as JSON.

    # Pattern 1: Look for SNOWMAN_STATUS or similar embedded JSON
    m = re.search(r'SNOWMAN_STATUS\s*=\s*({.*?});\s*\n', html, re.DOTALL)
    if m:
        try:
            data = json.loads(m.group(1))
            text = data.get("text", "") or data.get("description", "")
            if text:
                return clean_html(text)
        except json.JSONDecodeError:
            pass

    # Pattern 2: state JSON embedded in <script>
    m = re.search(r'window\.SNOWMAN_STATUS\s*=\s*({.*?});', html, re.DOTALL)
    if m:
        try:
            data = json.loads(m.group(1))
            text = data.get("text", "") or data.get("description", "")
            if text:
                return clean_html(text)
        except json.JSONDecodeError:
            pass

    # Pattern 3: article__bd div
    m = re.search(r'<div[^>]*class="[^"]*article__bd[^"]*"[^>]*>(.*?)</div>\s*<(?:div|article)', html, re.DOTALL)
    if m:
        return clean_html(m.group(1))

    # Pattern 4: detail__content
    m = re.search(r'<div[^>]*class="[^"]*detail__content[^"]*"[^>]*>(.*?)</div>', html, re.DOTALL)
    if m:
        return clean_html(m.group(1))

    # Pattern 5: Generic article tag
    m = re.search(r'<article[^>]*>(.*?)</article>', html, re.DOTALL)
    if m:
        return clean_html(m.group(1))

    # Pattern 6: Try to find any large text block in a known content area
    m = re.search(r'class="[^"]*content[^"]*"[^>]*>(.*?)</div>', html, re.DOTALL)
    if m:
        text = clean_html(m.group(1))
        if len(text) > 100:
            return text

    return ""

def clean_html(raw):
    """Strip HTML tags and decode entities."""
    # Remove scripts and styles
    raw = re.sub(r'<(script|style)[^>]*>.*?</\1>', '', raw, flags=re.DOTALL)
    # Replace <br> with newlines
    raw = re.sub(r'<br\s*/?>', '\n', raw)
    # Replace <p> and block elements with newlines
    raw = re.sub(r'</?(?:p|div|h\d|li|tr)[^>]*>', '\n', raw)
    # Remove remaining HTML tags
    raw = re.sub(r'<[^>]+>', '', raw)
    # Decode HTML entities
    raw = unescape(raw)
    # Collapse whitespace
    raw = re.sub(r'\n{3,}', '\n\n', raw)
    raw = re.sub(r'[ \t]+', ' ', raw)
    raw = re.sub(r' *\n *', '\n', raw)
    return raw.strip()

# ============ PHASE 1: TIMELINE ============

def fetch_timeline(session):
    """Fetch all pages of the user's timeline. Returns list of status objects."""
    print("=" * 60)
    print(f"Phase 1: Fetching timeline for user {USER_ID}")
    print("=" * 60)

    # Fetch first page to get total pages
    ts = int(time.time() * 1000)
    url = f"https://xueqiu.com/v4/statuses/user_timeline.json?page=1&user_id={USER_ID}&type=0&_={ts}"
    print(f"\nFetching page 1 ...")
    resp = api_get(session, url, referer=f"https://xueqiu.com/u/{USER_ID}")
    if not resp:
        print("[FATAL] Failed to fetch first page.")
        sys.exit(1)

    data = resp.json()
    max_page = data.get("maxPage", 1)
    total = data.get("total", 0)
    all_statuses = data.get("statuses", [])

    print(f"  Got {len(all_statuses)} statuses. maxPage={max_page}, total={total}")

    # Fetch remaining pages
    for page in range(2, max_page + 1):
        rand_delay(DELAY_MIN, DELAY_MAX)
        ts = int(time.time() * 1000)
        url = f"https://xueqiu.com/v4/statuses/user_timeline.json?page={page}&user_id={USER_ID}&type=0&_={ts}"
        print(f"\nFetching page {page}/{max_page} ...")
        resp = api_get(session, url, referer=f"https://xueqiu.com/u/{USER_ID}")
        if not resp:
            print(f"  [WARN] Skipping page {page} due to error.")
            continue

        page_data = resp.json()
        statuses = page_data.get("statuses", [])
        all_statuses.extend(statuses)
        print(f"  Got {len(statuses)} statuses (total so far: {len(all_statuses)})")

    print(f"\nTimeline done. Total posts: {len(all_statuses)}")
    return all_statuses

# ============ PHASE 2: ARTICLE CONTENT ============

def fetch_article(session, status):
    """Fetch the full article HTML page and extract text."""
    target = status.get("target", "")
    if not target:
        return ""
    url = f"https://xueqiu.com{target}"
    resp = api_get(session, url, referer=f"https://xueqiu.com/u/{USER_ID}")
    if not resp:
        return ""
    return extract_article_text(resp.text)

# ============ PHASE 3: COMMENTS ============

def fetch_comments(session, status_id):
    """Fetch all pages of comments for a given status."""
    all_comments = []
    max_id = -1
    page = 1
    while True:
        url = f"https://xueqiu.com/statuses/v3/comments.json?id={status_id}&type=4&size=20&max_id={max_id}"
        resp = api_get(session, url, referer=f"https://xueqiu.com/{USER_ID}/{status_id}")
        if not resp:
            break

        data = resp.json()
        comments = data.get("comments", [])
        all_comments.extend(comments)
        next_max_id = data.get("next_max_id")

        print(f"    Comments page {page}: {len(comments)} comments (total: {len(all_comments)})")

        if not next_max_id or next_max_id == -1 or next_max_id == "-1":
            break
        max_id = next_max_id
        page += 1
        rand_delay(1.5, 3.0)

    return all_comments

# ============ MAIN ============

def main():
    print(f"Xueqiu Scraper — User {USER_ID}")
    print(f"Output: {os.path.abspath(OUTPUT_DIR)}")
    print()

    cookie = load_cookie()
    session = get_session(cookie)

    # Create output dirs
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    posts_dir = os.path.join(OUTPUT_DIR, "posts")
    os.makedirs(posts_dir, exist_ok=True)

    # Load progress
    progress_path = os.path.join(OUTPUT_DIR, "progress.json")
    progress = load_json(progress_path) or {"completed_ids": [], "phase": "timeline"}

    # ---- Phase 1: Timeline ----
    timeline_path = os.path.join(OUTPUT_DIR, "timeline.json")
    if progress["phase"] == "timeline" or not os.path.exists(timeline_path):
        statuses = fetch_timeline(session)
        save_json(statuses, timeline_path)
        progress["phase"] = "posts"
        progress["total_posts"] = len(statuses)
        progress["post_ids"] = [s["id"] for s in statuses]
        save_json(progress, progress_path)
        print(f"\nSaved {len(statuses)} posts to {timeline_path}")
    else:
        statuses = load_json(timeline_path)
        print(f"Loaded {len(statuses)} posts from existing timeline.json")

    # ---- Phase 2 & 3: Articles + Comments ----
    completed = set(progress.get("completed_ids", []))
    todo = [s for s in statuses if s["id"] not in completed]

    print(f"\n{'=' * 60}")
    print(f"Phase 2: Fetching articles + comments for {len(todo)} posts ({len(completed)} already done)")
    print(f"{'=' * 60}")

    for i, status in enumerate(todo):
        sid = status["id"]
        title = status.get("title", "") or (status.get("description", "")[:60])
        print(f"\n[{i+1}/{len(todo)}] Post {sid}: {title}")

        # Fetch article
        rand_delay(INTER_POST_DELAY[0], INTER_POST_DELAY[1])
        print(f"  Fetching article ...")
        article_text = fetch_article(session, status)
        if article_text:
            print(f"  Article: {len(article_text)} chars")

        # Fetch comments
        rand_delay(1.0, 2.0)
        print(f"  Fetching comments ...")
        comments = fetch_comments(session, sid)

        # Build the per-post data file
        post_data = {
            "status": status,
            "article_text": article_text,
            "comments": comments,
            "fetched_at": datetime.now().isoformat(),
        }
        post_path = os.path.join(posts_dir, f"{sid}.json")
        save_json(post_data, post_path)

        # Update progress
        completed.add(sid)
        progress["completed_ids"] = sorted(list(completed))
        save_json(progress, progress_path)

        print(f"  Saved. (article={len(article_text)} chars, comments={len(comments)})")

    print(f"\n{'=' * 60}")
    print(f"Done! All {len(statuses)} posts processed.")
    print(f"Output: {os.path.abspath(OUTPUT_DIR)}")
    print(f"  timeline.json  — all post metadata")
    print(f"  posts/*.json   — per-post: full article text + comments")
    print(f"  progress.json  — resume state")
    print(f"{'=' * 60}")

if __name__ == "__main__":
    main()
