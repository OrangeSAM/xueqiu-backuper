"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { PostIndex, PostData } from "@/lib/types";
import PostList from "@/components/post-list";
import PostDetail from "@/components/post-detail";

export default function HomePage() {
  const [posts, setPosts] = useState<PostIndex[]>([]);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<number | null>(null);
  const [postData, setPostData] = useState<PostData | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/data/posts-index.json")
      .then((r) => r.json())
      .then(setPosts);
  }, []);

  const filtered = useMemo(
    () =>
      query.trim()
        ? posts.filter((p) =>
            p.title.toLowerCase().includes(query.toLowerCase()),
          )
        : posts,
    [posts, query],
  );

  const selectPost = useCallback(async (id: number) => {
    setActiveId(id);
    setLoading(true);
    setPostData(null);
    try {
      const resp = await fetch(`/api/posts/${id}`);
      if (resp.ok) {
        setPostData(await resp.json());
      }
    } finally {
      setLoading(false);
    }
    mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const refreshActivePost = useCallback(async () => {
    if (!activeId || refreshing) return;
    setRefreshing(true);
    try {
      const resp = await fetch(`/api/posts/${activeId}/refresh`, { method: "POST" });
      if (resp.ok) {
        const fresh = await resp.json();
        setPostData(fresh);
        // Update the post in the index list as well
        setPosts((prev) =>
          prev.map((p) =>
            p.id === activeId
              ? { ...p, like_count: fresh.status?.like_count ?? p.like_count, fav_count: fresh.status?.fav_count ?? p.fav_count, comment_count: fresh.comments?.length ?? p.comment_count }
              : p,
          ),
        );
      } else {
        const err = await resp.json();
        alert(err.error || "刷新失败，请确认 cookie.txt 中的 cookie 未过期");
      }
    } catch {
      alert("刷新请求失败");
    } finally {
      setRefreshing(false);
    }
  }, [activeId, refreshing]);

  return (
    <div className="flex h-full" style={{ background: "var(--ink)" }}>
      {/* Sidebar */}
      <aside
        className="w-[340px] min-w-[340px] border-r flex flex-col"
        style={{
          background: "var(--ink-surface)",
          borderColor: "var(--ink-border)",
        }}
      >
        {/* Header */}
        <div
          className="px-5 py-4 border-b"
          style={{ borderColor: "var(--ink-border)" }}
        >
          <h1
            className="text-sm font-semibold tracking-wider mb-3"
            style={{ color: "var(--amber)", fontFamily: "var(--font-ui)" }}
          >
            深夜研报
          </h1>
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--paper-dim)"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索帖子..."
              className="w-full pl-9 pr-3 py-2 text-[13px] rounded-md border outline-none transition-all duration-200 placeholder:font-normal"
              style={{
                background: "var(--ink)",
                borderColor: "var(--ink-border-light)",
                color: "var(--paper)",
                fontFamily: "var(--font-ui)",
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "var(--amber-muted)";
                e.target.style.boxShadow = "0 0 0 3px var(--amber-glow)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "var(--ink-border-light)";
                e.target.style.boxShadow = "none";
              }}
            />
          </div>
          <div
            className="text-[11px] mt-2.5 tracking-wide"
            style={{ color: "var(--paper-dim)", fontFamily: "var(--font-ui)" }}
          >
            共 {posts.length} 篇{query && ` · 匹配 ${filtered.length} 篇`}
          </div>
        </div>

        <PostList posts={filtered} activeId={activeId} onSelect={selectPost} />
      </aside>

      {/* Main Content */}
      <main ref={mainRef} className="flex-1 overflow-y-auto">
        <PostDetail
          data={postData}
          loading={loading}
          activeId={activeId}
          onRefresh={refreshActivePost}
          refreshing={refreshing}
        />
      </main>
    </div>
  );
}
