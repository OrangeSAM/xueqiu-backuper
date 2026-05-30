use rand::Rng;
use regex::Regex;
use reqwest::header::{HeaderMap, HeaderValue, USER_AGENT};
use serde_json::Value;
use std::time::Duration;

const XUEQIU: &str = "https://xueqiu.com";
const USER_AGENT_STR: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

pub struct Scraper {
    client: reqwest::blocking::Client,
}

impl Scraper {
    pub fn new(cookie: Option<&str>) -> Result<Self, String> {
        let mut headers = HeaderMap::new();
        headers.insert(USER_AGENT, HeaderValue::from_static(USER_AGENT_STR));
        headers.insert("Accept", HeaderValue::from_static("text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"));
        headers.insert("Accept-Language", HeaderValue::from_static("zh-CN,zh;q=0.9,en;q=0.8"));

        if let Some(c) = cookie {
            headers.insert("Cookie", HeaderValue::from_str(c).map_err(|e| e.to_string())?);
            let preview: String = c.chars().take(80).collect();
            log::info!("Cookie (first 80 chars): {}...", preview);
        }

        let client = reqwest::blocking::Client::builder()
            .default_headers(headers)
            .timeout(Duration::from_secs(30))
            .cookie_store(true)
            .build()
            .map_err(|e| e.to_string())?;

        // Pre-warm: visit xueqiu.com homepage to get session cookies
        if let Err(e) = client.get(XUEQIU).send() {
            log::warn!("Pre-warm request to xueqiu.com failed (non-fatal): {}", e);
        }

        Ok(Scraper { client })
    }

    pub fn rand_sleep(&self, lo: f64, hi: f64) {
        let mut rng = rand::thread_rng();
        let secs = rng.gen_range(lo..hi);
        std::thread::sleep(Duration::from_secs_f64(secs));
    }

    pub fn fetch_timeline(
        &self,
        user_id: &str,
        max_pages: Option<i64>,
    ) -> Result<Vec<Value>, String> {
        let mut all_statuses: Vec<Value> = Vec::new();
        let mut page: i64 = 1;
        let mut total_pages: i64 = i64::MAX;

        loop {
            let ts = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis();

            let url = format!(
                "{}/v4/statuses/user_timeline.json?user_id={}&type=0&page={}&_={}",
                XUEQIU, user_id, page, ts
            );

            let resp = self
                .client
                .get(&url)
                .header("Referer", format!("{}/u/{}", XUEQIU, user_id))
                .header("X-Requested-With", "XMLHttpRequest")
                .send()
                .map_err(|e| format!("Timeline request failed: {}", e))?;

            if resp.status() != 200 {
                let status = resp.status();
                let body = resp.text().unwrap_or_default();
                let preview: String = body.chars().take(300).collect();
                return Err(format!("HTTP {} fetching timeline: {}", status, preview));
            }

            let data: Value = resp.json().map_err(|e: reqwest::Error| e.to_string())?;
            let statuses = data["statuses"].as_array().cloned().unwrap_or_default();
            let count = statuses.len();
            all_statuses.extend(statuses);

            // This API uses page-based pagination: response has "page" and "maxPage"
            total_pages = data["maxPage"].as_i64().unwrap_or(total_pages);
            if page == 1 {
                log::info!("Timeline: maxPage={}, total posts will be ~{}", total_pages, total_pages * 20);
            }
            log::info!("Page {}/{}: got {} posts, total collected={}", page, total_pages, count, all_statuses.len());

            if count == 0 || page >= total_pages {
                break;
            }

            if let Some(max) = max_pages {
                if page >= max {
                    break;
                }
            }

            page += 1;
            self.rand_sleep(0.8, 2.0);
        }

        Ok(all_statuses)
    }

    pub fn fetch_article(&self, target: &str) -> Result<(String, Option<Value>), String> {
        let url = format!("{}{}", XUEQIU, target);
        let resp = self
            .client
            .get(&url)
            .header("Referer", format!("{}/", XUEQIU))
            .send()
            .map_err(|e| format!("Article request failed: {}", e))?;

        if resp.status() != 200 {
            return Err(format!("HTTP {}", resp.status()));
        }

        let html = resp.text().map_err(|e| e.to_string())?;
        extract_article_text(&html)
    }

