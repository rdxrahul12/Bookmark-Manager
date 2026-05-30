import { z } from "zod";

// ── Schemas ─────────────────────────────────────────────────────────────────
// Defined once in zod, then derived as TS types so persistence and runtime
// validation stay in sync.

export const BookmarkSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url(),
  favicon: z.string().optional(),
  category: z.string().min(1),
  isPinned: z.boolean(),
  createdAt: z.number(),
});

export const CategorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  emoji: z.string().default(""),
  color: z.string().optional(),
});

export type Bookmark = z.infer<typeof BookmarkSchema>;
export type Category = z.infer<typeof CategorySchema>;

// ── Default seed data ───────────────────────────────────────────────────────
// Categories: emoji is rendered alongside the name (was previously baked into
// the name string with a stray space — moved into the dedicated `emoji` field).

export const DEFAULT_CATEGORIES: Category[] = [
  { id: "google", name: "Google", emoji: "🌐" },
  { id: "social", name: "Social", emoji: "💬" },
  { id: "dsa", name: "DSA", emoji: "🧑‍💻" },
  { id: "development", name: "Development", emoji: "👩‍💻" },
  { id: "shopping", name: "Shopping", emoji: "🛍️" },
  { id: "tools", name: "Tools", emoji: "🛠️" },
  { id: "todo", name: "To Do", emoji: "📌" },
];

const sampleBookmark = (
  id: string,
  title: string,
  url: string,
  category: string,
): Bookmark => ({
  id,
  title,
  url,
  category,
  isPinned: false,
  createdAt: Date.now(),
});

export const SAMPLE_BOOKMARKS: Bookmark[] = [
  sampleBookmark("yt", "YouTube", "https://www.youtube.com/", "google"),
  sampleBookmark("gmail", "Gmail", "https://mail.google.com/", "google"),
  sampleBookmark("classroom", "Classroom", "https://classroom.google.com/", "google"),
  sampleBookmark("keep", "Google Keep", "https://keep.google.com/", "google"),
  sampleBookmark("calendar", "Calendar", "https://calendar.google.com/", "google"),
  sampleBookmark("drive", "Google Drive", "https://drive.google.com/", "google"),
  sampleBookmark("whatsapp", "WhatsApp Web", "https://web.whatsapp.com/", "social"),
  sampleBookmark("instagram", "Instagram", "https://www.instagram.com/", "social"),
  sampleBookmark("linkedin", "LinkedIn", "https://www.linkedin.com/", "social"),
  sampleBookmark("twitter", "X (Twitter)", "https://x.com/", "social"),
  sampleBookmark("leetcode", "LeetCode", "https://leetcode.com/", "dsa"),
  sampleBookmark(
    "striver",
    "Striver A2Z",
    "https://takeuforward.org/strivers-a2z-dsa-course/",
    "dsa",
  ),
  sampleBookmark("codeforces", "Codeforces", "https://codeforces.com/", "dsa"),
  sampleBookmark("codechef", "CodeChef", "https://www.codechef.com/", "dsa"),
  sampleBookmark("gfg", "GeeksforGeeks", "https://www.geeksforgeeks.org/", "dsa"),
  sampleBookmark("loveable", "Loveable", "https://lovable.dev/", "development"),
  sampleBookmark("github", "GitHub", "https://github.com/", "development"),
  sampleBookmark("smartprix", "Smartprix", "https://www.smartprix.com/", "shopping"),
  sampleBookmark("myntra", "Myntra", "https://www.myntra.com/", "shopping"),
  sampleBookmark("amazon", "Amazon", "https://www.amazon.in/", "shopping"),
  sampleBookmark("flipkart", "Flipkart", "https://www.flipkart.com/", "shopping"),
  sampleBookmark("ajio", "AJIO", "https://www.ajio.com/", "shopping"),
  sampleBookmark(
    "ytlength",
    "YT Playlist Length",
    "https://ytplaylist-len.sharats.dev/",
    "tools",
  ),
  sampleBookmark("simplenote", "SimpleNote", "https://app.simplenote.com/", "tools"),
  sampleBookmark("cs50", "CS50 Lectures", "https://cs50.harvard.edu/", "todo"),
  sampleBookmark(
    "campusx",
    "CampusX ML Playlist",
    "https://www.youtube.com/playlist?list=PLKnIA16_Rmvbr7zKYQuBfsVkjoLcJgxHH",
    "todo",
  ),
];

// ── Persistence schema (matches the export format the user already had) ─────

export const PersistedSchema = z.object({
  version: z.string().default("1.0"),
  bookmarks: z.array(BookmarkSchema),
  categories: z.array(CategorySchema),
});

export type Persisted = z.infer<typeof PersistedSchema>;
