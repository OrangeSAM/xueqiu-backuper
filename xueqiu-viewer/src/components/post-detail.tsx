"use client";

import { useEffect, useState } from "react";
import type { PostData } from "@/lib/types";
import CommentItem from "./comment-item";

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function formatFullDate(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day} ${h}:${min}`;
}

export default function PostDetail({
  data,
  loading,
  activeId,
  onRefresh,
  refreshing,
}: {
  data: PostData | null;
  loading: boolean;
  activeId: number | null;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!activeId) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div style={{ color: "var(--paper-dim)" }}>
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
            opacity={0.4}
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
        </div>
        <p
          className="text-sm tracking-wide"
          style={{ color: "var(--paper-dim)", fontFamily: "var(--font-ui)" }}
        >
          ← 选择一篇帖子阅读
        </p>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div
          className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{
            borderColor: "var(--ink-border-light)",
            borderTopColor: "var(--amber)",
          }}
        />
        <p
          className="text-sm tracking-wide"
          style={{ color: "var(--paper-dim)" }}
        >
          加载中...
        </p>
      </div>
    );
  }

  const s = data.status as Record<string, any>;
  const title = stripHtml(s.title || s.description || "(无标题)");
  const text = data.article_text || stripHtml(s.description || "") || "(无内容)";
  const comments = data.comments || [];

  return (
    <div className="max-w-[720px] mx-auto px-10 py-8">
      <article
        className={mounted ? "animate-fade-in" : ""}
        style={{ opacity: mounted ? 1 : 0 }}
      >
        {/* Title */}
        <h1
          className="text-[1.65rem] font-bold leading-snug tracking-[0.015em] mb-4"
          style={{
            color: "var(--paper)",
            fontFamily: "var(--font-ui)",
          }}
        >
          {title}
        </h1>

        {/* Amber rule */}
        <div
          className="w-12 h-[2px] mb-5"
          style={{ background: "var(--amber-muted)" }}
        />

        {/* Meta line + refresh */}
        <div className="flex items-center justify-between mb-8">
          <div
            className="flex flex-wrap items-center gap-4 text-[12px] tracking-wide"
            style={{ color: "var(--paper-dim)", fontFamily: "var(--font-ui)" }}
          >
            <time>{formatFullDate(s.created_at)}</time>
            <span className="flex items-center gap-1">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
              </svg>
              {s.like_count ?? 0}
            </span>
            <span className="flex items-center gap-1">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
              {s.fav_count ?? 0}
            </span>
            <span className="flex items-center gap-1">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="17 1 21 5 17 9" />
                <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                <polyline points="7 23 3 19 7 15" />
                <path d="M21 13v2a4 4 0 0 1-4 4H3" />
              </svg>
              {s.retweet_count ?? 0}
            </span>
            <span className="flex items-center gap-1">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              {comments.length}
            </span>
            {s.source && (
              <span
                className="px-1.5 py-0.5 rounded text-[10px]"
                style={{
                  background: "var(--ink-raised)",
                  color: "var(--paper-dim)",
                }}
              >
                {s.source}
              </span>
            )}
          </div>

          {/* Refresh button */}
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] border transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: refreshing ? "var(--ink-raised)" : "transparent",
                borderColor: "var(--ink-border-light)",
                color: "var(--paper-muted)",
                fontFamily: "var(--font-ui)",
              }}
              onMouseEnter={(e) => {
                if (!refreshing) {
                  e.currentTarget.style.borderColor = "var(--amber-muted)";
                  e.currentTarget.style.color = "var(--amber)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--ink-border-light)";
                e.currentTarget.style.color = "var(--paper-muted)";
              }}
              title="从雪球重新抓取最新数据"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={refreshing ? "animate-spin" : ""}
              >
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              {refreshing ? "刷新中..." : "刷新数据"}
            </button>
          )}
        </div>

        {/* Article body */}
        <div
          className="article-body mb-10"
          style={{ fontFamily: "var(--font-body)" }}
        >
          {text}
        </div>

        {/* Divider */}
        {comments.length > 0 && (
          <div
            className="border-t pt-8 mt-4"
            style={{ borderColor: "var(--ink-border)" }}
          >
            <div className="flex items-center gap-3 mb-6">
              <h2
                className="text-sm font-semibold tracking-wider"
                style={{
                  color: "var(--amber)",
                  fontFamily: "var(--font-ui)",
                }}
              >
                评论
              </h2>
              <span
                className="text-[11px] px-2 py-0.5 rounded-full"
                style={{
                  background: "var(--ink-raised)",
                  color: "var(--paper-dim)",
                }}
              >
                {comments.length}
              </span>
            </div>

            <div className="space-y-0">
              {comments.map((c, i) => (
                <div
                  key={c.id}
                  style={{
                    animationDelay: `${i * 40}ms`,
                    animation: "fade-in 0.4s ease-out both",
                  }}
                >
                  <CommentItem comment={c} depth={0} />
                </div>
              ))}
            </div>
          </div>
        )}
      </article>
    </div>
  );
}
