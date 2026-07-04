import { supabaseAdmin } from "@/lib/supabase-admin";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const GIFT_CYCLE_DAYS = 30;

type ProgressForAdvance = {
  id: string;
  current_segment_id: string;
  session_id: string;
  plan_day_index: number | null;
  updated_at?: string;
};

type AcceptedProposal = {
  id: string;
  proposed_book_id: string;
};

type AdvanceResult = {
  segmentId: string | null;
};

type Group = {
  id: string;
  reading_mode: "daily_one" | "plan";
};

function isMissingSessionIdColumn(error: { code?: string; message?: string } | null) {
  return error?.code === "42703" || error?.message?.includes("reading_misses.session_id");
}

export function getKstResetBoundary(now = new Date()) {
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
  const boundaryMs =
    Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate(), 2, 0, 0) - KST_OFFSET_MS;

  return new Date(now.getTime() < boundaryMs ? boundaryMs - DAY_MS : boundaryMs);
}

async function getGroup(groupId: string): Promise<Group> {
  const { data, error } = await supabaseAdmin.from("groups").select("id,reading_mode").eq("id", groupId).single();
  if (error) throw error;
  return data as Group;
}

async function getPlanDay(dayIndex: number) {
  const { data, error } = await supabaseAdmin
    .from("plan_days")
    .select("day_index,book_id,segment_ids")
    .eq("day_index", dayIndex)
    .maybeSingle();
  if (error) throw error;
  return data as { day_index: number; book_id: string; segment_ids: string[] } | null;
}

async function getRequiredSegmentIds(progress: ProgressForAdvance, group: Group): Promise<string[]> {
  if (group.reading_mode === "plan") {
    if (progress.plan_day_index == null) return [];
    const day = await getPlanDay(progress.plan_day_index);
    return day?.segment_ids ?? [];
  }
  return progress.current_segment_id ? [progress.current_segment_id] : [];
}

async function revealGiftsForSession(sessionId: string, profileIds: string[]) {
  const { data: misses, error: missError } = await supabaseAdmin
    .from("reading_misses")
    .select("profile_id")
    .eq("session_id", sessionId)
    .in("profile_id", profileIds);
  let sessionMisses = misses ?? [];
  if (missError) {
    if (!isMissingSessionIdColumn(missError)) throw missError;
    const { data: legacyMisses, error: legacyMissError } = await supabaseAdmin
      .from("reading_misses")
      .select("profile_id")
      .in("profile_id", profileIds);
    if (legacyMissError) throw legacyMissError;
    sessionMisses = legacyMisses ?? [];
  }

  const counts: Record<string, number> = {};
  for (const profileId of profileIds) counts[profileId] = 0;
  for (const miss of sessionMisses) counts[miss.profile_id] = (counts[miss.profile_id] ?? 0) + 1;

  const maxCount = Math.max(...Object.values(counts));
  const losers = maxCount === 0 ? profileIds : profileIds.filter((id) => counts[id] === maxCount);

  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("book_gifts")
    .update({ is_revealed: true, revealed_at: now })
    .eq("session_id", sessionId)
    .in("profile_id", losers);
  if (error) throw error;
}

export async function getFirstSegmentOfBook(bookId: string) {
  const { data: firstSegment, error } = await supabaseAdmin
    .from("segments")
    .select("*")
    .eq("book_id", bookId)
    .eq("chapter", 1)
    .single();
  if (error) throw error;
  return firstSegment;
}

export async function startAcceptedProposal(
  progress: { id: string },
  proposal: AcceptedProposal,
  now = new Date().toISOString(),
) {
  const firstSegment = await getFirstSegmentOfBook(proposal.proposed_book_id);
  const { error: progressError } = await supabaseAdmin
    .from("reading_progress")
    .update({
      current_book_id: proposal.proposed_book_id,
      current_segment_id: firstSegment.id,
      status: "reading",
      started_at: now,
      completed_at: null,
      updated_at: now,
      session_id: crypto.randomUUID(),
    })
    .eq("id", progress.id);
  if (progressError) throw progressError;

  const { error: proposalError } = await supabaseAdmin
    .from("book_proposals")
    .update({ status: "started" })
    .eq("id", proposal.id);
  if (proposalError) throw proposalError;

  return firstSegment;
}

