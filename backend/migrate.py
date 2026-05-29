"""
Migrate existing JSON post files into SQLite.
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from backend.db import init_db, upsert_post

POSTS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "output_4533843739", "posts")


def migrate():
    if not os.path.isdir(POSTS_DIR):
        print(f"Posts directory not found: {POSTS_DIR}")
        sys.exit(1)

    init_db()

    files = sorted(
        [f for f in os.listdir(POSTS_DIR) if f.endswith(".json")],
        key=lambda x: int(x.replace(".json", "")),
    )

    for i, fname in enumerate(files):
        filepath = os.path.join(POSTS_DIR, fname)
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)

        status = data.get("status", {})
        article_text = data.get("article_text", "")
        comments = data.get("comments", [])
        scraped_at = data.get("fetched_at", "")

        upsert_post(status, article_text, comments, scraped_at)
        print(f"[{i+1}/{len(files)}] Migrated post {status.get('id')}: {status.get('title', '')[:40]}")

    print(f"\nDone. {len(files)} posts migrated to SQLite.")


if __name__ == "__main__":
    migrate()
