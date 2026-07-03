import { NextRequest, NextResponse } from "next/server";
import { verifyPin } from "@/lib/pin";
import { setSessionCookies } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  const { groupId, slug, pin } = await request.json();

  if (!groupId || !slug || !pin) {
    return NextResponse.json({ error: "비밀번호를 다시 확인해 주세요" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("slug,pin_hash")
    .eq("group_id", groupId)
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: "사용자를 찾지 못했어요" }, { status: 404 });
  }

  const valid = await verifyPin(pin, data.pin_hash);
  if (!valid) {
    return NextResponse.json({ error: "비밀번호를 다시 확인해 주세요" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  setSessionCookies(response, groupId, slug);
  return response;
}
