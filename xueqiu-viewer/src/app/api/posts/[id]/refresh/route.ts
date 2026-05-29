import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { refreshPost } from "@/lib/scraper";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const postsDir = path.join(process.cwd(), "..", "output_4533843739", "posts");
  const filepath = path.join(postsDir, `${id}.json`);

  if (!fs.existsSync(filepath)) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const existing = JSON.parse(fs.readFileSync(filepath, "utf-8"));
  const target: string = existing.status?.target;
  const statusId: number = existing.status?.id;

  if (!target) {
    return NextResponse.json({ error: "Missing target field" }, { status: 400 });
  }

  try {
    const fresh = await refreshPost(target, statusId);

    // Merge: update article_text, comments, and merge status metadata
    const updatedStatus = fresh.status_meta
      ? { ...existing.status, ...fresh.status_meta }
      : existing.status;

    const updated = {
      ...existing,
      status: updatedStatus,
      article_text: fresh.article_text || existing.article_text,
      comments: fresh.comments,
      refreshed_at: new Date().toISOString(),
    };

    fs.writeFileSync(filepath, JSON.stringify(updated, null, 2), "utf-8");

    return NextResponse.json(updated);
  } catch (err: any) {
    console.error("Refresh error:", err);
    return NextResponse.json(
      { error: err.message || "Refresh failed" },
      { status: 500 },
    );
  }
}
