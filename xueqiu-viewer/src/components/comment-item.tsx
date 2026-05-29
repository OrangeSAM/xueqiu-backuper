"use client";

import { useState } from "react";
import type { CommentData } from "@/lib/types";

function formatDate(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day} ${h}:${min}`;
}

// Depth color palette — warm, progressively tinted
const DEPTH_BORDERS = [
  "var(--amber-muted)",
  "var(--ink-border-light)",
  "var(--ink-border)",
  "var(--ink-border)",
];

export default function CommentItem({
  comment,
  depth,
}: {
  comment: CommentData;
  depth: number;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const text = comment.text || comment.description || "";
  const children = comment.child_comments || [];
  const hasChildren = Array.isArray(children) && children.length > 0;
  const borderColor = DEPTH_BORDERS[Math.min(depth, DEPTH_BORDERS.length - 1)];

  return (
    <div
      className={`${depth > 0 ? "ml-5 pl-4" : ""}`}
      style={{
        borderLeft: depth > 0 ? `2px solid ${borderColor}` : "none",
      }}
    >
      <div
        className="py-3.5 border-b"
        style={{
          borderColor: "var(--ink-border)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {/* Avatar dot */}
            <div
              className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[10px] font-semibold"
              style={{
                background: `hsl(${(comment.user_id * 31) % 360}, 12%, 18%)`,
                color: "var(--paper-muted)",
                fontFamily: "var(--font-ui)",
              }}
            >
              {comment.user.screen_name.charAt(0)}
            </div>
            <span
              className="text-[13px] font-semibold truncate"
              style={{
                color: "var(--paper)",
                fontFamily: "var(--font-ui)",
              }}
            >
              {comment.user.screen_name}
            </span>
            {comment.user.screen_name === "待到秋来九月八" && (
              <span
                className="text-[10px] px-1.5 py-px rounded shrink-0 font-medium"
                style={{
                  background: "var(--amber-glow)",
                  color: "var(--amber-light)",
                  fontFamily: "var(--font-ui)",
                }}
              >
                作者
              </span>
            )}
          </div>
          <time
            className="text-[11px] shrink-0"
            style={{
              color: "var(--paper-dim)",
              fontFamily: "var(--font-ui)",
            }}
          >
            {formatDate(comment.created_at)}
          </time>
        </div>

        {/* Body */}
        {!collapsed && (
          <div
            className="text-[14px] leading-relaxed mt-2 whitespace-pre-wrap break-words"
            style={{
              color: "var(--paper-muted)",
              fontFamily: "var(--font-ui)",
            }}
            dangerouslySetInnerHTML={{
              __html: text
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(
                  /\$([^(]+)\(([^)]+)\)/g,
                  '<a href="https://xueqiu.com/S/$2" target="_blank" rel="noreferrer" style="color:var(--amber);text-decoration:none" onmouseover="this.style.textDecoration=\'underline\'" onmouseout="this.style.textDecoration=\'none\'">$$1($2)</a>',
                ),
            }}
          />
        )}

        {/* Footer */}
        {!collapsed && (
          <div className="flex items-center gap-4 mt-2">
            {(comment.like_count ?? 0) > 0 && (
              <span
                className="text-[11px] flex items-center gap-1"
                style={{
                  color: "var(--paper-dim)",
                  fontFamily: "var(--font-ui)",
                }}
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
                {comment.like_count}
              </span>
            )}
            {hasChildren && (
              <button
                onClick={() => setCollapsed(!collapsed)}
                className="text-[11px] flex items-center gap-1 transition-colors duration-200 hover:opacity-80"
                style={{
                  color: "var(--amber-muted)",
                  fontFamily: "var(--font-ui)",
                }}
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  style={{
                    transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
                    transition: "transform 0.2s ease",
                  }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
                {collapsed
                  ? `展开 ${children.length} 条回复`
                  : `收起回复`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Recursive child comments */}
      {hasChildren &&
        !collapsed &&
        children.map((child) => (
          <CommentItem key={child.id} comment={child} depth={depth + 1} />
        ))}
    </div>
  );
}
