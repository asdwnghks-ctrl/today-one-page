import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { advanceAfterDailyResetIfDue, resolveNextBook } from "@/lib/reading-progress";
import { supabaseAdmin } from "@/lib/supabase-admin";

function isMissingSessionIdColumn(error: { code?: string; message?: string } | null) {
  return error?.code === "42703" || error?.message?.includes("reading_misses.session_id");
}

// The hosted project caps PostgREST responses at 1000 rows regardless of the
// requested range, so tables larger than that (segments, verse_counts) have
// to be paged through manually.
async function fetchAllRows(table: string, columns: string, orderBy: string) {
  const pageSize = 1000;
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select(columns)
      .order(orderBy)
      .range(from, from + pageSize - 1);
    if (error) return { data: null, error };
    const page = (data ?? []) as unknown as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return { data: rows, error: null };
}

const LOGGED_OUT_STATE = {
  me: null,
  profiles: [],
  groupName: "",
  inviteCode: "",
  isOwner: false,
  readingMode: "daily_one" as const,
  planDay: null,
  nextBook: null,
  sections: [],
  books: [],
  segments: [],
  progress: null,
  readingStates: [],
  highlights: [],
  comments: [],
  replies: [],
  reactions: [],
  notifications: [],
  proposals: [],
  verseCounts: [],
  missCounts: {},
  revealedGiftMissCounts: {},
  manualAdvance: { available: false, missedProfileIds: [] },
  myGift: null,
  partnerHasGift: false,
  revealedGifts: [],
};

