import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { advanceAfterDailyResetIfDue } from "@/lib/reading-progress";
import { supabaseAdmin } from "@/lib/supabase-admin";

function isMissingSessionIdColumn(error: { code?: string; message?: string } | null) {
  return error?.code === "42703" || error?.message?.includes("reading_misses.session_id");
}

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
      missCounts: {},
      revealedGiftMissCounts: {},
      myGift: null,
      partnerHasGift: false,
      revealedGifts: [],
    });
  }

  await advanceAfterDailyResetIfDue();

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

  const progress = progressRes.data ?? null;

  // miss counts (현재 책 session 기준)
  let missCounts: Record<string, number> = {};
  let revealedGiftMissCounts: Record<string, Record<string, number>> = {};
  let myGift = null;
  let partnerHasGift = false;
  let revealedGifts: { session_id: string; profile_id: string; is_revealed: boolean }[] = [];

  if (progress?.session_id) {
    const profileIds = (profilesRes.data ?? []).map((p) => p.id);
    const currentMissesQuery = supabaseAdmin
      .from("reading_misses")
      .select("profile_id")
      .eq("session_id", progress.session_id)
      .in("profile_id", profileIds);
    const [missesRes, giftsRes, revealedGiftsRes] = await Promise.all([
      currentMissesQuery,
      supabaseAdmin
        .from("book_gifts")
        .select("id,session_id,profile_id,gift_description,is_revealed,revealed_at,created_at")
        .eq("session_id", progress.session_id),
      supabaseAdmin
        .from("book_gifts")
        .select("id,session_id,profile_id,gift_description,is_revealed,revealed_at,created_at")
        .eq("is_revealed", true)
        .order("revealed_at", { ascending: false })
        .limit(6),
    ]);
    if ((missesRes.error && !isMissingSessionIdColumn(missesRes.error)) || giftsRes.error || revealedGiftsRes.error) {
      return NextResponse.json({ error: missesRes.error?.message ?? giftsRes.error?.message ?? revealedGiftsRes.error?.message }, { status: 500 });
    }

    for (const profile of profilesRes.data ?? []) missCounts[profile.id] = 0;
    let currentMisses = missesRes.data ?? [];
    if (isMissingSessionIdColumn(missesRes.error)) {
      const { data: legacyMisses, error: legacyMissesError } = await supabaseAdmin
        .from("reading_misses")
        .select("profile_id")
        .in("profile_id", profileIds);
      if (legacyMissesError) return NextResponse.json({ error: legacyMissesError.message }, { status: 500 });
      currentMisses = legacyMisses ?? [];
    }

    for (const miss of currentMisses) {
      missCounts[miss.profile_id] = (missCounts[miss.profile_id] ?? 0) + 1;
    }

    const gifts = giftsRes.data ?? [];
    myGift = gifts.find((g) => g.profile_id === me.id && !g.is_revealed) ?? null;
    partnerHasGift = gifts.some((g) => g.profile_id !== me.id && !g.is_revealed);
    revealedGifts = revealedGiftsRes.data ?? [];

    const revealedSessionIds = Array.from(new Set(revealedGifts.map((gift) => gift.session_id)));
    if (revealedSessionIds.length > 0) {
      const { data: revealedMisses, error: revealedMissesError } = await supabaseAdmin
        .from("reading_misses")
        .select("session_id,profile_id")
        .in("session_id", revealedSessionIds);

      for (const sessionId of revealedSessionIds) {
        revealedGiftMissCounts[sessionId] = {};
        for (const profile of profilesRes.data ?? []) revealedGiftMissCounts[sessionId][profile.id] = 0;
      }
      if (isMissingSessionIdColumn(revealedMissesError)) {
        const { data: legacyRevealedMisses, error: legacyRevealedMissesError } = await supabaseAdmin
          .from("reading_misses")
          .select("profile_id")
          .in("profile_id", profileIds);
        if (legacyRevealedMissesError) return NextResponse.json({ error: legacyRevealedMissesError.message }, { status: 500 });

        const legacyCounts: Record<string, number> = {};
        for (const profile of profilesRes.data ?? []) legacyCounts[profile.id] = 0;
        for (const miss of legacyRevealedMisses ?? []) legacyCounts[miss.profile_id] = (legacyCounts[miss.profile_id] ?? 0) + 1;
        for (const sessionId of revealedSessionIds) revealedGiftMissCounts[sessionId] = { ...legacyCounts };
      } else {
        if (revealedMissesError) return NextResponse.json({ error: revealedMissesError.message }, { status: 500 });
        for (const miss of revealedMisses ?? []) {
          const sessionCounts = revealedGiftMissCounts[miss.session_id] ?? {};
          sessionCounts[miss.profile_id] = (sessionCounts[miss.profile_id] ?? 0) + 1;
          revealedGiftMissCounts[miss.session_id] = sessionCounts;
        }
      }
    }
  }

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
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (notificationError) return NextResponse.json({ error: notificationError.message }, { status: 500 });
  let visibleNotifications = notifications ?? [];
  const notificationMessageIds = visibleNotifications
    .filter((item) => item.target_type === "message" && item.target_id)
    .map((item) => item.target_id as string);
  if (notificationMessageIds.length > 0) {
    const { data: notificationMessages, error: notificationMessagesError } = await supabaseAdmin
      .from("messages")
      .select("id,deleted_at")
      .in("id", notificationMessageIds);
    if (notificationMessagesError) return NextResponse.json({ error: notificationMessagesError.message }, { status: 500 });

    const visibleMessageIds = new Set((notificationMessages ?? []).filter((message) => !message.deleted_at).map((message) => message.id));
    visibleNotifications = visibleNotifications.filter(
      (item) => item.target_type !== "message" || (item.target_id && visibleMessageIds.has(item.target_id)),
    );
  }

  return NextResponse.json({
    me,
    profiles,
    sections: sectionsRes.data ?? [],
    books: booksRes.data ?? [],
    segments: segmentsRes.data ?? [],
    progress,
    readingStates: statesRes.data ?? [],
    highlights: highlightsRes.data ?? [],
    comments: commentsRes.data ?? [],
    replies: repliesRes.data ?? [],
    reactions: reactionsRes.data ?? [],
    messages: (messagesRes.data ?? []).reverse(),
    messageReads: readsRes.data ?? [],
    notifications: visibleNotifications,
    proposals: proposalsRes.data ?? [],
    verseCounts: verseCountsRes.data ?? [],
    missCounts,
    revealedGiftMissCounts,
    myGift,
    partnerHasGift,
    revealedGifts,
  });
}
