import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  const { slug, pin } = await request.json();
  const expectedPin = process.env.APP_SHARED_PIN;

  if (!slug || !pin || pin !== expectedPin) {
    return NextResponse.json({ error: "비밀번호를 다시 확인해 주세요" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin.from("profiles").select("slug").eq("slug", slug).single();
  if (error || !data) {
    return NextResponse.json({ error: "사용자를 찾지 못했어요" }, { status: 404 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("top_profile", slug, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
  return response;
}
