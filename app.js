import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

let posts = [];
let activeId = null;
let currentTab = "browse";
let currentUserId = null; // selected user filter
let scrapeRunning = false;
const AUTHOR_NAME = "待到秋来九月八";

function fmtDate(ts) {
  const d = new Date(ts);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function fmtFull(ts) {
  const d = new Date(ts);
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

// ==================== Tab Switching ====================

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
  document.getElementById('view-' + tab).style.display = '';
  if (tab === 'dashboard') renderDashboard();
  if (tab === 'settings') renderSettings();
}

document.getElementById('tab-bar').addEventListener('click', e => {
  const btn = e.target.closest('.tab-btn');
  if (btn) switchTab(btn.dataset.tab);
});

// ==================== Post List ====================

async function loadPosts(q) {
  try {
    posts = await invoke("get_posts", {
      search: q || null,
      userId: currentUserId,
      limit: 500,
      offset: 0,
    });
  } catch (e) { posts = []; }
  renderList();
}

function renderList() {
  const el = document.getElementById("post-list");
  const count = document.getElementById("search-stats");
  count.innerHTML = `<span>共 ${posts.length} 篇帖子</span>`;

  el.innerHTML = posts.map((p, i) => {
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
  }).join('');
}

document.getElementById("post-list").addEventListener("click", e => {
  const item = e.target.closest(".post-item");
  if (item) { switchTab("browse"); selectPost(parseInt(item.dataset.id)); }
});

let searchTimer;
document.getElementById("search").addEventListener("input", e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadPosts(e.target.value.trim()), 200);
});

// ==================== User Filter ====================

async function loadUserFilter() {
  let ids = [];
  try { ids = await invoke("get_user_ids"); } catch (e) { /* ignore */ }
  const sel = document.getElementById("user-filter");
  const current = sel.value || "";
  sel.innerHTML = '<option value="">全部用户</option>' +
    ids.map(id => `<option value="${id}">用户 ${id}</option>`).join('');
  sel.value = current || "";
}

document.getElementById("user-filter").addEventListener("change", e => {
  currentUserId = e.target.value ? parseInt(e.target.value) : null;
  activeId = null;
  loadPosts(document.getElementById("search").value.trim());
});

// ==================== Helpers ====================

function parseUserId(input) {
  input = (input || '').trim();
  if (!input) return input;
  // URL like https://xueqiu.com/u/4533843739
  const m = input.match(/u\/(\d+)/);
  if (m) return m[1];
  // Just digits
  if (/^\d+$/.test(input)) return input;
  return input;
}

// ==================== Post Detail ====================