    pub fn fetch_user_info(&self, user_id: &str) -> Result<Value, String> {
        let url = format!("{}/statuses/original/show.json?user_id={}", XUEQIU, user_id);
        let resp = self
            .client
            .get(&url)
            .header("Referer", format!("{}/u/{}", XUEQIU, user_id))
            .header("X-Requested-With", "XMLHttpRequest")
            .send()
            .map_err(|e| format!("User info request failed: {}", e))?;

        if resp.status() != 200 {
            return Err(format!("HTTP {}", resp.status()));
        }

        resp.json().map_err(|e| e.to_string())
    }

    pub fn fetch_comments(&self, status_id: i64) -> Result<Vec<Value>, String> {
        let mut all_comments: Vec<Value> = Vec::new();
        let mut max_id: i64 = -1;

        loop {
            let url = format!(
                "{}/statuses/v3/comments.json?id={}&type=4&size=20&max_id={}",
                XUEQIU, status_id, max_id
            );

            let resp = self
                .client
                .get(&url)
                .header("Referer", format!("{}/", XUEQIU))
                .send()
                .map_err(|e| format!("Comments request failed: {}", e))?;

            if resp.status() != 200 {
                break;
            }

            let data: Value = resp.json().map_err(|e: reqwest::Error| e.to_string())?;
            let comments = data["comments"].as_array().cloned().unwrap_or_default();
            all_comments.extend(comments);

            let next_id = data["next_max_id"]
                .as_i64()
                .or_else(|| data["next_max_id"].as_str().and_then(|s: &str| s.parse::<i64>().ok()))
                .unwrap_or(-1);

            if next_id == -1 {
                break;
            }

            max_id = next_id;
            self.rand_sleep(0.8, 1.5);
        }

        Ok(all_comments)
    }
}

fn clean_html(raw: &str) -> String {
    // Remove script/style tags
    let re_script = Regex::new(r"<(?i)script[^>]*>.*?</(?i)script>").unwrap();
    let re_style = Regex::new(r"<(?i)style[^>]*>.*?</(?i)style>").unwrap();
    let mut text = re_script.replace_all(raw, "").to_string();
    text = re_style.replace_all(&text, "").to_string();

    // br → newline
    let re_br = Regex::new(r"<br\s*/?>").unwrap();
    text = re_br.replace_all(&text, "\n").to_string();

    // Block elements → newline
    let re_block = Regex::new(r"</?(?:p|div|h\d|li|tr)[^>]*>").unwrap();
    text = re_block.replace_all(&text, "\n").to_string();

    // Remove remaining tags
    let re_tag = Regex::new(r"<[^>]+>").unwrap();
    text = re_tag.replace_all(&text, "").to_string();

    // HTML entities
    text = text.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ");

    // Collapse whitespace
    let re_multi_nl = Regex::new(r"\n{3,}").unwrap();
    text = re_multi_nl.replace_all(&text, "\n\n").to_string();
    let re_spaces = Regex::new(r"[ \t]+").unwrap();
    text = re_spaces.replace_all(&text, " ").to_string();
    let re_line_sp = Regex::new(r" *\n *").unwrap();
    text = re_line_sp.replace_all(&text, "\n").to_string();

    text.trim().to_string()
}

fn extract_article_text(html: &str) -> Result<(String, Option<Value>), String> {
    // SNOWMAN_STATUS
    let re_snow = Regex::new(r"SNOWMAN_STATUS\s*=\s*(\{.*?\});\s*\n").unwrap();
    let re_snow_win = Regex::new(r"window\.SNOWMAN_STATUS\s*=\s*(\{.*?\});").unwrap();

    for re in [&re_snow, &re_snow_win] {
        if let Some(caps) = re.captures(html) {
            if let Ok(data) = serde_json::from_str::<Value>(&caps[1]) {
                let text = data["text"]
                    .as_str()
                    .or_else(|| data["description"].as_str())
                    .unwrap_or("");
                if !text.is_empty() {
                    return Ok((clean_html(text), Some(data)));
                }
            }
        }
    }

    // article__bd
    let re_article = Regex::new(r#"<div[^>]*class="[^"]*article__bd[^"]*"[^>]*>(.*?)</div>\s*<(?:div|article)"#).unwrap();
    if let Some(caps) = re_article.captures(html) {
        return Ok((clean_html(&caps[1]), None));
    }

    // detail__content
    let re_detail = Regex::new(r#"<div[^>]*class="[^"]*detail__content[^"]*"[^>]*>(.*?)</div>"#).unwrap();
    if let Some(caps) = re_detail.captures(html) {
        return Ok((clean_html(&caps[1]), None));
    }

    Ok((String::new(), None))
}
