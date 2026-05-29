import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

let posts = [];
let activeId = null;
const AUTHOR_NAME = "待到秋来九月八";

function fmtDate(ts) {
  const d = new Date(ts * 1000);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function fmtFull(ts) {
  const d = new Date(ts * 1000);
  return fmtDate(ts) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
function avatarColor(uid) {
  return `hsl(${(uid * 31) % 360}, 12%, 18%)`;
}
function stripHtml(s) {
  return (s || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

// ---- Load posts ----
async function loadPosts(q) {
  try {
    posts = await invoke("get_posts", { search: q || null, limit: 500, offset: 0 });
  } catch (e) {
    posts = [];
    console.error("Failed to load posts:", e);
  }
  renderList();
}

function renderList() {
  const el = document.getElementById("post-list");
  const stats = document.getElementById("search-stats").querySelector("span");
  stats.textContent = "共 " + posts.length + " 篇帖子";

  el.innerHTML = posts
    .map((p, i) => {
      const active = p.id === activeId;
      const title = p.title || stripHtml(p.description).substring(0, 50) || "(无标题)";
      return `<div class="post-item${active ? " active" : ""}" data-id="${p.id}" style="animation-delay:${Math.min(i * 15, 300)}ms">
        <div class="post-item-title">${esc(title)}</div>
        <div class="post-item-meta">
          <span>${fmtDate(p.created_at)}</span>
          <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/></svg>${p.like_count}</span>
          <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>${p.fav_count}</span>
          <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>${p.comment_count}</span>
        </div>
      </div>`;
    })
    .join("");
}

// ---- Post detail ----
async function selectPost(id) {
  activeId = id;
  renderList();
  const main = document.getElementById("main");
  main.innerHTML = '<div id="loading"><div class="spinner"></div><span>加载中...</span></div>';

  try {
    const data = await invoke("get_post", { postId: id });
    if (!data) {
      main.innerHTML = '<div style="color:#f85149;padding:40px;text-align:center">帖子不存在</div>';
      return;
    }
    renderArticle(data);
  } catch (e) {
    main.innerHTML = `<div style="color:#f85149;padding:40px;text-align:center">加载失败: ${esc(String(e))}</div>`;
  }
}

function renderArticle(data) {
  const s = JSON.parse(data.post.raw_status || "{}");
  const title = stripHtml(s.title || s.description || "(无标题)");
  const text = data.post.article_text || stripHtml(s.description || "") || "(无内容)";
  const comments = data.comments || [];
  const postId = data.post.id;

  let html = `<div class="article-wrap">
    <h1 class="art-title">${esc(title)}</h1>
    <div class="art-rule"></div>
    <div class="art-meta-row">
      <div class="art-meta">
        <span>${fmtFull(s.created_at || data.post.created_at)}</span>
        <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/></svg>${s.like_count ?? data.post.like_count}</span>
        <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>${s.fav_count ?? data.post.fav_count}</span>
        <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>${s.retweet_count ?? data.post.retweet_count}</span>
        <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>${comments.length}</span>
        ${s.source ? '<span style="background:var(--ink-raised);padding:2px 6px;border-radius:3px;font-size:10px">' + esc(s.source) + '</span>' : ""}
      </div>
      <button id="refresh-btn" onclick="window._refreshPost(${postId})">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" id="refresh-icon"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        <span id="refresh-label">刷新数据</span>
      </button>
    </div>
    <div class="art-body">${esc(text)}</div>`;

  if (comments.length > 0) {
    html += `<div id="comments-section">
      <div id="comments-header"><h2>评论</h2><span class="badge">${comments.length}</span></div>
      ${renderComments(comments)}
    </div>`;
  }

  html += "</div>";
  document.getElementById("main").innerHTML = html;
  document.getElementById("main").scrollTop = 0;
}

function renderComments(comments, depth) {
  depth = depth || 0;
  return comments
    .map((c) => {
      const text = c.text || "";
      const children = c.child_comments || [];
      const hasChildren = children.length > 0;
      const nestedClass = depth > 0 ? " nested" : "";
      const id = "c-" + c.id;

      let html = `<div class="comment-thread${nestedClass}" id="${id}">
        <div class="comment-item">
          <div class="comment-header">
            <div class="comment-user-row">
              <div class="comment-avatar" style="background:${avatarColor(c.user_id)};color:var(--paper-muted)">${esc(c.screen_name.charAt(0))}</div>
              <span class="comment-name">${esc(c.screen_name)}</span>
              ${c.screen_name === AUTHOR_NAME ? '<span class="author-badge">作者</span>' : ""}
            </div>
            <span class="comment-time">${fmtFull(c.created_at)}</span>
          </div>
          <div class="comment-text">${formatCommentText(text)}</div>
          <div class="comment-footer">
            ${c.like_count > 0 ? '<span class="like-count"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>' + c.like_count + "</span>" : ""}
            ${hasChildren ? '<button class="toggle-replies" onclick="window._toggleReplies(\'' + id + "'," + children.length + ')"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>收起回复</button>' : ""}
          </div>
        </div>`;

      if (hasChildren) {
        html += `<div class="child-replies">${renderComments(children, depth + 1)}</div>`;
      }

      html += "</div>";
      return html;
    })
    .join("");
}

function formatCommentText(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(
      /\$([^(]+)\(([^)]+)\)/g,
      '<a href="https://xueqiu.com/S/$2" target="_blank" rel="noreferrer">$$1($2)</a>'
    );
}

// ---- Refresh ----
async function refreshPost(id) {
  const btn = document.getElementById("refresh-btn");
  const icon = document.getElementById("refresh-icon");
  const label = document.getElementById("refresh-label");
  if (!btn || btn.disabled) return;

  btn.disabled = true;
  icon.classList.add("spin");
  label.textContent = "刷新中...";

  try {
    const data = await invoke("refresh_post", { postId: id });
    renderArticle(data);
    const idx = posts.findIndex((p) => p.id === id);
    if (idx >= 0) {
      const s = JSON.parse(data.post.raw_status || "{}");
      posts[idx].like_count = s.like_count ?? data.post.like_count;
      posts[idx].fav_count = s.fav_count ?? data.post.fav_count;
      posts[idx].comment_count = data.comments.length;
      renderList();
    }
  } catch (e) {
    alert("刷新失败: " + e);
  } finally {
    btn.disabled = false;
    icon.classList.remove("spin");
    label.textContent = "刷新数据";
  }
}

// Expose to inline onclick handlers
window._refreshPost = refreshPost;
window._toggleReplies = (id, childCount) => {
  const thread = document.getElementById(id);
  const child = thread.querySelector(".child-replies");
  const btn = thread.querySelector(".toggle-replies");
  if (!child || !btn) return;
  const isHidden = child.style.display === "none";
  child.style.display = isHidden ? "" : "none";
  btn.classList.toggle("collapsed", !isHidden);
  btn.innerHTML = isHidden
    ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>收起回复'
    : '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>展开 ' + childCount + " 条回复";
};

// ---- Settings modal ----
async function showSettings() {
  const settings = await invoke("get_settings");

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `<div class="modal">
    <h2>设置</h2>
    <label>用户 ID</label>
    <input type="text" id="settings-uid" value="${esc(settings.user_id)}" placeholder="例如: 4533843739">
    <label>Cookie</label>
    <textarea id="settings-cookie" placeholder="粘贴雪球 Cookie...">${esc(settings.cookie)}</textarea>
    <p style="font-size:11px;color:var(--paper-dim);margin-top:6px">登录 xueqiu.com 后，在开发者工具 → Application → Cookies 中复制 xq_a_token 的值，格式为 xq_a_token=xxx</p>
    <div class="modal-actions">
      <button class="btn-cancel" id="btn-cancel-settings">取消</button>
      <button class="btn-primary" id="btn-save-settings">保存</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);

  overlay.querySelector("#btn-cancel-settings").onclick = () => overlay.remove();
  overlay.querySelector("#btn-save-settings").onclick = async () => {
    const uid = overlay.querySelector("#settings-uid").value.trim();
    const cookie = overlay.querySelector("#settings-cookie").value.trim();
    await invoke("save_settings", { cookie, userId: uid });
    overlay.remove();
  };
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

// ---- Scrape flow ----
async function startScrape() {
  const settings = await invoke("get_settings");
  if (!settings.cookie) {
    alert("请先在设置中填入 Cookie");
    return;
  }
  if (!settings.user_id) {
    alert("请先在设置中填入用户 ID");
    return;
  }

  // Show progress bar
  const bar = document.createElement("div");
  bar.id = "scrape-progress";
  bar.innerHTML = `<div class="bar"><div class="bar-fill" style="width:0%"></div></div>
    <span class="status-text">正在抓取...</span>`;
  document.body.appendChild(bar);

  // Listen for progress events
  const unlisten = await listen("scrape-progress", (event) => {
    const p = event.payload;
    const pct = p.total_posts > 0 ? Math.round((p.page / p.total_posts) * 100) : 0;
    bar.querySelector(".bar-fill").style.width = pct + "%";
    bar.querySelector(".status-text").textContent = p.message;
    if (p.status === "done") {
      bar.querySelector(".status-text").classList.add("status-done");
      setTimeout(() => bar.remove(), 5000);
      loadPosts();
    }
    if (p.status === "error") {
      bar.querySelector(".status-text").style.color = "var(--red)";
      setTimeout(() => bar.remove(), 8000);
    }
  });

  try {
    await invoke("scrape_timeline", { userId: settings.user_id, maxPages: null });
  } catch (e) {
    bar.querySelector(".status-text").textContent = "抓取出错: " + e;
    bar.querySelector(".status-text").style.color = "var(--red)";
    setTimeout(() => bar.remove(), 8000);
  }
}

// ---- Events ----
document.getElementById("post-list").addEventListener("click", (e) => {
  const item = e.target.closest(".post-item");
  if (item) selectPost(parseInt(item.dataset.id));
});

let searchTimer;
document.getElementById("search").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadPosts(e.target.value.trim()), 200);
});

document.getElementById("btn-settings").addEventListener("click", showSettings);
document.getElementById("btn-scrape").addEventListener("click", startScrape);

// ---- Init ----
loadPosts();