export async function GET() {
  const cookieStore = await cookies();
  const groupId = cookieStore.get("top_group")?.value;
  const slug = cookieStore.get("top_profile")?.value;

  if (!groupId || !slug) {
    return NextResponse.json(LOGGED_OUT_STATE);
  }

  const [groupRes, profilesRes] = await Promise.all([
    supabaseAdmin.from("groups").select("id,name,invite_code,owner_id,reading_mode").eq("id", groupId).maybeSingle(),
    supabaseAdmin
      .from("profiles")
      .select("id,slug,display_name,color_key,accent_color,accent_deep,accent_soft,group_id")
      .eq("group_id", groupId)
      .order("slug"),
  ]);
  if (groupRes.error) return NextResponse.json({ error: groupRes.error.message }, { status: 500 });
  if (profilesRes.error) return NextResponse.json({ error: profilesRes.error.message }, { status: 500 });

  const group = groupRes.data;
  const profiles = profilesRes.data ?? [];
  const me = profiles.find((profile) => profile.slug === slug) ?? null;

  if (!group || !me) {
    const response = NextResponse.json(LOGGED_OUT_STATE);
    response.cookies.delete("top_group");
    response.cookies.delete("top_profile");
    return response;
  }

  await advanceAfterDailyResetIfDue(groupId);

  const profileIds = profiles.map((p) => p.id);

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
    proposalsRes,
    verseCountsRes,
  ] = await Promise.all([
    supabaseAdmin.from("sections").select("*").order("sort_order"),
    supabaseAdmin.from("books").select("*").order("sort_order"),
    fetchAllRows("segments", "*", "global_order"),
    supabaseAdmin.from("reading_progress").select("*").eq("group_id", groupId).maybeSingle(),
    supabaseAdmin
      .from("reading_states")
      .select("id,segment_id,profile_id,checked_at")
      .in("profile_id", profileIds)
      .not("checked_at", "is", null),
    supabaseAdmin.from("highlights").select("*").in("profile_id", profileIds).is("deleted_at", null).order("created_at"),
    supabaseAdmin.from("comments").select("*").in("profile_id", profileIds).is("deleted_at", null).order("created_at"),
    supabaseAdmin.from("replies").select("*").in("profile_id", profileIds).is("deleted_at", null).order("created_at"),
    supabaseAdmin.from("reactions").select("*").in("profile_id", profileIds),
    supabaseAdmin.from("book_proposals").select("*").eq("group_id", groupId).order("created_at", { ascending: false }).limit(10),
    fetchAllRows("verse_counts", "book_id,chapter,verse_count", "id"),
  ]);

  const progress = progressRes.data ?? null;
  const isOwner = group.owner_id != null && group.owner_id === me.id;

  let nextBook: { bookId: string; isOwnerPick: boolean } | null = null;
  if (group.reading_mode === "daily_one" && progress?.current_book_id) {
    const resolved = await resolveNextBook(groupId, progress.current_book_id);
    nextBook = { bookId: resolved.bookId, isOwnerPick: resolved.source === "owner" };
  }

  let planDay: { day_index: number; book_id: string; segment_ids: string[] } | null = null;
  if (group.reading_mode === "plan" && progress?.plan_day_index != null) {
    const { data: planDayRow, error: planDayError } = await supabaseAdmin
      .from("plan_days")
      .select("day_index,book_id,segment_ids")
      .eq("day_index", progress.plan_day_index)
      .maybeSingle();
    if (planDayError) return NextResponse.json({ error: planDayError.message }, { status: 500 });
    planDay = planDayRow ?? null;
  }
  const requiredSegmentIds = planDay ? planDay.segment_ids : progress?.current_segment_id ? [progress.current_segment_id] : [];

  // miss counts (현재 책 session 기준)
  let missCounts: Record<string, number> = {};
  let revealedGiftMissCounts: Record<string, Record<string, number>> = {};
  let manualAdvance = { available: false, missedProfileIds: [] as string[] };
  let myGift = null;
  let partnerHasGift = false;
  let revealedGifts: { session_id: string; profile_id: string; is_revealed: boolean }[] = [];

  if (progress?.session_id) {
    const currentMissesQuery = supabaseAdmin
      .from("reading_misses")
      .select("segment_id,profile_id")
      .eq("session_id", progress.session_id)
      .in("profile_id", profileIds);
    const [missesRes, giftsRes, latestRevealedRes] = await Promise.all([
      currentMissesQuery,
      supabaseAdmin
        .from("book_gifts")
        .select("id,session_id,profile_id,gift_description,is_revealed,revealed_at,created_at")
        .eq("session_id", progress.session_id)
        .in("profile_id", profileIds),
      supabaseAdmin
        .from("book_gifts")
        .select("session_id")
        .eq("is_revealed", true)
        .in("profile_id", profileIds)
        .order("revealed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if ((missesRes.error && !isMissingSessionIdColumn(missesRes.error)) || giftsRes.error || latestRevealedRes.error) {
      return NextResponse.json({ error: missesRes.error?.message ?? giftsRes.error?.message ?? latestRevealedRes.error?.message }, { status: 500 });
    }

    // 가장 최근에 공개된 세션의 선물만 보여준다 — 예전 책의 공개된 선물이 계속 같이 뜨지 않도록.
    let revealedGiftsRes: { data: { id: string; session_id: string; profile_id: string; gift_description: string; is_revealed: boolean; revealed_at: string | null; created_at: string }[] | null; error: null } = {
      data: [],
      error: null,
    };
    if (latestRevealedRes.data?.session_id) {
      const { data, error } = await supabaseAdmin
        .from("book_gifts")
        .select("id,session_id,profile_id,gift_description,is_revealed,revealed_at,created_at")
        .eq("session_id", latestRevealedRes.data.session_id)
        .eq("is_revealed", true)
        .in("profile_id", profileIds);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      revealedGiftsRes = { data, error: null };
    }

    for (const profile of profiles) missCounts[profile.id] = 0;
    let currentMisses = missesRes.data ?? [];
    if (isMissingSessionIdColumn(missesRes.error)) {
      const { data: legacyMisses, error: legacyMissesError } = await supabaseAdmin
        .from("reading_misses")
        .select("segment_id,profile_id")
        .in("profile_id", profileIds);
      if (legacyMissesError) return NextResponse.json({ error: legacyMissesError.message }, { status: 500 });
      currentMisses = legacyMisses ?? [];
    }

    for (const miss of currentMisses) {
      missCounts[miss.profile_id] = (missCounts[miss.profile_id] ?? 0) + 1;
    }

    const missedProfileIds = Array.from(
      new Set(
        currentMisses
          .filter((miss) => miss.segment_id === progress.current_segment_id)
          .map((miss) => miss.profile_id),
      ),
    );
    const meHasReadToday =
      requiredSegmentIds.length > 0 &&
      requiredSegmentIds.every((segmentId) =>
        (statesRes.data ?? []).some((state) => state.segment_id === segmentId && state.profile_id === me.id),
      );
    manualAdvance = {
      available: missedProfileIds.length > 0 && meHasReadToday,
      missedProfileIds,
    };

    const gifts = giftsRes.data ?? [];
    myGift = gifts.find((g) => g.profile_id === me.id && !g.is_revealed) ?? null;
    partnerHasGift = gifts.some((g) => g.profile_id !== me.id && !g.is_revealed);
    revealedGifts = revealedGiftsRes.data ?? [];

    const revealedSessionIds = Array.from(new Set(revealedGifts.map((gift) => gift.session_id)));
    if (revealedSessionIds.length > 0) {
      const { data: revealedMisses, error: revealedMissesError } = await supabaseAdmin
        .from("reading_misses")
        .select("session_id,profile_id")
        .in("session_id", revealedSessionIds)
        .in("profile_id", profileIds);

      for (const sessionId of revealedSessionIds) {
        revealedGiftMissCounts[sessionId] = {};
        for (const profile of profiles) revealedGiftMissCounts[sessionId][profile.id] = 0;
      }
      if (isMissingSessionIdColumn(revealedMissesError)) {
        const { data: legacyRevealedMisses, error: legacyRevealedMissesError } = await supabaseAdmin
          .from("reading_misses")
          .select("profile_id")
          .in("profile_id", profileIds);
        if (legacyRevealedMissesError) return NextResponse.json({ error: legacyRevealedMissesError.message }, { status: 500 });

        const legacyCounts: Record<string, number> = {};
        for (const profile of profiles) legacyCounts[profile.id] = 0;
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
    .neq("type", "message")
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (notificationError) return NextResponse.json({ error: notificationError.message }, { status: 500 });

  return NextResponse.json({
    me,
    profiles,
    groupName: group.name,
    inviteCode: group.invite_code,
    isOwner,
    readingMode: group.reading_mode,
    planDay,
    nextBook,
    sections: sectionsRes.data ?? [],
    books: booksRes.data ?? [],
    segments: segmentsRes.data ?? [],
    progress,
    readingStates: statesRes.data ?? [],
    highlights: highlightsRes.data ?? [],
    comments: commentsRes.data ?? [],
    replies: repliesRes.data ?? [],
    reactions: reactionsRes.data ?? [],
    notifications: notifications ?? [],
    proposals: proposalsRes.data ?? [],
    verseCounts: verseCountsRes.data ?? [],
    missCounts,
    revealedGiftMissCounts,
    manualAdvance,
    myGift,
    partnerHasGift,
    revealedGifts,
  });
}
