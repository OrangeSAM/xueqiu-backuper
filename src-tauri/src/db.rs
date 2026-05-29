use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

pub struct Database {
    pub conn: Mutex<Connection>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Post {
    pub id: i64,
    pub user_id: i64,
    pub title: String,
    pub description: String,
    pub article_text: String,
    pub created_at: i64,
    pub like_count: i64,
    pub fav_count: i64,
    pub retweet_count: i64,
    pub reply_count: i64,
    pub comment_count: i64,
    pub source: String,
    pub target: String,
    pub raw_status: String,
    pub scraped_at: String,
    pub refreshed_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Comment {
    pub id: i64,
    pub post_id: i64,
    pub parent_comment_id: Option<i64>,
    pub user_id: i64,
    pub screen_name: String,
    pub text: String,
    pub like_count: i64,
    pub reply_count: i64,
    pub created_at: i64,
    pub raw_json: String,
    #[serde(default)]
    pub child_comments: Vec<Comment>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PostDetail {
    pub post: Post,
    pub comments: Vec<Comment>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PostListItem {
    pub id: i64,
    pub title: String,
    pub description: String,
    pub created_at: i64,
    pub like_count: i64,
    pub fav_count: i64,
    pub retweet_count: i64,
    pub reply_count: i64,
    pub comment_count: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ScrapeLog {
    pub id: i64,
    pub post_id: i64,
    pub action: String,
    pub status: String,
    pub message: String,
    pub created_at: String,
}

fn db_path() -> PathBuf {
    #[cfg(target_os = "macos")]
    let base = dirs_mac();
    #[cfg(target_os = "windows")]
    let base = dirs_win();
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let base = dirs_linux();

    std::fs::create_dir_all(&base).ok();
    base.join("xueqiu_viewer.db")
}

fn dirs_mac() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    PathBuf::from(home).join("Library/Application Support/雪球备份")
}

fn dirs_win() -> PathBuf {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".into());
    PathBuf::from(appdata).join("雪球备份")
}

fn dirs_linux() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    PathBuf::from(home).join(".local/share/雪球备份")
}

impl Database {
    pub fn new() -> Result<Self, String> {
        let path = db_path();
        log::info!("Database path: {:?}", path);

        let conn = Connection::open(&path).map_err(|e| e.to_string())?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .map_err(|e| e.to_string())?;

        let db = Database {
            conn: Mutex::new(conn),
        };
        db.init()?;
        Ok(db)
    }

    fn init(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute_batch(
            "
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

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL DEFAULT ''
            );
            ",
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    // ---- Posts ----

    pub fn get_posts(&self, search: Option<&str>, user_id: Option<i64>, limit: i64, offset: i64) -> Result<Vec<PostListItem>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        let (where_clause, _extra_param) = match (search, user_id) {
            (Some(_), Some(_)) => ("WHERE (title LIKE ? OR description LIKE ?) AND user_id = ? ", Some(3)),
            (Some(_), None) => ("WHERE title LIKE ? OR description LIKE ? ", None),
            (None, Some(_)) => ("WHERE user_id = ? ", None),
            (None, None) => ("", None),
        };

        let sql = format!(
            "SELECT id, title, description, created_at, like_count, fav_count, \
             retweet_count, reply_count, comment_count \
             FROM posts {} ORDER BY created_at DESC LIMIT ? OFFSET ?",
            where_clause
        );

        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

        let pattern = search.map(|q| format!("%{}%", q));

        let rows = match (pattern, user_id) {
            (Some(ref p), Some(uid)) => stmt.query_map(params![p, p, uid, limit, offset], map_post_row).map_err(|e| e.to_string())?,
            (Some(ref p), None) => stmt.query_map(params![p, p, limit, offset], map_post_row).map_err(|e| e.to_string())?,
            (None, Some(uid)) => stmt.query_map(params![uid, limit, offset], map_post_row).map_err(|e| e.to_string())?,
            (None, None) => stmt.query_map(params![limit, offset], map_post_row).map_err(|e| e.to_string())?,
        };

        let mut posts = Vec::new();
        for r in rows {
            posts.push(r.map_err(|e| e.to_string())?);
        }
        Ok(posts)
    }

    pub fn get_user_ids(&self) -> Result<Vec<i64>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT DISTINCT user_id FROM posts ORDER BY user_id")
            .map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| row.get(0)).map_err(|e| e.to_string())?;
        let mut ids = Vec::new();
        for r in rows {
            ids.push(r.map_err(|e| e.to_string())?);
        }
        Ok(ids)
    }

    pub fn get_post_count(&self) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.query_row("SELECT COUNT(*) FROM posts", [], |row| row.get(0))
            .map_err(|e| e.to_string())
    }

