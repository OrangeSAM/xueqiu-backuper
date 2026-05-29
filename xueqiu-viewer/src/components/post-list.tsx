"use client";

import { useRef, useEffect } from "react";
import type { PostIndex } from "@/lib/types";

function formatDate(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function timeLabel(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return formatDate(ts);
}

export default function PostList({
  posts,
  activeId,
  onSelect,
}: {
  posts: PostIndex[];
  activeId: number | null;
  onSelect: (id: number) => void;
}) {
  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeId]);

  return (
    <div className="flex-1 overflow-y-auto">
      {posts.map((p, i) => {
        const active = p.id === activeId;
        return (
          <div
            key={p.id}
            ref={active ? activeRef : undefined}
            onClick={() => onSelect(p.id)}
            className="group relative cursor-pointer transition-all duration-200"
            style={{
              animationDelay: `${Math.min(i * 15, 300)}ms`,
              animation: "fade-in 0.35s ease-out both",
            }}
          >
            {/* Active glow */}
            {active && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "linear-gradient(90deg, var(--amber-glow) 0%, transparent 100%)",
                  borderLeft: "3px solid var(--amber)",
                }}
              />
            )}

            <div
              className="relative px-5 py-3 border-b"
              style={{
                borderColor: "var(--ink-border)",
                background: active
                  ? "linear-gradient(90deg, rgba(200,150,74,0.06) 0%, transparent 100%)"
                  : "transparent",
              }}
            >
              {/* Hover bg */}
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
                style={{
                  background:
                    "linear-gradient(90deg, rgba(255,255,255,0.015) 0%, transparent 100%)",
                }}
              />

              <div className="relative">
                {/* Title */}
                <p
                  className="text-[13px] font-medium line-clamp-2 leading-relaxed mb-1.5 tracking-[0.01em]"
                  style={{
                    color: active ? "var(--paper)" : "var(--paper-muted)",
                    fontFamily: "var(--font-ui)",
                  }}
                >
                  {p.title || "(无标题)"}
                </p>

                {/* Meta row */}
                <div
                  className="flex items-center gap-3 text-[11px] tracking-wide"
                  style={{
                    color: active ? "var(--amber-muted)" : "var(--paper-dim)",
                    fontFamily: "var(--font-ui)",
                  }}
                >
                  <span>{formatDate(p.created_at)}</span>
                  <span className="flex items-center gap-1">
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
                    </svg>
                    {p.like_count}
                  </span>
                  <span className="flex items-center gap-1">
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                    </svg>
                    {p.fav_count}
                  </span>
                  <span className="flex items-center gap-1">
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    {p.comment_count}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {posts.length === 0 && (
        <div
          className="px-5 py-10 text-center text-[13px]"
          style={{ color: "var(--paper-dim)" }}
        >
          没有匹配的帖子
        </div>
      )}
    </div>
  );
}
