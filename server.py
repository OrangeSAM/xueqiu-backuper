#!/usr/bin/env python3
"""Local server to browse scraped xueqiu posts."""

import json
import os
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

OUTPUT_DIR = "output_4533843739"
POSTS_DIR = os.path.join(OUTPUT_DIR, "posts")
PORT = 8899

# ---- Load timeline on startup ----
with open(os.path.join(OUTPUT_DIR, "timeline.json")) as f:
    TIMELINE = json.load(f)

# Deduplicate and build index
_seen = {}
POSTS = []
for s in TIMELINE:
    if s["id"] not in _seen:
        _seen[s["id"]] = True
        POSTS.append(s)
POSTS.sort(key=lambda s: s.get("created_at", 0), reverse=True)

print(f"Loaded {len(POSTS)} posts from timeline.json")

# ---- HTML template ----
HTML = r"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>雪球帖子浏览器</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0f1117;color:#c9d1d9;height:100vh;display:flex}
#sidebar{width:380px;min-width:380px;border-right:1px solid #21262d;display:flex;flex-direction:column;background:#161b22}
#search{padding:12px}
#search input{width:100%;padding:8px 12px;border:1px solid #30363d;border-radius:6px;background:#0d1117;color:#c9d1d9;font-size:13px;outline:none}
#search input:focus{border-color:#58a6ff}
#stats{padding:0 12px 8px;font-size:12px;color:#8b949e}
#list{flex:1;overflow-y:auto}
.post-item{padding:10px 12px;border-bottom:1px solid #21262d;cursor:pointer;transition:background .15s}
.post-item:hover{background:#1c2128}
.post-item.active{background:#1f2937;border-left:3px solid #58a6ff;padding-left:9px}
.post-item .title{font-size:13px;font-weight:600;color:#e6edf3;margin-bottom:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.post-item .meta{font-size:11px;color:#8b949e;display:flex;gap:12px}
#main{flex:1;display:flex;flex-direction:column;overflow:hidden}
#article{flex:1;overflow-y:auto;padding:24px 32px;max-width:860px}
#empty{display:flex;align-items:center;justify-content:center;height:100%;color:#484f58;font-size:15px}
.art-title{font-size:22px;font-weight:700;color:#f0f6fc;margin-bottom:8px;line-height:1.4}
.art-meta{font-size:12px;color:#8b949e;margin-bottom:20px;display:flex;gap:16px;flex-wrap:wrap}
.art-body{font-size:15px;line-height:1.8;color:#c9d1d9;white-space:pre-wrap;word-break:break-word}
.art-body a{color:#58a6ff}
.comments-section{margin-top:32px;border-top:1px solid #21262d;padding-top:20px}
.comments-title{font-size:15px;font-weight:600;color:#e6edf3;margin-bottom:16px}
.comment{padding:12px 0;border-bottom:1px solid #21262d}
.comment:last-child{border-bottom:none}
.comment-header{display:flex;justify-content:space-between;margin-bottom:4px}
.comment-user{font-size:13px;font-weight:600;color:#e6edf3}
.comment-time{font-size:11px;color:#8b949e}
.comment-text{font-size:14px;line-height:1.7;color:#c9d1d9;white-space:pre-wrap;word-break:break-word}
.comment-text a{color:#58a6ff}
.comment-likes{font-size:11px;color:#8b949e;margin-top:4px}
@media(max-width:768px){body{flex-direction:column}#sidebar{width:100%;min-width:0;max-height:40vh}#article{padding:16px}}
</style>
</head>
<body>

<div id="sidebar">
  <div id="search"><input type="text" id="search-input" placeholder="搜索帖子标题..."></div>
  <div id="stats">共 __TOTAL__ 篇帖子</div>
  <div id="list"></div>
</div>

<div id="main">
  <div id="article">
    <div id="empty">← 选择一篇帖子查看</div>
  </div>
</div>

<script>
const POSTS = __POSTS_JSON__;
const listEl = document.getElementById('list');
const articleEl = document.getElementById('article');
const searchInput = document.getElementById('search-input');

let activeId = null;

function formatTime(ts) {
  const d = new Date(ts);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function stripHtml(s) {
  if (!s) return '';
  return s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function renderList(posts) {
  listEl.innerHTML = posts.map(p => {
    const title = stripHtml(p.title || p.description || '(无标题)').substring(0, 80);
    const date = formatTime(p.created_at);
    const fav = p.fav_count || 0;
    const reply = p.reply_count || 0;
    return `<div class="post-item${p.id === activeId ? ' active' : ''}" data-id="${p.id}">
      <div class="title">${escapeHtml(title)}</div>
      <div class="meta"><span>${date}</span><span>赞 ${fav}</span><span>评 ${reply}</span></div>
    </div>`;
  }).join('');
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function renderArticle(data) {
  const s = data.status;
  const title = stripHtml(s.title || s.description || '(无标题)');
  const date = formatTime(s.created_at);
  const text = data.article_text || stripHtml(s.description) || '(无内容)';
  const comments = data.comments || [];

  let html = `<div class="art-title">${escapeHtml(title)}</div>`;
  html += `<div class="art-meta">
    <span>${date}</span>
    <span>赞 ${s.fav_count||0}</span>
    <span>转发 ${s.retweet_count||0}</span>
    <span>评论 ${comments.length}</span>
  </div>`;
  html += `<div class="art-body">${escapeHtml(text)}</div>`;

  if (comments.length) {
    html += `<div class="comments-section"><div class="comments-title">评论 (${comments.length})</div>`;
    comments.forEach(c => {
      const cdate = formatTime(c.created_at);
      const ctext = c.text || c.description || '';
      const likes = c.like_count || 0;
      html += `<div class="comment">
        <div class="comment-header"><span class="comment-user">${escapeHtml(c.user.screen_name)}</span><span class="comment-time">${cdate}</span></div>
        <div class="comment-text">${ctext}</div>
        ${likes ? `<div class="comment-likes">赞 ${likes}</div>` : ''}
      </div>`;
    });
    html += '</div>';
  }

  articleEl.innerHTML = html;
  articleEl.scrollTop = 0;
}

async function selectPost(id) {
  activeId = id;
  renderList(filteredPosts());
  try {
    const resp = await fetch('/api/posts/' + id);
    const data = await resp.json();
    renderArticle(data);
  } catch(e) {
    articleEl.innerHTML = '<div style="color:#f85149;padding:24px">加载失败</div>';
  }
}

function filteredPosts() {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) return POSTS;
  return POSTS.filter(p => {
    const t = (p.title || p.description || '').toLowerCase();
    return t.includes(q);
  });
}

listEl.addEventListener('click', e => {
  const item = e.target.closest('.post-item');
  if (item) selectPost(parseInt(item.dataset.id));
});

searchInput.addEventListener('input', () => {
  renderList(filteredPosts());
});

// Init
renderList(POSTS);
</script>
</body>
</html>"""


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = urlparse(self.path).path

        if path == "/":
            self.serve_html()
        elif path.startswith("/api/posts/"):
            self.serve_post(path)
        elif path == "/api/posts":
            self.serve_post_list()
        else:
            self.send_error(404)

    def serve_html(self):
        posts_json = json.dumps([
            {
                "id": p["id"],
                "title": p.get("title", ""),
                "description": p.get("description", ""),
                "created_at": p.get("created_at", 0),
                "fav_count": p.get("fav_count", 0),
                "reply_count": p.get("reply_count", 0),
                "retweet_count": p.get("retweet_count", 0),
            }
            for p in POSTS
        ], ensure_ascii=False)

        html = HTML.replace("__POSTS_JSON__", posts_json)
        html = html.replace("__TOTAL__", str(len(POSTS)))

        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(html.encode("utf-8"))

    def serve_post(self, path):
        try:
            post_id = path.split("/")[-1]
            filepath = os.path.join(POSTS_DIR, f"{post_id}.json")
            if not os.path.exists(filepath):
                self.send_error(404)
                return
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))
        except Exception as e:
            self.send_error(500, str(e))

    def serve_post_list(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(json.dumps(POSTS, ensure_ascii=False).encode("utf-8"))

    def log_message(self, format, *args):
        pass  # suppress logs


def main():
    print(f"\n  Open http://localhost:{PORT}\n")
    server = HTTPServer(("127.0.0.1", PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        server.shutdown()


if __name__ == "__main__":
    main()
