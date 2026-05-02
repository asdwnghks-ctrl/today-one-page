import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv } from "../lib/env";

loadLocalEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const internalPassword = process.env.INTERNAL_AUTH_PASSWORD;

if (!supabaseUrl || !secretKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY");
}

const supabase = createClient(supabaseUrl, secretKey, {
  auth: { persistSession: false },
});

type SeedData = {
  sections: Record<string, { name: string; description: string; order: number }>;
  books: Record<string, { name: string; section: string; order: number; chapter_count: number }>;
  segments: Array<{
    id: string;
    book_slug: string;
    book_name: string;
    section: string;
    order_in_book: number;
    global_order: number;
    chapter: number;
    display: string;
    mark: string | null;
  }>;
};

const WOL_BASE = "https://wol.jw.org/ko/wol/binav/r8/lp-ko/nwtsty";
const ECCLESIASTES_VERSES = [18, 26, 22, 16, 20, 12, 29, 17, 18, 20, 10, 14];

async function upsert<T extends object>(table: string, rows: T[], onConflict: string) {
  if (rows.length === 0) return;
  const { error } = await supabase.from(table).upsert(rows, { onConflict });
  if (error) throw new Error(`${table}: ${error.message}`);
}

async function main() {
  const seed = JSON.parse(fs.readFileSync("seed_data.json", "utf8")) as SeedData;

  const sections = Object.entries(seed.sections).map(([id, section]) => ({
    id,
    name: section.name,
    description: section.description,
    sort_order: section.order,
  }));

  const books = Object.entries(seed.books).map(([id, book]) => ({
    id,
    section_id: book.section,
    name: book.name,
    sort_order: book.order,
    chapter_count: book.chapter_count,
    wol_book_number: book.order,
  }));

  const segments = seed.segments.map((segment) => ({
    id: segment.id,
    book_id: segment.book_slug,
    book_name: segment.book_name,
    section_id: segment.section,
    chapter: segment.chapter,
    display: segment.display,
    sort_order: segment.order_in_book,
    global_order: segment.global_order,
    mark: segment.mark,
    jw_url: `${WOL_BASE}/${seed.books[segment.book_slug].order}/${segment.chapter}`,
  }));

  const profiles = [
    {
      slug: "joohwan",
      display_name: "주환",
      role: "reader",
      color_key: "olive",
      accent_color: "#5F6F3E",
      accent_deep: "#48552F",
      accent_soft: "#E8E5D4",
      auth_email: "joohwan@today-one-page.local",
    },
    {
      slug: "heejin",
      display_name: "희진",
      role: "reader",
      color_key: "pink",
      accent_color: "#A93F62",
      accent_deep: "#8F2F50",
      accent_soft: "#FCE4EC",
      auth_email: "heejin@today-one-page.local",
    },
  ];

  await upsert("sections", sections, "id");
  await upsert("books", books, "id");
  await upsert("segments", segments, "id");
  await upsert("profiles", profiles, "slug");

  const verseCounts = ECCLESIASTES_VERSES.map((verse_count, index) => ({
    book_id: "ecc",
    chapter: index + 1,
    verse_count,
  }));
  await upsert("verse_counts", verseCounts, "book_id,chapter");

  const { data: current } = await supabase.from("reading_progress").select("id").limit(1).maybeSingle();
  const { data: firstSegment, error: segmentError } = await supabase
    .from("segments")
    .select("id")
    .eq("book_id", "ecc")
    .eq("chapter", 1)
    .single();
  if (segmentError) throw new Error(segmentError.message);

  if (!current) {
    const { error } = await supabase.from("reading_progress").insert({
      current_book_id: "ecc",
      current_segment_id: firstSegment.id,
      initial_book_id: "ecc",
      status: "reading",
    });
    if (error) throw new Error(error.message);
  }

  if (internalPassword) {
    for (const profile of profiles) {
      const { error } = await supabase.auth.admin.createUser({
        email: profile.auth_email,
        password: internalPassword,
        email_confirm: true,
        user_metadata: { slug: profile.slug, display_name: profile.display_name },
      });
      if (error && !error.message.toLowerCase().includes("already")) {
        console.warn(`Auth user ${profile.slug}: ${error.message}`);
      }
    }
  }

  console.log("Database seed complete");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
