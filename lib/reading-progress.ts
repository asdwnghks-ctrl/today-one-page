import { supabaseAdmin } from "@/lib/supabase-admin";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function getKstResetBoundary(now = new Date()) {
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
  const boundaryMs =
    Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate(), 2, 0, 0) - KST_OFFSET_MS;

  return new Date(now.getTime() < boundaryMs ? boundaryMs - DAY_MS : boundaryMs);
}

async function advanceProgress(progress: { id: string; current_segment_id: string }, segmentId: string) {
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
  const allChecked = profiles.every((profile) => checkedByProfile.has(profile.id));
  if (!allChecked) return;

  const latestCheckedAt = Math.max(...Array.from(checkedByProfile.values()).map((value) => new Date(value).getTime()));
  if (latestCheckedAt >= getKstResetBoundary().getTime()) return;

  await advanceProgress(progress, progress.current_segment_id);
}