async function selectPost(id) {
  activeId = id;
  renderList();
  const el = document.getElementById("browse-inner");
  el.innerHTML = '<div id="loading"><div class="spinner"></div><span>加载中...</span></div>';
  try {
    const data = await invoke("get_post", { postId: id });
    if (!data) { el.innerHTML = '<div style="color:#f85149;padding:40px;text-align:center">帖子不存在</div>'; return; }
    el.innerHTML = renderArticle(data);
    el.scrollTop = 0;
  } catch (e) { el.innerHTML = `<div style="color:#f85149;padding:40px;text-align:center">加载失败: ${esc(String(e))}</div>`; }
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
        <span id="refresh-label">刷新</span>
      </button>
      <button id="delete-btn" onclick="window._deletePost(${postId})" style="margin-left:8px">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        <span>删除</span>
      </button>
    </div>
    <div class="art-body">${esc(text)}</div>`;

  if (comments.length > 0) {
    html += `<div id="comments-section">
      <div id="comments-header"><h2>评论</h2><span class="badge">${comments.length}</span></div>
      ${renderComments(comments)}
    </div>`;
  }
  return html + '</div>';
}

function renderComments(comments, depth) {
  depth = depth || 0;
  return comments.map(c => {
    const text = c.text || "";
    const children = c.child_comments || [];
    const hasChildren = children.length > 0;
    const id = "c-" + c.id;
    let html = `<div class="comment-thread${depth > 0 ? " nested" : ""}" id="${id}">
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
          ${hasChildren ? `<button class="toggle-replies" onclick="window._toggleReplies('${id}',${children.length})"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>收起回复</button>` : ""}
        </div>
      </div>`;
    if (hasChildren) html += `<div class="child-replies">${renderComments(children, depth + 1)}</div>`;
    return html + '</div>';
  }).join('');
}

function formatCommentText(text) {
  return text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\$([^(]+)\(([^)]+)\)/g, '<a href="https://xueqiu.com/S/$2" target="_blank" rel="noreferrer">$$1($2)</a>');
}

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
    document.getElementById("browse-inner").innerHTML = renderArticle(data);
    document.getElementById("browse-inner").scrollTop = 0;
    const idx = posts.findIndex(p => p.id === id);
    if (idx >= 0) {
      const s = JSON.parse(data.post.raw_status || "{}");
      posts[idx].like_count = s.like_count ?? data.post.like_count;
      posts[idx].fav_count = s.fav_count ?? data.post.fav_count;
      posts[idx].comment_count = data.comments.length;
      renderList();
    }
    toast("刷新完成");
  } catch (e) {
    toast("刷新失败: " + e, true);
  } finally {
    btn.disabled = false;
    icon.classList.remove("spin");
    label.textContent = "刷新数据";
  }
}

window._refreshPost = refreshPost;

async function deletePost(id) {
  console.log("[deletePost] called with id:", id);
  if (!(await showConfirm('确定要删除这篇帖子吗？'))) return;
  console.log("[deletePost] confirmed, invoking delete_post command...");
  try {
    const result = await invoke("delete_post", { postId: id });
    console.log("[deletePost] invoke returned:", result);
    posts = posts.filter(p => p.id !== id);
    activeId = null;
    renderList();
    document.getElementById("browse-inner").innerHTML = `<div id="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
      <span>← 选择一篇帖子阅读</span>
    </div>`;
    loadUserFilter();
    toast("帖子已删除");
  } catch (e) {
    console.error("[deletePost] error:", e);
    toast("删除失败: " + e, true);
  }
}
window._deletePost = deletePost;
console.log("[init] window._deletePost assigned:", typeof window._deletePost);

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
    : `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>展开 ${childCount} 条回复`;
};

// ==================== Dashboard ====================

async function renderDashboard() {
  const el = document.getElementById("view-dashboard");
  el.innerHTML = '<div id="loading"><div class="spinner"></div></div>';

  let count = 0, settings = null, userIds = [];
  try { count = await invoke("get_post_count"); } catch (e) { /* */ }
  try { settings = await invoke("get_settings"); } catch (e) { /* */ }
  try { userIds = await invoke("get_user_ids"); } catch (e) { /* */ }

  const cookieSet = settings && settings.cookie;
  const savedUserId = (settings && settings.user_id) || "";

  el.innerHTML = `<div class="page-wrap">
    <h2>数据概况</h2>
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-value">${count}</div>
        <div class="stat-label">帖子总数</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${userIds.length}</div>
        <div class="stat-label">已抓取用户数</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${cookieSet ? '✓' : '✗'}</div>
        <div class="stat-label">Cookie 状态</div>
      </div>
    </div>

    <h2>抓取操作</h2>
    <div class="form-group">
      <label>用户 ID 或主页 URL</label>
      <input type="text" id="scrape-uid" value="${esc(savedUserId)}" placeholder="例如: 4533843739 或 https://xueqiu.com/u/4533843739">
    </div>
    <div class="form-group">
      <label>最大页数（留空 = 全部）</label>
      <input type="number" id="scrape-pages" placeholder="留空则抓取全部">
    </div>
    <div class="form-actions">
      <button class="btn-primary" id="btn-start-scrape" ${!cookieSet ? 'disabled' : ''}>
        ${cookieSet ? '开始抓取' : '请先在设置中配置 Cookie'}
      </button>
      ${scrapeRunning ? '<span style="font-size:12px;color:var(--amber-muted);margin-left:12px">抓取进行中...</span>' : ''}
    </div>
    <div id="scrape-dashboard-status" style="margin-top:12px;font-size:12px;color:var(--paper-dim)"></div>
  </div>`;

  document.getElementById("btn-start-scrape").onclick = startScrape;
}

// ==================== Settings ====================

async function renderSettings() {
  const el = document.getElementById("view-settings");
  let settings = { cookie: "", user_id: "" };
  try { settings = await invoke("get_settings"); } catch (e) { /* */ }

  el.innerHTML = `<div class="page-wrap">
    <h2>设置</h2>
    <div class="form-group">
      <label>用户 ID 或主页 URL</label>
      <input type="text" id="settings-uid" value="${esc(settings.user_id)}" placeholder="例如: 4533843739 或 https://xueqiu.com/u/4533843739">
      <div class="hint">填数字 ID 或直接粘贴雪球个人主页链接均可。</div>
    </div>
    <div class="form-group">
      <label>Cookie</label>
      <textarea id="settings-cookie" placeholder="粘贴完整 Cookie 字符串">${esc(settings.cookie)}</textarea>
      <div class="hint">
        在浏览器中打开 <a href="https://xueqiu.com" target="_blank" style="color:var(--amber)">xueqiu.com</a> 并登录。然后 F12 打开开发者工具，进入 <b>Network</b>（网络）标签，刷新页面，在请求列表里随便点一个 xueqiu.com 开头的请求，在右侧 <b>Headers</b> → <b>Request Headers</b> 里找到 <b>Cookie</b> 一行，完整复制粘贴到这里即可。
        <br><br>注意：必须从 Network 面板的请求头里复制，不要用 Console 的 <code style="background:var(--ink);padding:1px 4px;border-radius:2px;font-size:11px">document.cookie</code>（拿不到 HttpOnly 的 token）。
      </div>
    </div>
    <div class="form-actions">
      <button class="btn-primary" id="btn-save-settings">保存</button>
    </div>
  </div>`;

  document.getElementById("btn-save-settings").onclick = async () => {
    const uid = parseUserId(document.getElementById("settings-uid").value);
    const cookie = document.getElementById("settings-cookie").value.trim();
    try {
      await invoke("save_settings", { cookie, userId: uid });
      toast("设置已保存");
    } catch (e) { toast("保存失败: " + e, true); }
  };
}

// ==================== Scraping ====================

async function startScrape() {
  if (scrapeRunning) return;
  const settings = await invoke("get_settings");
  if (!settings.cookie) { toast("请先在设置中填入 Cookie", true); return; }

  const rawUid = document.getElementById("scrape-uid").value.trim();
  const userId = parseUserId(rawUid) || settings.user_id;
  if (!userId) { toast("请先填入用户 ID 或主页 URL", true); return; }

  await invoke("save_settings", { cookie: settings.cookie, userId });

  const pagesStr = document.getElementById("scrape-pages").value.trim();
  const maxPages = pagesStr ? parseInt(pagesStr) : null;

  scrapeRunning = true;
  if (currentTab === "dashboard") renderDashboard();

  const unlisten = await listen("scrape-progress", (event) => {
    const p = event.payload;
    const ds = document.getElementById("scrape-dashboard-status");
    if (ds) {
      const pct = p.total_posts > 0 ? Math.round((p.page / p.total_posts) * 100) : 0;
      if (p.status === "done") {
        ds.innerHTML = `<div style="color:var(--green);margin-top:10px;font-size:13px">${esc(p.message)}</div>`;
        scrapeRunning = false;
        loadPosts();
        loadUserFilter();
        if (currentTab === "dashboard") renderDashboard();
      } else {
        ds.innerHTML = `<div style="margin-top:10px">
          <div style="background:var(--ink-border);border-radius:2px;height:4px;margin-bottom:6px"><div style="background:var(--amber);height:100%;border-radius:2px;width:${pct}%;transition:width .3s"></div></div>
          <span style="font-size:12px;color:var(--paper-dim)">${esc(p.message)}</span>
        </div>`;
      }
    }
  });

  try {
    const msg = await invoke("scrape_timeline", { userId, maxPages });
    toast(msg);
  } catch (e) {
    const ds = document.getElementById("scrape-dashboard-status");
    if (ds) ds.innerHTML = `<span style="color:var(--red);font-size:12px">${esc(String(e))}</span>`;
    scrapeRunning = false;
    if (currentTab === "dashboard") renderDashboard();
  }
}

// ==================== Toast ====================

function showConfirm(msg) {
  return new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;animation:fadeIn .15s ease";
    overlay.innerHTML = `<div style="background:var(--ink-raised);border:1px solid var(--ink-border);border-radius:10px;padding:24px 28px;max-width:360px;text-align:center;box-shadow:0 16px 48px rgba(0,0,0,0.5)">
      <p style="font-size:14px;color:var(--paper);margin-bottom:20px;line-height:1.6">${esc(msg)}</p>
      <p style="font-size:12px;color:var(--paper-dim);margin-bottom:18px">删除后无法恢复</p>
      <div style="display:flex;gap:10px;justify-content:center">
        <button id="confirm-cancel" style="padding:8px 24px;font-size:13px;font-family:var(--font-ui);background:transparent;border:1px solid var(--ink-border-light);border-radius:6px;color:var(--paper-dim);cursor:pointer">取消</button>
        <button id="confirm-ok" style="padding:8px 24px;font-size:13px;font-family:var(--font-ui);background:var(--red);border:1px solid var(--red);border-radius:6px;color:#fff;cursor:pointer;font-weight:500">删除</button>
      </div>
    </div>`;
    overlay.querySelector("#confirm-cancel").onclick = () => { overlay.remove(); resolve(false); };
    overlay.querySelector("#confirm-ok").onclick = () => { overlay.remove(); resolve(true); };
    document.body.appendChild(overlay);
  });
}

function toast(msg, isError) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  if (isError) t.style.borderColor = "rgba(224,85,106,0.4)";
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .3s"; }, 2500);
  setTimeout(() => t.remove(), 3000);
}

// ==================== Init ====================

loadPosts();
loadUserFilter();
