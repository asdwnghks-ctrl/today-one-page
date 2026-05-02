import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  const cookieStore = await cookies();
  const slug = cookieStore.get("top_profile")?.value;

  const profilesRes = await supabaseAdmin
    .from("profiles")
    .select("id,slug,display_name,color_key,accent_color,accent_deep,accent_soft")
    .order("slug");
  if (profilesRes.error) {
    return NextResponse.json({ error: profilesRes.error.message }, { status: 500 });
  }

  const profiles = profilesRes.data ?? [];
  const me = profiles.find((profile) => profile.slug === slug) ?? null;

  if (!me) {
    return NextResponse.json({
      me: null,
      profiles,
      sections: [],
      books: [],
      segments: [],
      progress: null,
      readingStates: [],
      highlights: [],
      comments: [],
      replies: [],
      reactions: [],
      messages: [],
      messageReads: [],
      notifications: [],
      proposals: [],
      verseCounts: [],
    });
  }

  const [
    sectionsRes,
    booksRes,
    segmentsRes,
    progressRes,
    statesRes,
    highlightsRes,
    commentsRes,
    repliesRes,
    reactionsRes,
    messagesRes,
    readsRes,
    proposalsRes,
    verseCountsRes,
  ] = await Promise.all([
    supabaseAdmin.from("sections").select("*").order("sort_order"),
    supabaseAdmin.from("books").select("*").order("sort_order"),
    supabaseAdmin.from("segments").select("*").order("global_order"),
    supabaseAdmin.from("reading_progress").select("*").limit(1).maybeSingle(),
    supabaseAdmin.from("reading_states").select("id,segment_id,profile_id,checked_at").not("checked_at", "is", null),
    supabaseAdmin.from("highlights").select("*").is("deleted_at", null).order("created_at"),
    supabaseAdmin.from("comments").select("*").is("deleted_at", null).order("created_at"),
    supabaseAdmin.from("replies").select("*").is("deleted_at", null).order("created_at"),
    supabaseAdmin.from("reactions").select("*"),
    supabaseAdmin.from("messages").select("*").order("created_at", { ascending: false }).limit(120),
    supabaseAdmin.from("message_reads").select("*"),
    supabaseAdmin.from("book_proposals").select("*").order("created_at", { ascending: false }).limit(10),
    supabaseAdmin.from("verse_counts").select("book_id,chapter,verse_count"),
  ]);

  const errors = [
    sectionsRes.error,
    booksRes.error,
    segmentsRes.error,
    progressRes.error,
    statesRes.error,
    highlightsRes.error,
    commentsRes.error,
    repliesRes.error,
    reactionsRes.error,
    messagesRes.error,
    readsRes.error,
    proposalsRes.error,
    verseCountsRes.error,
  ].filter(Boolean);

  if (errors.length > 0) {
    return NextResponse.json({ error: errors[0]?.message }, { status: 500 });
  }

  const { data: notifications, error: notificationError } = await supabaseAdmin
    .from("notifications")
    .select("*")
    .eq("profile_id", me.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (notificationError) return NextResponse.json({ error: notificationError.message }, { status: 500 });

  return NextResponse.json({
    me,
    profiles,
    sections: sectionsRes.data ?? [],
    books: booksRes.data ?? [],
    segments: segmentsRes.data ?? [],
    progress: progressRes.data ?? null,
    readingStates: statesRes.data ?? [],
    highlights: highlightsRes.data ?? [],
    comments: commentsRes.data ?? [],
    replies: repliesRes.data ?? [],
    reactions: reactionsRes.data ?? [],
    messages: (messagesRes.data ?? []).reverse(),
    messageReads: readsRes.data ?? [],
    notifications,
    proposals: proposalsRes.data ?? [],
    verseCounts: verseCountsRes.data ?? [],
  });
}
