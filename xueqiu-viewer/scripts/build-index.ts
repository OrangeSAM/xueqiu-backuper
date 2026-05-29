import fs from "fs";
import path from "path";

const POSTS_DIR = path.join(process.cwd(), "..", "output_4533843739", "posts");
const OUTPUT = path.join(process.cwd(), "public", "data", "posts-index.json");

interface PostIndex {
  id: number;
  title: string;
  description: string;
  created_at: number;
  like_count: number;
  fav_count: number;
  retweet_count: number;
  reply_count: number;
  comment_count: number;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").trim();
}

function build() {
  const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith(".json"));
  const posts: PostIndex[] = [];

  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(POSTS_DIR, file), "utf-8"));
    const s = data.status;
    posts.push({
      id: s.id,
      title: stripHtml(s.title || s.description || ""),
      description: stripHtml(s.description || "").substring(0, 120),
      created_at: s.created_at,
      like_count: s.like_count || 0,
      fav_count: s.fav_count || 0,
      retweet_count: s.retweet_count || 0,
      reply_count: s.reply_count || 0,
      comment_count: Array.isArray(data.comments) ? data.comments.length : 0,
    });
  }

  posts.sort((a, b) => b.created_at - a.created_at);

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(posts, null, 2), "utf-8");
  console.log(`Index built: ${posts.length} posts → ${OUTPUT}`);
}

build();
