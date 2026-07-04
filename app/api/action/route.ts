import { NextRequest, NextResponse } from "next/server";
import { manualAdvanceIfAllowed, startAcceptedProposal } from "@/lib/reading-progress";
import { requireSessionProfile } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Profile } from "@/lib/types";

type ActionBody = {
  type: string;
  payload?: Record<string, unknown>;
};

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

async function notifyOthers(actor: Profile, type: string, title: string, body?: string, targetType?: string, targetId?: string) {
  const { data: others, error } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("group_id", actor.group_id)
    .neq("id", actor.id);
  if (error) throw error;
  if (!others?.length) return;

  const rows = others.map((profile) => ({
    profile_id: profile.id,
    type,
    title,
    body: body || null,
    target_type: targetType || null,
    target_id: targetId || null,
  }));
  const { error: insertError } = await supabaseAdmin.from("notifications").insert(rows);
  if (insertError) throw insertError;
}

async function getCurrentProgress(groupId: string) {
  const { data, error } = await supabaseAdmin.from("reading_progress").select("*").eq("group_id", groupId).single();
  if (error) throw error;
  return data;
}

async function verifyOwner(table: string, id: string, profileId: string, ownerColumn = "profile_id") {
  const { data, error } = await supabaseAdmin.from(table).select(`${ownerColumn}`).eq("id", id).single();
  const row = data as Record<string, string> | null;
  if (error || !row || row[ownerColumn] !== profileId) {
    throw new Error("본인이 쓴 것만 바꿀 수 있어요");
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireSessionProfile();
    const body = (await request.json()) as ActionBody;
    const payload = body.payload ?? {};
    const now = new Date().toISOString();

    switch (body.type) {
      case "check_read": {
        const segmentIds = asStringArray(payload.segmentIds);
        const singleSegmentId = asString(payload.segmentId);
        const allSegmentIds = segmentIds.length ? segmentIds : singleSegmentId ? [singleSegmentId] : [];
        if (!allSegmentIds.length) throw new Error("segmentId가 필요해요");
        const rows = allSegmentIds.map((segmentId) => ({
          segment_id: segmentId,
          profile_id: actor.id,
          checked_at: now,
          updated_at: now,
        }));
        const { error } = await supabaseAdmin.from("reading_states").upsert(rows, { onConflict: "segment_id,profile_id" });
        if (error) throw error;
        await notifyOthers(actor, "reading_checked", `${actor.display_name}이 읽었어요`, "같이 읽던 장에 읽음 체크가 되었어요.", "segment", allSegmentIds[0]);
        break;
      }

      case "add_comment": {
        const segmentId = asString(payload.segmentId);
        const bodyText = asString(payload.body);
        if (!segmentId || !bodyText) throw new Error("코멘트를 입력해 주세요");
        const { data, error } = await supabaseAdmin
          .from("comments")
          .insert({ segment_id: segmentId, profile_id: actor.id, body: bodyText })
          .select("id")
          .single();
        if (error) throw error;
        await notifyOthers(actor, "comment", `${actor.display_name}의 새 코멘트`, bodyText.slice(0, 80), "segment", segmentId);
        return NextResponse.json({ ok: true, id: data.id });
      }

      case "update_comment": {
        const id = asString(payload.id);
        const bodyText = asString(payload.body);
        await verifyOwner("comments", id, actor.id);
        const { error } = await supabaseAdmin.from("comments").update({ body: bodyText, updated_at: now }).eq("id", id);
        if (error) throw error;
        break;
      }

      case "delete_comment": {
        const id = asString(payload.id);
        await verifyOwner("comments", id, actor.id);
        const { error } = await supabaseAdmin.from("comments").update({ deleted_at: now, updated_at: now }).eq("id", id);
        if (error) throw error;
        break;
      }

      case "add_highlight": {
        const segmentId = asString(payload.segmentId);
        const verseRef = asString(payload.verseRef);
        if (!segmentId || !verseRef) throw new Error("구절을 선택해 주세요");
        const { data, error } = await supabaseAdmin
          .from("highlights")
          .insert({
            segment_id: segmentId,
            profile_id: actor.id,
            verse_ref: verseRef,
            start_verse: asNumber(payload.startVerse),
            end_verse: asNumber(payload.endVerse),
            note: asString(payload.note) || null,
            color: asString(payload.color, "#F4B5C9"),
          })
          .select("id")
          .single();
        if (error) throw error;
        await notifyOthers(actor, "comment", `${actor.display_name}의 새 구절 표시`, verseRef, "segment", segmentId);
        return NextResponse.json({ ok: true, id: data.id });
      }

      case "update_highlight": {
        const id = asString(payload.id);
        await verifyOwner("highlights", id, actor.id);
        const { error } = await supabaseAdmin
          .from("highlights")
          .update({
            verse_ref: asString(payload.verseRef),
            start_verse: asNumber(payload.startVerse),
            end_verse: asNumber(payload.endVerse),
            note: asString(payload.note) || null,
            color: asString(payload.color, "#F4B5C9"),
            updated_at: now,
          })
          .eq("id", id);
        if (error) throw error;
        break;
      }

      case "delete_highlight": {
        const id = asString(payload.id);
        await verifyOwner("highlights", id, actor.id);
        const { error } = await supabaseAdmin.from("highlights").update({ deleted_at: now, updated_at: now }).eq("id", id);
        if (error) throw error;
        break;
      }

      case "add_reply": {
        const parentType = asString(payload.parentType) as "comment" | "highlight";
        const parentId = asString(payload.parentId);
        const bodyText = asString(payload.body);
        if (!parentType || !parentId || !bodyText) throw new Error("답글을 입력해 주세요");
        const { data, error } = await supabaseAdmin
          .from("replies")
          .insert({ parent_type: parentType, parent_id: parentId, profile_id: actor.id, body: bodyText })
          .select("id")
          .single();
        if (error) throw error;
        await notifyOthers(actor, "reply", `${actor.display_name}의 새 답글`, bodyText.slice(0, 80), parentType, parentId);
        return NextResponse.json({ ok: true, id: data.id });
      }

      case "update_reply": {
        const id = asString(payload.id);
        await verifyOwner("replies", id, actor.id);
        const { error } = await supabaseAdmin.from("replies").update({ body: asString(payload.body), updated_at: now }).eq("id", id);
        if (error) throw error;
        break;
      }

      case "delete_reply": {
        const id = asString(payload.id);
        await verifyOwner("replies", id, actor.id);
        const { error } = await supabaseAdmin.from("replies").update({ deleted_at: now, updated_at: now }).eq("id", id);
        if (error) throw error;
        break;
      }

      case "toggle_reaction": {
        const targetType = asString(payload.targetType);
        const targetId = asString(payload.targetId);
        if (!targetType || !targetId) throw new Error("대상이 필요해요");
        const { data: existing, error: findError } = await supabaseAdmin
          .from("reactions")
          .select("id")
          .eq("target_type", targetType)
          .eq("target_id", targetId)
          .eq("profile_id", actor.id)
          .eq("emoji", "heart")
          .maybeSingle();
        if (findError) throw findError;
        if (existing) {
          const { error } = await supabaseAdmin.from("reactions").delete().eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabaseAdmin.from("reactions").insert({ target_type: targetType, target_id: targetId, profile_id: actor.id, emoji: "heart" });
          if (error) throw error;
        }
        break;
      }

      case "set_next_book": {
        const bookId = asString(payload.bookId);
        if (!bookId) throw new Error("책을 골라 주세요");

        const { data: group, error: groupError } = await supabaseAdmin
          .from("groups")
          .select("owner_id,reading_mode")
          .eq("id", actor.group_id)
          .single();
        if (groupError) throw groupError;
        if (group.owner_id !== actor.id) throw new Error("방장만 다음 책을 정할 수 있어요");
        if (group.reading_mode !== "daily_one") throw new Error("하루 1장 모드에서만 다음 책을 정할 수 있어요");

        const { data: book, error: bookError } = await supabaseAdmin.from("books").select("id,name").eq("id", bookId).maybeSingle();
        if (bookError) throw bookError;
        if (!book) throw new Error("책을 다시 확인해 주세요");

        const { error: cancelError } = await supabaseAdmin
          .from("book_proposals")
          .update({ status: "cancelled", cancelled_at: now })
          .eq("group_id", actor.group_id)
          .eq("status", "accepted");
        if (cancelError) throw cancelError;
        const { data: created, error: insertError } = await supabaseAdmin
          .from("book_proposals")
          .insert({ group_id: actor.group_id, proposed_book_id: bookId, proposed_by: actor.id, accepted_by: actor.id, status: "accepted", accepted_at: now })
          .select("id")
          .single();
        if (insertError) throw insertError;

        const progress = await getCurrentProgress(actor.group_id);
        if (progress.status === "choosing_book") {
          const firstSegment = await startAcceptedProposal(progress, { id: created.id, proposed_book_id: bookId }, now);
          await notifyOthers(actor, "book_accepted", `${actor.display_name}이 다음 책을 ${book.name}(으)로 정했어요`, "1장이 열렸어요.", "segment", firstSegment.id);
          break;
        }
        await notifyOthers(actor, "book_accepted", `${actor.display_name}이 다음 책을 ${book.name}(으)로 정했어요`, "지금 읽는 책이 끝나면 이어져요.", "book_proposal", created.id);
        break;
      }

      case "manual_advance": {
        const result = await manualAdvanceIfAllowed(actor.group_id, actor.id);
        if (result.segmentId) {
          await notifyOthers(actor, "reading_advanced", `${actor.display_name}이 다음 범위를 열었어요`, "다음 읽기 범위가 열렸어요.", "segment", result.segmentId);
        } else {
          await notifyOthers(actor, "reading_advanced", `${actor.display_name}이 성경을 완독했어요`, "축하해요! 계획표를 다 읽었어요.", "book_proposal");
        }
        break;
      }

      case "set_gift": {
        const giftDescription = asString(payload.giftDescription);
        if (!giftDescription) throw new Error("선물 내용을 입력해 주세요");
        const progress = await getCurrentProgress(actor.group_id);
        if (!progress.session_id) throw new Error("진행 중인 책이 없어요");
        const { error } = await supabaseAdmin
          .from("book_gifts")
          .upsert(
            { session_id: progress.session_id, profile_id: actor.id, gift_description: giftDescription },
            { onConflict: "session_id,profile_id" },
          );
        if (error) throw error;
        break;
      }

      case "mark_notification_read": {
        const id = asString(payload.id);
        const { error } = await supabaseAdmin.from("notifications").update({ read_at: now }).eq("id", id).eq("profile_id", actor.id);
        if (error) throw error;
        break;
      }

      case "mark_notifications_read": {
        const types = asStringArray(payload.types);
        if (!types.length) throw new Error("읽음 처리할 알림 종류가 필요해요");
        const { error } = await supabaseAdmin
          .from("notifications")
          .update({ read_at: now })
          .eq("profile_id", actor.id)
          .in("type", types)
          .is("read_at", null);
        if (error) throw error;
        break;
      }

      case "mark_all_notifications_read": {
        const { error } = await supabaseAdmin.from("notifications").update({ read_at: now }).eq("profile_id", actor.id).is("read_at", null);
        if (error) throw error;
        break;
      }

      default:
        throw new Error("알 수 없는 작업이에요");
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "요청을 처리하지 못했어요";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
