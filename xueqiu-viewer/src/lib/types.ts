export interface PostIndex {
  id: number;
  title: string;
  description: string;
  created_at: number;
  fav_count: number;
  retweet_count: number;
  reply_count: number;
  comment_count: number;
}

export interface PostData {
  status: Record<string, unknown>;
  article_text: string;
  comments: CommentData[];
}

export interface CommentData {
  id: number;
  user_id: number;
  created_at: number;
  text: string;
  description: string;
  like_count: number;
  reply_count: number;
  user: {
    screen_name: string;
    id: number;
    profile_image_url: string;
  };
  child_comments: CommentData[];
}
