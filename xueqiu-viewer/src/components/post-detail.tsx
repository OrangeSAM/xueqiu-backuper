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
}: {
  data: PostData | null;
  loading: boolean;
  activeId: number | null;
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

        {/* Meta line */}
        <div
          className="flex flex-wrap items-center gap-4 text-[12px] mb-8 tracking-wide"
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
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
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
