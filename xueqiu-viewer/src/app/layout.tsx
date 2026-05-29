import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "雪球帖子浏览器",
  description: "深夜研报 — 雪球用户时间线阅读器",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="h-screen flex flex-col">{children}</body>
    </html>
  );
}
