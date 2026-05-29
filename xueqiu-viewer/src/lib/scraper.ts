/**
 * Re-scraping logic for refreshing a single post from xueqiu.com.
 * Mirrors the Python scraper logic but in TypeScript for the API route.
 */

import fs from "fs";
import path from "path";

const XUEQIU = "https://xueqiu.com";

function loadCookie(): string | null {
  const cookiePath = path.join(process.cwd(), "..", "cookie.txt");
  try {
    const cookie = fs.readFileSync(cookiePath, "utf-8").trim();
    return cookie || null;
  } catch {
    return null;
  }
}

function baseHeaders(referer: string): Record<string, string> {
  const cookie = loadCookie();
  return {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
    Accept: "*/*",
    "Accept-Language": "zh-CN,zh;q=0.9",
    "X-Requested-With": "XMLHttpRequest",
    Referer: referer,
    ...(cookie ? { Cookie: cookie } : {}),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function randBetween(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

// ---- HTML text extraction ----

function cleanHtml(raw: string): string {
  let t = raw
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(?:p|div|h\d|li|tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"');
  t = t.replace(/\n{3,}/g, "\n\n");
  t = t.replace(/[ \t]+/g, " ");
  t = t.replace(/ *\n */g, "\n");
  return t.trim();
}

function extractArticleText(html: string): string {
  // Pattern 1: SNOWMAN_STATUS embedded JSON
  let m = html.match(/SNOWMAN_STATUS\s*=\s*(\{.*?\});\s*\n/s);
  if (m) {
    try {
      const data = JSON.parse(m[1]);
      const text = data.text || data.description || "";
      if (text) return cleanHtml(text);
    } catch { /* continue */ }
  }

  // Pattern 2: window.SNOWMAN_STATUS
  m = html.match(/window\.SNOWMAN_STATUS\s*=\s*(\{.*?\});/s);
  if (m) {
    try {
      const data = JSON.parse(m[1]);
      const text = data.text || data.description || "";
      if (text) return cleanHtml(text);
    } catch { /* continue */ }
  }

  // Pattern 3: article__bd div
  m = html.match(
    /<div[^>]*class="[^"]*article__bd[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<(?:div|article)/,
  );
  if (m) return cleanHtml(m[1]);

  // Pattern 4: detail__content
  m = html.match(
    /<div[^>]*class="[^"]*detail__content[^"]*"[^>]*>([\s\S]*?)<\/div>/,
  );
  if (m) return cleanHtml(m[1]);

  // Pattern 5: article tag
  m = html.match(/<article[^>]*>([\s\S]*?)<\/article>/);
  if (m) return cleanHtml(m[1]);

  return "";
}

function extractStatusMeta(html: string): Record<string, unknown> | null {
  // Try SNOWMAN_STATUS first, then window.SNOWMAN_STATUS
  for (const pat of [
    /SNOWMAN_STATUS\s*=\s*(\{.*?\});\s*\n/s,
    /window\.SNOWMAN_STATUS\s*=\s*(\{.*?\});/s,
  ]) {
    const m = html.match(pat);
    if (m) {
      try {
        return JSON.parse(m[1]);
      } catch { /* continue */ }
    }
  }
  return null;
}

// ---- Comments fetching ----

interface RawComment {
  id: number;
  user_id: number;
  created_at: number;
  text: string;
  description: string;
  like_count: number;
  reply_count: number;
  user: { screen_name: string; id: number; profile_image_url: string };
  child_comments: RawComment[];
}

async function fetchAllComments(
  statusId: number,
): Promise<RawComment[]> {
  const all: RawComment[] = [];
  let maxId: string | number = -1;

  while (true) {
    const url = `${XUEQIU}/statuses/v3/comments.json?id=${statusId}&type=4&size=20&max_id=${maxId}`;
    const resp = await fetch(url, {
      headers: baseHeaders(`${XUEQIU}/`),
    });

    if (!resp.ok) break;

    const data = await resp.json();
    const comments: RawComment[] = data.comments || [];
    all.push(...comments);

    const next = data.next_max_id;
    if (next === undefined || next === null || next === -1 || next === "-1") break;
    maxId = next;

    // Rate limit between comment pages
    await sleep(randBetween(800, 1500));
  }

  return all;
}

// ---- Public API ----

export interface RefreshResult {
  article_text: string;
  comments: RawComment[];
  status_meta: Record<string, unknown> | null;
}

export async function refreshPost(
  target: string,
  statusId: number,
): Promise<RefreshResult> {
  const cookie = loadCookie();
  if (!cookie) {
    throw new Error("Cookie not found. Create cookie.txt in the project root.");
  }

  // Fetch article HTML
  const articleUrl = `${XUEQIU}${target}`;
  const resp = await fetch(articleUrl, { headers: baseHeaders(articleUrl) });
  if (!resp.ok) {
    throw new Error(`Failed to fetch article: HTTP ${resp.status}`);
  }
  const html = await resp.text();

  // Extract
  const article_text = extractArticleText(html);
  const status_meta = extractStatusMeta(html);

  // Small delay before comments
  await sleep(randBetween(500, 1000));

  // Fetch comments
  const comments = await fetchAllComments(statusId);

  return { article_text, comments, status_meta };
}
