import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { startAcceptedProposal } from "@/lib/reading-progress";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Profile } from "@/lib/types";

type ActionBody = {
  type: string;
  payload?: Record<string, unknown>;
};

async function getCurrentProfile() {
  const cookieStore = await cookies();
  const slug = cookieStore.get("top_profile")?.value;
  if (!slug) throw new Error("로그인이 필요해요");

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id,slug,display_name,color_key,accent_color,accent_deep,accent_soft")
    .eq("slug", slug)
    .single();
  if (error || !data) throw new Error("사용자를 찾지 못했어요");
  return data as Profile;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function notifyOthers(actor: Profile, type: string, title: string, body?: string, targetType?: string, targetId?: string) {
  const { data: others, error } = await supabaseAdmin
    .from("profiles")
    .select("id")
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

async function getCurrentProgress() {
  const { data, error } = await supabaseAdmin.from("reading_progress").select("*").limit(1).single();
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
    const actor = await getCurrentProfile();
    const body = (await request.json()) as ActionBody;
    const payload = body.payload ?? {};
    const now = new Date().toISOString();

    switch (body.type) {
      case "check_read": {
        const segmentId = asString(payload.segmentId);
        if (!segmentId) throw new Error("segmentId가 필요해요");
        const { error } = await supabaseAdmin.from("reading_states").upsert(
          {
            segment_id: segmentId,
            profile_id: actor.id,
            checked_at: now,
            updated_at: now,
          },
          { onConflict: "segment_id,profile_id" },
        );
        if (error) throw error;
        await notifyOthers(actor, "reading_checked", `${actor.display_name}이 읽었어요`, "같이 읽던 장에 읽음 체크가 되었어요.", "segment", segmentId);
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

      case "send_message": {
        const bodyText = asString(payload.body);
        if (!bodyText) throw new Error("메시지를 입력해 주세요");
        const { data, error } = await supabaseAdmin
          .from("messages")
          .insert({ sender_id: actor.id, body: bodyText })
          .select("id")
          .single();
        if (error) throw error;
        await notifyOthers(actor, "message", `${actor.display_name}의 새 메시지`, bodyText.slice(0, 80), "message", data.id);
        return NextResponse.json({ ok: true, id: data.id });
      }

      case "update_message": {
        const id = asString(payload.id);
        await verifyOwner("messages", id, actor.id, "sender_id");
        const { error } = await supabaseAdmin.from("messages").update({ body: asString(payload.body), edited_at: now }).eq("id", id);
        if (error) throw error;
        break;
      }

      case "delete_message": {
        const id = asString(payload.id);
        await verifyOwner("messages", id, actor.id, "sender_id");
        const { error } = await supabaseAdmin.from("messages").update({ deleted_at: now }).eq("id", id);
        if (error) throw error;
        break;
      }

      case "mark_messages_read": {
        const { data: messages, error } = await supabaseAdmin
          .from("messages")
          .select("id")
          .neq("sender_id", actor.id)
          .is("deleted_at", null);
        if (error) throw error;
        const rows = (messages ?? []).map((message) => ({ message_id: message.id, profile_id: actor.id, read_at: now }));
        if (rows.length) {
          const { error: readError } = await supabaseAdmin.from("message_reads").upsert(rows, { onConflict: "message_id,profile_id" });
          if (readError) throw readError;
        }
        break;
      }

      case "propose_book": {
        const bookId = asString(payload.bookId);
        const note = asString(payload.note);
        if (!bookId) throw new Error("책을 골라 주세요");
        const { data: acceptedProposal, error: acceptedProposalError } = await supabaseAdmin
          .from("book_proposals")
          .select("id")
          .eq("status", "accepted")
          .limit(1)
          .maybeSingle();
        if (acceptedProposalError) throw acceptedProposalError;
        if (acceptedProposal) throw new Error("이미 다음 책이 정해져 있어요");
        await supabaseAdmin.from("book_proposals").update({ status: "cancelled", cancelled_at: now }).eq("status", "pending");
        const { data, error } = await supabaseAdmin
          .from("book_proposals")
          .insert({ proposed_book_id: bookId, proposed_by: actor.id, note: note || null, status: "pending" })
          .select("id")
          .single();
        if (error) throw error;
        await notifyOthers(actor, "book_proposal", `${actor.display_name}이 다음 책을 제안했어요`, "함께 읽을 다음 책을 확인해 주세요.", "book_proposal", data.id);
        return NextResponse.json({ ok: true, id: data.id });
      }

      case "accept_proposal": {
        const proposalId = asString(payload.id);
        const { data: proposal, error: proposalError } = await supabaseAdmin.from("book_proposals").select("*").eq("id", proposalId).single();
        if (proposalError) throw proposalError;
        if (proposal.status !== "pending") throw new Error("이미 처리된 제안이에요");
        if (proposal.proposed_by === actor.id) throw new Error("상대가 수락해야 해요");
        const { error: segmentError } = await supabaseAdmin
          .from("segments")
          .select("id")
          .eq("book_id", proposal.proposed_book_id)
          .eq("chapter", 1)
          .single();
        if (segmentError) throw segmentError;
        const progress = await getCurrentProgress();
        const { data: acceptedProposal, error: acceptedProposalError } = await supabaseAdmin
          .from("book_proposals")
          .select("id")
          .eq("status", "accepted")
          .neq("id", proposalId)
          .limit(1)
          .maybeSingle();
        if (acceptedProposalError) throw acceptedProposalError;
        if (acceptedProposal) throw new Error("이미 다음 책이 정해져 있어요");
        const { error: updateProposalError } = await supabaseAdmin
          .from("book_proposals")
          .update({ status: "accepted", accepted_by: actor.id, accepted_at: now })
          .eq("id", proposalId);
        if (updateProposalError) throw updateProposalError;
        if (progress.status === "choosing_book") {
          const firstSegment = await startAcceptedProposal(progress, { id: proposal.id, proposed_book_id: proposal.proposed_book_id }, now);
          await notifyOthers(actor, "book_accepted", `${actor.display_name}이 다음 책을 수락했어요`, "새 책의 1장이 열렸어요.", "segment", firstSegment.id);
          break;
        }
        await notifyOthers(actor, "book_accepted", `${actor.display_name}이 다음 책을 수락했어요`, "지금 읽는 책이 끝난 다음 날 1장이 열려요.", "book_proposal", proposal.id);
        break;
      }

      case "set_gift": {
        const giftDescription = asString(payload.giftDescription);
        if (!giftDescription) throw new Error("선물 내용을 입력해 주세요");
        const progress = await getCurrentProgress();
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