    pub fn get_post(&self, post_id: i64) -> Result<Option<PostDetail>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        let post = conn
            .query_row("SELECT * FROM posts WHERE id = ?", params![post_id], |row| {
                Ok(Post {
                    id: row.get(0)?,
                    user_id: row.get(1)?,
                    title: row.get(2)?,
                    description: row.get(3)?,
                    article_text: row.get(4)?,
                    created_at: row.get(5)?,
                    like_count: row.get(6)?,
                    fav_count: row.get(7)?,
                    retweet_count: row.get(8)?,
                    reply_count: row.get(9)?,
                    comment_count: row.get(10)?,
                    source: row.get(11)?,
                    target: row.get(12)?,
                    raw_status: row.get(13)?,
                    scraped_at: row.get(14)?,
                    refreshed_at: row.get(15)?,
                })
            })
            .ok();

        match post {
            None => Ok(None),
            Some(p) => {
                let mut stmt = conn
                    .prepare("SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC")
                    .map_err(|e| e.to_string())?;
                let rows = stmt
                    .query_map(params![post_id], |row| {
                        Ok(Comment {
                            id: row.get(0)?,
                            post_id: row.get(1)?,
                            parent_comment_id: row.get(2)?,
                            user_id: row.get(3)?,
                            screen_name: row.get(4)?,
                            text: row.get(5)?,
                            like_count: row.get(6)?,
                            reply_count: row.get(7)?,
                            created_at: row.get(8)?,
                            raw_json: row.get(9)?,
                            child_comments: Vec::new(),
                        })
                    })
                    .map_err(|e| e.to_string())?;
                let mut flat: Vec<Comment> = Vec::new();
                for r in rows {
                    flat.push(r.map_err(|e| e.to_string())?);
                }

                let tree = build_comment_tree(flat);
                Ok(Some(PostDetail {
                    post: p,
                    comments: tree,
                }))
            }
        }
    }

    pub fn upsert_post(
        &self,
        status: &serde_json::Value,
        article_text: &str,
        comments: &[serde_json::Value],
        scraped_at: &str,
    ) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        conn.execute(
            "INSERT INTO posts (id, user_id, title, description, article_text,
                created_at, like_count, fav_count, retweet_count, reply_count,
                comment_count, source, target, raw_status, scraped_at, refreshed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
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
                refreshed_at = excluded.refreshed_at",
            params![
                status.get("id").and_then(|v| v.as_i64()),
                status.get("user_id").and_then(|v| v.as_i64()).unwrap_or(0),
                status.get("title").and_then(|v| v.as_str()).unwrap_or(""),
                status.get("description").and_then(|v| v.as_str()).unwrap_or(""),
                article_text,
                status.get("created_at").and_then(|v| v.as_i64()).unwrap_or(0),
                status.get("like_count").and_then(|v| v.as_i64()).unwrap_or(0),
                status.get("fav_count").and_then(|v| v.as_i64()).unwrap_or(0),
                status.get("retweet_count").and_then(|v| v.as_i64()).unwrap_or(0),
                status.get("reply_count").and_then(|v| v.as_i64()).unwrap_or(0),
                comments.len() as i64,
                status.get("source").and_then(|v| v.as_str()).unwrap_or(""),
                status.get("target").and_then(|v| v.as_str()).unwrap_or(""),
                serde_json::to_string(status).unwrap_or_else(|_| "{}".into()),
                scraped_at,
                scraped_at,
            ],
        )
        .map_err(|e| e.to_string())?;

        conn.execute("DELETE FROM comments WHERE post_id = ?", params![status.get("id").and_then(|v| v.as_i64())])
            .map_err(|e| e.to_string())?;

        insert_comments_raw(&conn, comments, status.get("id").and_then(|v| v.as_i64()).unwrap_or(0), None)?;
        Ok(())
    }

    pub fn log_scrape(&self, post_id: i64, action: &str, status: &str, message: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO scrape_log (post_id, action, status, message) VALUES (?1, ?2, ?3, ?4)",
            params![post_id, action, status, message],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    // ---- Settings ----

    pub fn get_setting(&self, key: &str) -> Result<Option<String>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.query_row("SELECT value FROM settings WHERE key = ?", params![key], |row| {
            row.get(0)
        })
        .ok()
        .ok_or_else(|| "".into()) // just return empty
        .map(|v: String| if v.is_empty() { None } else { Some(v) })
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }
}

