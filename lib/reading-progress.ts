import { supabaseAdmin } from "@/lib/supabase-admin";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function getKstResetBoundary(now = new Date()) {
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
  const boundaryMs =
    Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate(), 2, 0, 0) - KST_OFFSET_MS;

  return new Date(now.getTime() < boundaryMs ? boundaryMs - DAY_MS : boundaryMs);
}

async function revealGiftsForSession(sessionId: string, profileIds: string[]) {
  const { data: misses, error: missError } = await supabaseAdmin
    .from("reading_misses")
    .select("profile_id")
    .in("profile_id", profileIds);
  if (missError) throw missError;

  const counts: Record<string, number> = {};
  for (const profileId of profileIds) counts[profileId] = 0;
  for (const miss of misses ?? []) counts[miss.profile_id] = (counts[miss.profile_id] ?? 0) + 1;

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

async function advanceProgress(progress: { id: string; current_segment_id: string; session_id: string }, segmentId: string) {
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
    return;
  }

  // 책 완료 — gift 공개
  const { data: profiles, error: profileError } = await supabaseAdmin.from("profiles").select("id");
  if (profileError) throw profileError;
  const profileIds = (profiles ?? []).map((p) => p.id);
  await revealGiftsForSession(progress.session_id, profileIds);

  const { error } = await supabaseAdmin
    .from("reading_progress")
    .update({
      status: "choosing_book",
      completed_at: now,
      updated_at: now,
    })
    .eq("id", progress.id);
  if (error) throw error;
}

async function recordMissesIfDue(
  progress: { current_segment_id: string },
  profiles: { id: string }[],
  checkedByProfile: Map<string, string>,
  boundary: Date,
) {
  const progressUpdatedAt = new Date((progress as { updated_at?: string }).updated_at ?? 0).getTime();
  if (progressUpdatedAt >= boundary.getTime()) return;

  const { data: segment } = await supabaseAdmin
    .from("segments")
    .select("book_id")
    .eq("id", progress.current_segment_id)
    .single();

  const unread = profiles.filter((p) => !checkedByProfile.has(p.id));
  if (!unread.length) return;

  const rows = unread.map((p) => ({
    segment_id: progress.current_segment_id,
    profile_id: p.id,
    book_id: segment?.book_id ?? "",
    missed_boundary: boundary.toISOString(),
  }));

  const { error } = await supabaseAdmin
    .from("reading_misses")
    .upsert(rows, { onConflict: "segment_id,profile_id,missed_boundary", ignoreDuplicates: true });
  if (error) throw error;
}

export async function advanceAfterDailyResetIfDue() {
  const { data: progress, error: progressError } = await supabaseAdmin
    .from("reading_progress")
    .select("*")
    .limit(1)
    .maybeSingle();
  if (progressError) throw progressError;
  if (!progress || progress.status !== "reading") return;

  const { data: profiles, error: profileError } = await supabaseAdmin.from("profiles").select("id");
  if (profileError) throw profileError;
  if (!profiles?.length) return;

  const { data: states, error: statesError } = await supabaseAdmin
    .from("reading_states")
    .select("profile_id,checked_at")
    .eq("segment_id", progress.current_segment_id)
    .not("checked_at", "is", null);
  if (statesError) throw statesError;

  const checkedByProfile = new Map((states ?? []).map((state) => [state.profile_id, state.checked_at]));
  const boundary = getKstResetBoundary();
  const allChecked = profiles.every((profile) => checkedByProfile.has(profile.id));

  if (!allChecked) {
    await recordMissesIfDue(progress, profiles, checkedByProfile, boundary);
    return;
  }

  const latestCheckedAt = Math.max(...Array.from(checkedByProfile.values()).map((value) => new Date(value).getTime()));
  if (latestCheckedAt >= boundary.getTime()) return;

  await advanceProgress(progress, progress.current_segment_id);
}