async function getAcceptedProposal(groupId: string) {
  const { data, error } = await supabaseAdmin
    .from("book_proposals")
    .select("id,proposed_book_id")
    .eq("group_id", groupId)
    .eq("status", "accepted")
    .order("accepted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as AcceptedProposal | null;
}

async function getReadBookIds(groupId: string, profileIds: string[]): Promise<Set<string>> {
  const bookIds = new Set<string>();

  const { data: progress, error: progressError } = await supabaseAdmin
    .from("reading_progress")
    .select("initial_book_id,current_book_id")
    .eq("group_id", groupId)
    .maybeSingle();
  if (progressError) throw progressError;
  if (progress?.initial_book_id) bookIds.add(progress.initial_book_id);
  if (progress?.current_book_id) bookIds.add(progress.current_book_id);

  const { data: states, error: statesError } = await supabaseAdmin
    .from("reading_states")
    .select("segment_id")
    .in("profile_id", profileIds)
    .not("checked_at", "is", null);
  if (statesError) throw statesError;
  const segmentIds = Array.from(new Set((states ?? []).map((s) => s.segment_id)));
  if (segmentIds.length) {
    const { data: segments, error: segmentsError } = await supabaseAdmin.from("segments").select("book_id").in("id", segmentIds);
    if (segmentsError) throw segmentsError;
    for (const segment of segments ?? []) bookIds.add(segment.book_id);
  }

  const { data: started, error: startedError } = await supabaseAdmin
    .from("book_proposals")
    .select("proposed_book_id")
    .eq("group_id", groupId)
    .eq("status", "started");
  if (startedError) throw startedError;
  for (const row of started ?? []) bookIds.add(row.proposed_book_id);

  return bookIds;
}

export type NextBookResolution = { source: "owner" | "auto"; bookId: string; proposalId?: string };

export async function resolveNextBook(groupId: string, excludeBookId: string | null): Promise<NextBookResolution> {
  const accepted = await getAcceptedProposal(groupId);
  if (accepted) return { source: "owner", bookId: accepted.proposed_book_id, proposalId: accepted.id };

  const { data: profiles, error: profileError } = await supabaseAdmin.from("profiles").select("id").eq("group_id", groupId);
  if (profileError) throw profileError;
  const profileIds = (profiles ?? []).map((p) => p.id);

  const readBookIds = await getReadBookIds(groupId, profileIds);
  if (excludeBookId) readBookIds.add(excludeBookId);

  const { data: books, error: booksError } = await supabaseAdmin.from("books").select("id").order("sort_order");
  if (booksError) throw booksError;
  if (!books?.length) throw new Error("책 정보를 찾지 못했어요");

  const unread = books.find((book) => !readBookIds.has(book.id));
  return { source: "auto", bookId: unread?.id ?? books[0].id };
}

async function advanceProgress(progress: ProgressForAdvance, segmentId: string, groupId: string): Promise<AdvanceResult> {
  const { data: currentSegment, error: segmentError } = await supabaseAdmin
    .from("segments")
    .select("*")
    .eq("id", segmentId)
    .single();
  if (segmentError) throw segmentError;

  const { data: nextSegment, error: nextError } = await supabaseAdmin
    .from("segments")
    .select("*")
    .eq("book_id", currentSegment.book_id)
    .eq("chapter", currentSegment.chapter + 1)
    .maybeSingle();
  if (nextError) throw nextError;

  const now = new Date().toISOString();

  if (nextSegment) {
    const { error } = await supabaseAdmin
      .from("reading_progress")
      .update({
        current_segment_id: nextSegment.id,
        status: "reading",
        updated_at: now,
      })
      .eq("id", progress.id);
    if (error) throw error;
    return { segmentId: nextSegment.id };
  }

  // 책 완료 — gift 공개
  const { data: profiles, error: profileError } = await supabaseAdmin.from("profiles").select("id").eq("group_id", groupId);
  if (profileError) throw profileError;
  const profileIds = (profiles ?? []).map((p) => p.id);
  await revealGiftsForSession(progress.session_id, profileIds);

  const next = await resolveNextBook(groupId, currentSegment.book_id);
  if (next.source === "owner" && next.proposalId) {
    const firstSegment = await startAcceptedProposal(progress, { id: next.proposalId, proposed_book_id: next.bookId }, now);
    return { segmentId: firstSegment.id };
  }

  const firstSegment = await getFirstSegmentOfBook(next.bookId);
  const { error } = await supabaseAdmin
    .from("reading_progress")
    .update({
      current_book_id: next.bookId,
      current_segment_id: firstSegment.id,
      status: "reading",
      started_at: now,
      completed_at: null,
      updated_at: now,
      session_id: crypto.randomUUID(),
    })
    .eq("id", progress.id);
  if (error) throw error;
  return { segmentId: firstSegment.id };
}

async function advancePlanProgress(progress: ProgressForAdvance, groupId: string): Promise<AdvanceResult> {
  const currentDayIndex = progress.plan_day_index ?? 1;
  const nextDayIndex = currentDayIndex + 1;
  const nextDay = await getPlanDay(nextDayIndex);
  const now = new Date().toISOString();

  const { data: profiles, error: profileError } = await supabaseAdmin.from("profiles").select("id").eq("group_id", groupId);
  if (profileError) throw profileError;
  const profileIds = (profiles ?? []).map((p) => p.id);

  const completingGiftCycle = currentDayIndex % GIFT_CYCLE_DAYS === 0;
  const newSessionId = completingGiftCycle || !nextDay ? crypto.randomUUID() : progress.session_id;
  if (completingGiftCycle || !nextDay) {
    await revealGiftsForSession(progress.session_id, profileIds);
  }

  if (!nextDay) {
    const { error } = await supabaseAdmin
      .from("reading_progress")
      .update({ status: "completed", completed_at: now, updated_at: now, session_id: newSessionId })
      .eq("id", progress.id);
    if (error) throw error;
    return { segmentId: null };
  }

  const { error } = await supabaseAdmin
    .from("reading_progress")
    .update({
      plan_day_index: nextDayIndex,
      current_book_id: nextDay.book_id,
      current_segment_id: nextDay.segment_ids[0],
      status: "reading",
      updated_at: now,
      session_id: newSessionId,
    })
    .eq("id", progress.id);
  if (error) throw error;
  return { segmentId: nextDay.segment_ids[0] };
}

async function recordMissesIfDue(
  progress: ProgressForAdvance,
  profiles: { id: string }[],
  checkedByProfile: Map<string, string>,
  boundary: Date,
  requiredSegmentIds: string[],
) {
  const progressUpdatedAt = new Date((progress as { updated_at?: string }).updated_at ?? 0).getTime();
  if (progressUpdatedAt >= boundary.getTime()) return;
  if (!requiredSegmentIds.length) return;

  const missSegmentId = requiredSegmentIds[0];
  const { data: segment } = await supabaseAdmin
    .from("segments")
    .select("book_id")
    .eq("id", missSegmentId)
    .single();

  const unread = profiles.filter((p) => !checkedByProfile.has(p.id));
  if (!unread.length) return;

  const rows = unread.map((p) => ({
    segment_id: missSegmentId,
    session_id: progress.session_id,
    profile_id: p.id,
    book_id: segment?.book_id ?? "",
    missed_boundary: boundary.toISOString(),
  }));

  const { error } = await supabaseAdmin
    .from("reading_misses")
    .upsert(rows, { onConflict: "segment_id,profile_id,missed_boundary", ignoreDuplicates: true });
  if (isMissingSessionIdColumn(error)) {
    const legacyRows = rows.map(({ session_id: _sessionId, ...row }) => row);
    const { error: legacyError } = await supabaseAdmin
      .from("reading_misses")
      .upsert(legacyRows, { onConflict: "segment_id,profile_id,missed_boundary", ignoreDuplicates: true });
    if (legacyError) throw legacyError;
    return;
  }
  if (error) throw error;
}

async function hasMissForToday(progress: ProgressForAdvance, requiredSegmentIds: string[]) {
  if (!requiredSegmentIds.length) return false;
  const { data, error } = await supabaseAdmin
    .from("reading_misses")
    .select("id")
    .eq("session_id", progress.session_id)
    .in("segment_id", requiredSegmentIds)
    .limit(1);

  if (isMissingSessionIdColumn(error)) {
    const { data: legacyData, error: legacyError } = await supabaseAdmin
      .from("reading_misses")
      .select("id")
      .in("segment_id", requiredSegmentIds)
      .limit(1);
    if (legacyError) throw legacyError;
    return (legacyData ?? []).length > 0;
  }

  if (error) throw error;
  return (data ?? []).length > 0;
}

export async function manualAdvanceIfAllowed(groupId: string, profileId: string) {
  const { data: progress, error: progressError } = await supabaseAdmin
    .from("reading_progress")
    .select("*")
    .eq("group_id", groupId)
    .maybeSingle();
  if (progressError) throw progressError;
  if (!progress || progress.status !== "reading") throw new Error("진행 중인 읽기 범위가 없어요");

  const group = await getGroup(groupId);
  const requiredSegmentIds = await getRequiredSegmentIds(progress, group);
  if (!requiredSegmentIds.length) throw new Error("진행 중인 읽기 범위가 없어요");

  const { data: checkedStates, error: checkedError } = await supabaseAdmin
    .from("reading_states")
    .select("segment_id")
    .in("segment_id", requiredSegmentIds)
    .eq("profile_id", profileId)
    .not("checked_at", "is", null);
  if (checkedError) throw checkedError;
  const checkedCount = new Set((checkedStates ?? []).map((s) => s.segment_id)).size;
  if (checkedCount < requiredSegmentIds.length) throw new Error("내 분량을 읽음 체크한 뒤에 넘어갈 수 있어요");

  const hasMiss = await hasMissForToday(progress, requiredSegmentIds);
  if (!hasMiss) throw new Error("전날 못 읽은 사람이 있을 때만 넘어갈 수 있어요");

  if (group.reading_mode === "plan") return advancePlanProgress(progress, groupId);
  return advanceProgress(progress, progress.current_segment_id, groupId);
}

export async function advanceAfterDailyResetIfDue(groupId: string) {
  const { data: progress, error: progressError } = await supabaseAdmin
    .from("reading_progress")
    .select("*")
    .eq("group_id", groupId)
    .maybeSingle();
  if (progressError) throw progressError;
  if (!progress || progress.status !== "reading") return;

  const group = await getGroup(groupId);
  const requiredSegmentIds = await getRequiredSegmentIds(progress, group);
  if (!requiredSegmentIds.length) return;

  const { data: profiles, error: profileError } = await supabaseAdmin.from("profiles").select("id").eq("group_id", groupId);
  if (profileError) throw profileError;
  if (!profiles?.length) return;

  const { data: states, error: statesError } = await supabaseAdmin
    .from("reading_states")
    .select("profile_id,segment_id,checked_at")
    .in("segment_id", requiredSegmentIds)
    .not("checked_at", "is", null);
  if (statesError) throw statesError;

  const checkedSegmentsByProfile = new Map<string, Set<string>>();
  const latestCheckedAtByProfile = new Map<string, string>();
  for (const state of states ?? []) {
    if (!checkedSegmentsByProfile.has(state.profile_id)) checkedSegmentsByProfile.set(state.profile_id, new Set());
    checkedSegmentsByProfile.get(state.profile_id)!.add(state.segment_id);
    const previous = latestCheckedAtByProfile.get(state.profile_id);
    if (!previous || new Date(state.checked_at).getTime() > new Date(previous).getTime()) {
      latestCheckedAtByProfile.set(state.profile_id, state.checked_at);
    }
  }

  const checkedByProfile = new Map(
    Array.from(checkedSegmentsByProfile.entries())
      .filter(([, segmentIds]) => requiredSegmentIds.every((id) => segmentIds.has(id)))
      .map(([profileId]) => [profileId, latestCheckedAtByProfile.get(profileId) as string]),
  );

  const boundary = getKstResetBoundary();
  const allChecked = profiles.every((profile) => checkedByProfile.has(profile.id));

  if (!allChecked) {
    await recordMissesIfDue(progress, profiles, checkedByProfile, boundary, requiredSegmentIds);
    return;
  }

  const latestCheckedAt = Math.max(...Array.from(checkedByProfile.values()).map((value) => new Date(value).getTime()));
  if (latestCheckedAt >= boundary.getTime()) return;

  if (group.reading_mode === "plan") {
    await advancePlanProgress(progress, groupId);
    return;
  }
  await advanceProgress(progress, progress.current_segment_id, groupId);
}