fn map_post_row(row: &rusqlite::Row) -> rusqlite::Result<PostListItem> {
    Ok(PostListItem {
        id: row.get(0)?,
        title: row.get(1)?,
        description: row.get(2)?,
        created_at: row.get(3)?,
        like_count: row.get(4)?,
        fav_count: row.get(5)?,
        retweet_count: row.get(6)?,
        reply_count: row.get(7)?,
        comment_count: row.get(8)?,
    })
}

fn insert_comments_raw(
    conn: &Connection,
    comments: &[serde_json::Value],
    post_id: i64,
    parent_id: Option<i64>,
) -> Result<(), String> {
    for c in comments {
        let id = c.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
        let user_id = c.get("user_id").and_then(|v| v.as_i64()).unwrap_or(0);
        let screen_name = c
            .get("user")
            .and_then(|u| u.get("screen_name"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let text = c
            .get("text")
            .or_else(|| c.get("description"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let like_count = c.get("like_count").and_then(|v| v.as_i64()).unwrap_or(0);
        let reply_count = c.get("reply_count").and_then(|v| v.as_i64()).unwrap_or(0);
        let created_at = c.get("created_at").and_then(|v| v.as_i64()).unwrap_or(0);

        // Remove child_comments from raw_json before storing to avoid duplication
        let mut raw = c.clone();
        if let Some(obj) = raw.as_object_mut() {
            obj.remove("child_comments");
        }
        let raw_json = serde_json::to_string(&raw).unwrap_or_else(|_| "{}".into());

        conn.execute(
            "INSERT OR REPLACE INTO comments
                (id, post_id, parent_comment_id, user_id, screen_name, text,
                 like_count, reply_count, created_at, raw_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                id, post_id, parent_id, user_id, screen_name, text,
                like_count, reply_count, created_at, raw_json
            ],
        )
        .map_err(|e| e.to_string())?;

        let children = c.get("child_comments").and_then(|v| v.as_array());
        if let Some(kids) = children {
            if !kids.is_empty() {
                insert_comments_raw(conn, kids, post_id, Some(id))?;
            }
        }
    }
    Ok(())
}

fn build_comment_tree(flat: Vec<Comment>) -> Vec<Comment> {
    let mut by_parent: std::collections::HashMap<i64, Vec<Comment>> = std::collections::HashMap::new();
    let mut roots: Vec<Comment> = Vec::new();

    for c in flat {
        match c.parent_comment_id {
            None => roots.push(c),
            Some(pid) => by_parent.entry(pid).or_default().push(c),
        }
    }

    fn attach_children(comment: &mut Comment, by_parent: &std::collections::HashMap<i64, Vec<Comment>>) {
        if let Some(children) = by_parent.get(&comment.id) {
            comment.child_comments = children.clone();
            for child in &mut comment.child_comments {
                attach_children(child, by_parent);
            }
        }
    }

    for root in &mut roots {
        attach_children(root, &by_parent);
    }

    roots
}
