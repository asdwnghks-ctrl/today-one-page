import { NextRequest, NextResponse } from "next/server";
import { colorForKey, isValidColorKey } from "@/lib/color-palette";
import { hashPin } from "@/lib/pin";
import { setSessionCookies } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase-admin";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const inviteCode = asString(body.inviteCode).toUpperCase();
    const yourName = asString(body.yourName);
    const colorKey = asString(body.colorKey);
    const pin = asString(body.pin);

    if (!inviteCode) throw new Error("초대 코드를 입력해 주세요");
    if (!yourName || yourName.length > 20) throw new Error("이름을 확인해 주세요");
    if (pin.length < 4 || pin.length > 8) throw new Error("비밀번호는 4~8자로 입력해 주세요");
    if (!isValidColorKey(colorKey)) throw new Error("색상을 선택해 주세요");

    const { data: group, error: groupError } = await supabaseAdmin
      .from("groups")
      .select("id,max_members")
      .eq("invite_code", inviteCode)
      .maybeSingle();
    if (groupError) throw groupError;
    if (!group) throw new Error("초대 코드를 다시 확인해 주세요");

    const { data: members, error: membersError } = await supabaseAdmin
      .from("profiles")
      .select("color_key")
      .eq("group_id", group.id);
    if (membersError) throw membersError;
    if ((members?.length ?? 0) >= group.max_members) throw new Error("그룹 인원이 다 찼어요");
    if ((members ?? []).some((member) => member.color_key === colorKey)) {
      throw new Error("이미 다른 멤버가 쓰는 색이에요");
    }

    const color = colorForKey(colorKey);
    const slug = crypto.randomUUID().slice(0, 8);
    const pinHash = await hashPin(pin);

    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      slug,
      display_name: yourName,
      role: "reader",
      group_id: group.id,
      color_key: color.colorKey,
      accent_color: color.accentColor,
      accent_deep: color.accentDeep,
      accent_soft: color.accentSoft,
      pin_hash: pinHash,
    });
    if (profileError) throw profileError;

    const response = NextResponse.json({ ok: true });
    setSessionCookies(response, group.id, slug);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "그룹에 참여하지 못했어요";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
