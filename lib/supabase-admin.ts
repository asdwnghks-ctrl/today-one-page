import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !secretKey) {
  throw new Error("Missing Supabase server env");
}

export const supabaseAdmin = createClient(supabaseUrl, secretKey, {
  auth: {
    persistSession: false,
  },
});

export const WOL_BASE = "https://wol.jw.org/ko/wol/b/r8/lp-ko/nwtsty";

export function wolChapterUrl(bookNumber: number, chapter: number) {
  return `${WOL_BASE}/${bookNumber}/${chapter}`;
}
