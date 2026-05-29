"""
SQLite database layer for xueqiu posts and comments.
"""

import sqlite3
import json
import os
from datetime import datetime
from typing import Optional

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "xueqiu_viewer.db")


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    conn = get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            article_text TEXT NOT NULL DEFAULT '',
            created_at INTEGER NOT NULL DEFAULT 0,
            like_count INTEGER NOT NULL DEFAULT 0,
            fav_count INTEGER NOT NULL DEFAULT 0,
            retweet_count INTEGER NOT NULL DEFAULT 0,
            reply_count INTEGER NOT NULL DEFAULT 0,
            comment_count INTEGER NOT NULL DEFAULT 0,
            source TEXT NOT NULL DEFAULT '',
            target TEXT NOT NULL DEFAULT '',
            raw_status TEXT NOT NULL DEFAULT '{}',
            scraped_at TEXT NOT NULL DEFAULT '',
            refreshed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS comments (
            id INTEGER NOT NULL,
            post_id INTEGER NOT NULL,
            parent_comment_id INTEGER,
            user_id INTEGER NOT NULL DEFAULT 0,
            screen_name TEXT NOT NULL DEFAULT '',
            text TEXT NOT NULL DEFAULT '',
            like_count INTEGER NOT NULL DEFAULT 0,
            reply_count INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL DEFAULT 0,
            raw_json TEXT NOT NULL DEFAULT '{}',
            PRIMARY KEY (id, post_id),
            FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);
        CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_comment_id);
        CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id);

        CREATE TABLE IF NOT EXISTS scrape_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            status TEXT NOT NULL,
            message TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
    """)
    conn.commit()
    conn.close()


# ---- Post CRUD ----

def upsert_post(status: dict, article_text: str, comments: list, scraped_at: str = None):
    """Insert or update a post and its comments."""
    if scraped_at is None:
        scraped_at = datetime.now().isoformat()

    conn = get_conn()
    try:
        conn.execute("""
            INSERT INTO posts (id, user_id, title, description, article_text,
                created_at, like_count, fav_count, retweet_count, reply_count,
                comment_count, source, target, raw_status, scraped_at, refreshed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                description = excluded.description,
                article_text = excluded.article_text,
                like_count = excluded.like_count,
                fav_count = excluded.fav_count,
                retweet_count = excluded.retweet_count,
                reply_count = excluded.reply_count,
                comment_count = excluded.comment_count,
                source = excluded.source,
                raw_status = excluded.raw_status,
                refreshed_at = excluded.refreshed_at
        """, (
            status.get("id"),
            status.get("user_id", 0),
            status.get("title", ""),
            status.get("description", ""),
            article_text,
            status.get("created_at", 0),
            status.get("like_count", 0),
            status.get("fav_count", 0),
            status.get("retweet_count", 0),
            status.get("reply_count", 0),
            len(comments),
            status.get("source", ""),
            status.get("target", ""),
            json.dumps(status, ensure_ascii=False),
            scraped_at,
            scraped_at,
        ))

        # Delete old comments and re-insert
        conn.execute("DELETE FROM comments WHERE post_id = ?", (status["id"],))
        _insert_comments(conn, comments, status["id"], None)
        conn.commit()
    finally:
        conn.close()


def _insert_comments(conn, comments: list, post_id: int, parent_id: Optional[int]):
    for c in comments:
        children = c.pop("child_comments", []) or []
        conn.execute("""
            INSERT OR REPLACE INTO comments
                (id, post_id, parent_comment_id, user_id, screen_name, text,
                 like_count, reply_count, created_at, raw_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            c.get("id"),
            post_id,
            parent_id,
            c.get("user_id", 0),
            c.get("user", {}).get("screen_name", "") if isinstance(c.get("user"), dict) else "",
            c.get("text") or c.get("description", ""),
            c.get("like_count", 0),
            c.get("reply_count", 0),
            c.get("created_at", 0),
            json.dumps(c, ensure_ascii=False),
        ))
        if children:
            _insert_comments(conn, children, post_id, c["id"])


def get_posts(search: str = None, limit: int = 500, offset: int = 0):
    conn = get_conn()
    try:
        if search:
            rows = conn.execute(
                "SELECT * FROM posts WHERE title LIKE ? OR description LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
                (f"%{search}%", f"%{search}%", limit, offset),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM posts ORDER BY created_at DESC LIMIT ? OFFSET ?",
                (limit, offset),
            ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_post(post_id: int):
    conn = get_conn()
    try:
        post = conn.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone()
        if not post:
            return None
        comments = conn.execute(
            "SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC",
            (post_id,),
        ).fetchall()
        return {
            "post": dict(post),
            "comments": _build_comment_tree([dict(c) for c in comments]),
        }
    finally:
        conn.close()


def _build_comment_tree(comments: list) -> list:
    """Reconstruct nested comment tree from flat list using parent_comment_id."""
    by_parent: dict = {}
    roots = []
    for c in comments:
        pid = c.get("parent_comment_id")
        if pid is None:
            roots.append(c)
        else:
            by_parent.setdefault(pid, []).append(c)

    def attach_children(comment):
        children = by_parent.get(comment["id"], [])
        comment["child_comments"] = children
        for child in children:
            attach_children(child)
        return comment

    result = []
    for r in roots:
        attach_children(r)
        # Clean up SQL fields not needed by frontend
        r.pop("parent_comment_id", None)
        r.pop("raw_json", None)
        r.pop("post_id", None)
        result.append(r)
    return result


def get_post_count():
    conn = get_conn()
    try:
        return conn.execute("SELECT COUNT(*) FROM posts").fetchone()[0]
    finally:
        conn.close()


def log_scrape(post_id: int, action: str, status: str, message: str = ""):
    conn = get_conn()
    try:
        conn.execute(
            "INSERT INTO scrape_log (post_id, action, status, message) VALUES (?, ?, ?, ?)",
            (post_id, action, status, message),
        )
        conn.commit()
    finally:
        conn.close()
