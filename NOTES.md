# 雪球备份 开发笔记

## 技术栈

Tauri v2 + Rust + SQLite + Vanilla JS (Vite 打包)

## 数据流

```
雪球 API → reqwest blocking HTTP → Scraper → SQLite → Tauri IPC → 前端渲染
```

## 数据库

`~/Library/Application Support/雪球备份/xueqiu_viewer.db`，WAL 模式。

- **posts** — 帖子正文、元信息、raw_status JSON
- **comments** — 扁平存储，parent_comment_id 关联，读取时 build_comment_tree 还原嵌套
- **settings** — key/value 存 cookie 和 user_id
- **scrape_log** — 抓取/刷新日志

## 分页机制

Timeline API 返回 `maxPage` 和 `page` 字段，用 `?page=1,2,3...` 翻页，**不是**游标分页。之前读不存在的 `next_max_id` 导致永远只拿到第一页。

## 已踩过的坑

### WKWebView 不支持 confirm / alert / prompt

Tauri macOS 的 WKWebView 不会弹出原生对话框，`confirm()` 静默返回 `false`。必须用自定义 HTML 弹窗 + Promise 替代。

### reqwest blocking 不能在 async 里直接跑

`reqwest::blocking::Client` 内部有自己的 tokio runtime，和 Tauri 的 runtime 冲突会 panic。必须用 `tokio::task::spawn_blocking` 包装。在 blocking 闭包里通过 `app.state::<Database>()` 访问 state。

### Cookie 覆盖 default_headers

Scraper::new 里先后调了两次 `builder.default_headers()`，第二次把第一次设的 UA / Accept 全冲掉了，导致 HTTP 400。所有 header 必须放进同一个 HeaderMap。

### 刷新会覆盖原文

refresh_post 的 upsert 用新抓到的空内容（帖被删了）覆盖旧数据。修复：article_text 为空或含"已被删除"时保留旧文。

### 主 DB 文件可做紧急恢复

WAL checkpoint 未完成前，.db 文件还存着旧数据。拷贝 .db 单独打开可读到 checkpoint 前的状态。
