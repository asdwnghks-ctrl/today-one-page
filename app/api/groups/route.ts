import { NextRequest, NextResponse } from "next/server";
import { colorForKey, isValidColorKey } from "@/lib/color-palette";
import { generateInviteCode, isUniqueViolation } from "@/lib/invite-code";
import { hashPin } from "@/lib/pin";
import { setSessionCookies } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase-admin";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const groupName = asString(body.groupName);
    const yourName = asString(body.yourName);
    const colorKey = asString(body.colorKey);
    const pin = asString(body.pin);
    const readingMode = body.readingMode === "plan" ? "plan" : "daily_one";

    if (!groupName || groupName.length > 40) throw new Error("그룹 이름을 확인해 주세요");
    if (!yourName || yourName.length > 20) throw new Error("이름을 확인해 주세요");
    if (pin.length < 4 || pin.length > 8) throw new Error("비밀번호는 4~8자로 입력해 주세요");
    if (!isValidColorKey(colorKey)) throw new Error("색상을 선택해 주세요");

    let groupId: string | null = null;
    let inviteCode = "";
    for (let attempt = 0; attempt < 5 && !groupId; attempt += 1) {
      inviteCode = generateInviteCode();
      const { data, error } = await supabaseAdmin
        .from("groups")
        .insert({ name: groupName, invite_code: inviteCode, max_members: 5, reading_mode: readingMode })
        .select("id")
        .single();
      if (error) {
        if (isUniqueViolation(error)) continue;
        throw error;
      }
      groupId = data.id;
    }
    if (!groupId) throw new Error("초대 코드를 만들지 못했어요. 다시 시도해 주세요");

    const color = colorForKey(colorKey);
    const slug = crypto.randomUUID().slice(0, 8);
    const pinHash = await hashPin(pin);

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .insert({
        slug,
        display_name: yourName,
        role: "reader",
        group_id: groupId,
        color_key: color.colorKey,
        accent_color: color.accentColor,
        accent_deep: color.accentDeep,
        accent_soft: color.accentSoft,
        pin_hash: pinHash,
      })
      .select("id")
      .single();
    if (profileError) throw profileError;

    const { error: ownerError } = await supabaseAdmin.from("groups").update({ owner_id: profile.id }).eq("id", groupId);
    if (ownerError) throw ownerError;

    if (readingMode === "plan") {
      const { data: firstDay, error: firstDayError } = await supabaseAdmin
        .from("plan_days")
        .select("book_id,segment_ids")
        .eq("day_index", 1)
        .single();
      if (firstDayError) throw firstDayError;

      const { error: progressError } = await supabaseAdmin.from("reading_progress").insert({
        group_id: groupId,
        current_book_id: firstDay.book_id,
        current_segment_id: firstDay.segment_ids[0],
        initial_book_id: firstDay.book_id,
        status: "reading",
        plan_day_index: 1,
      });
      if (progressError) throw progressError;
    } else {
      const { error: progressError } = await supabaseAdmin.from("reading_progress").insert({
        group_id: groupId,
        current_book_id: null,
        current_segment_id: null,
        initial_book_id: null,
        status: "choosing_book",
      });
      if (progressError) throw progressError;
    }

    const response = NextResponse.json({ ok: true, inviteCode });
    setSessionCookies(response, groupId, slug);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "그룹을 만들지 못했어요";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
