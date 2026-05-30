use crate::db::{Database, PostDetail, PostListItem, UserStats};
use crate::scraper::Scraper;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::Emitter;
use tauri::Manager;

fn emit_err(e: tauri::Error) -> String {
    e.to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScrapeProgress {
    pub page: i64,
    pub total_posts: i64,
    pub status: String,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AppSettings {
    pub cookie: String,
    pub user_id: String,
}

// ---- Commands ----

#[tauri::command]
pub fn get_posts(
    db: tauri::State<'_, Database>,
    search: Option<String>,
    user_id: Option<i64>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<PostListItem>, String> {
    db.get_posts(search.as_deref(), user_id, limit.unwrap_or(500), offset.unwrap_or(0))
}

#[tauri::command]
pub fn get_user_ids(db: tauri::State<'_, Database>) -> Result<Vec<i64>, String> {
    db.get_user_ids()
}

#[tauri::command]
pub fn get_post(
    db: tauri::State<'_, Database>,
    post_id: i64,
) -> Result<Option<PostDetail>, String> {
    db.get_post(post_id)
}

#[tauri::command]
pub fn get_post_count(db: tauri::State<'_, Database>) -> Result<i64, String> {
    db.get_post_count()
}

#[tauri::command]
pub fn refresh_post(
    db: tauri::State<'_, Database>,
    post_id: i64,
) -> Result<PostDetail, String> {
    let (target, status, old_text) = {
        let detail = db.get_post(post_id)?;
        match detail {
            None => return Err("Post not found".into()),
            Some(d) => (d.post.target.clone(), d.post.raw_status.clone(), d.post.article_text.clone()),
        }
    };

    if target.is_empty() {
        return Err("Missing target URL".into());
    }

    let cookie = db.get_setting("cookie").ok().flatten();

    let scraper = Scraper::new(cookie.as_deref())?;

    let (mut article_text, meta) = scraper.fetch_article(&target)?;
    let comments = scraper.fetch_comments(post_id)?;

    // If the fetched text is empty or indicates the post was deleted,
    // keep the old text to avoid losing data.
    if article_text.trim().is_empty() || article_text.contains("已被作者删除") || article_text.contains("已被删除") {
        article_text = old_text;
    }

    // Merge status
    let mut status: Value = serde_json::from_str(&status).unwrap_or(Value::Null);
    if let Some(meta) = meta {
        if let Some(obj) = status.as_object_mut() {
            if let Some(meta_obj) = meta.as_object() {
                for (k, v) in meta_obj {
                    obj.insert(k.clone(), v.clone());
                }
            }
        }
    }

    let scraped_at = chrono::Utc::now().to_rfc3339();

    db.upsert_post(&status, &article_text, &comments, &scraped_at)?;
    db.log_scrape(post_id, "refresh", "success", &format!("Refreshed at {}", scraped_at))?;

    db.get_post(post_id)?
        .ok_or_else(|| "Failed to read back post".into())
}

#[tauri::command]
pub fn get_user_stats(db: tauri::State<'_, Database>) -> Result<Vec<UserStats>, String> {
    db.get_user_stats()
}

#[tauri::command]
pub fn delete_user_posts(db: tauri::State<'_, Database>, user_id: i64) -> Result<(i64, i64), String> {
    db.delete_user_posts(user_id)
}

#[tauri::command]
pub fn delete_post(db: tauri::State<'_, Database>, post_id: i64) -> Result<(), String> {
    log::info!("delete_post command called with post_id={}", post_id);
    let result = db.delete_post(post_id);
    log::info!("delete_post result for {}: {:?}", post_id, result.is_ok());
    result
}

#[tauri::command]
pub fn get_settings(db: tauri::State<'_, Database>) -> Result<AppSettings, String> {
    let cookie = db.get_setting("cookie").ok().flatten().unwrap_or_default();
    let user_id = db.get_setting("user_id").ok().flatten().unwrap_or_default();
    Ok(AppSettings { cookie, user_id })
}

#[tauri::command]
pub fn save_settings(
    db: tauri::State<'_, Database>,
    cookie: String,
    user_id: String,
) -> Result<(), String> {
    db.set_setting("cookie", &cookie)?;
    db.set_setting("user_id", &user_id)?;
    Ok(())
}

#[tauri::command]
pub async fn scrape_timeline(
    app: tauri::AppHandle,
    db: tauri::State<'_, Database>,
    user_id: String,
    max_pages: Option<i64>,
) -> Result<String, String> {
    let cookie = db.get_setting("cookie").ok().flatten().unwrap_or_default();

    if cookie.is_empty() {
        return Err("No cookie set. Please set your xueqiu cookie first.".into());
    }

    app.emit("scrape-progress", ScrapeProgress {
        page: 0,
        total_posts: 0,
        status: "running".into(),
        message: "Fetching timeline...".into(),
    })
    .map_err(emit_err)?;

    // Run all blocking HTTP + DB work inside spawn_blocking to avoid
    // blocking the async runtime and to prevent reqwest's internal tokio
    // from conflicting with Tauri's runtime.
    let app2 = app.clone();
    let user_id2 = user_id.clone();

    let msg = tokio::task::spawn_blocking(move || {
        let db = app2.state::<Database>();
        let scraper = Scraper::new(Some(&cookie))?;

        let statuses = scraper.fetch_timeline(&user_id2, max_pages)?;
        let total = statuses.len();

        app2.emit("scrape-progress", ScrapeProgress {
            page: 0,
            total_posts: total as i64,
            status: "running".into(),
            message: format!("Fetched {} posts, now scraping articles and comments...", total),
        })
        .map_err(emit_err)?;

        let mut new_count = 0;
        for (i, status) in statuses.iter().enumerate() {
            let post_id = status["id"].as_i64().unwrap_or(0);
            let target = status["target"].as_str().unwrap_or("");

            if let Ok(Some(_)) = db.get_post(post_id) {
                log::info!("Post {} already in DB, skip", post_id);
                continue;
            }

            let (article_text, _meta) = if !target.is_empty() {
                match scraper.fetch_article(target) {
                    Ok(r) => r,
                    Err(e) => {
                        log::warn!("Failed to fetch article for {}: {}", post_id, e);
                        (String::new(), None)
                    }
                }
            } else {
                (String::new(), None)
            };

            scraper.rand_sleep(0.5, 1.5);

            let comments = scraper.fetch_comments(post_id).unwrap_or_default();
            let scraped_at = chrono::Utc::now().to_rfc3339();

            db.upsert_post(status, &article_text, &comments, &scraped_at)?;
            db.log_scrape(post_id, "scrape", "success", "Scraped")?;

            new_count += 1;

            app2.emit("scrape-progress", ScrapeProgress {
                page: (i + 1) as i64,
                total_posts: total as i64,
                status: "running".into(),
                message: format!("Scraped {}/{} posts...", i + 1, total),
            })
            .map_err(emit_err)?;

            scraper.rand_sleep(2.0, 5.0);
        }

        Ok::<String, String>(format!(
            "Done! {} new posts scraped ({} total in timeline).",
            new_count, total
        ))
    })
    .await
    .map_err(|e| e.to_string())??;

    app.emit("scrape-progress", ScrapeProgress {
        page: 0,
        total_posts: 0,
        status: "done".into(),
        message: msg.clone(),
    })
    .map_err(emit_err)?;

    Ok(msg)
}
