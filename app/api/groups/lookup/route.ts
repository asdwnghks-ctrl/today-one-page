import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")?.trim().toUpperCase() ?? "";
  if (!code) return NextResponse.json({ error: "초대 코드를 입력해 주세요" }, { status: 400 });

  const { data: group, error: groupError } = await supabaseAdmin
    .from("groups")
    .select("id,name,max_members")
    .eq("invite_code", code)
    .maybeSingle();
  if (groupError) return NextResponse.json({ error: groupError.message }, { status: 500 });
  if (!group) return NextResponse.json({ error: "초대 코드를 다시 확인해 주세요" }, { status: 404 });

  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from("profiles")
    .select("id,slug,display_name,color_key,accent_color,accent_deep,accent_soft")
    .eq("group_id", group.id)
    .order("slug");
  if (profilesError) return NextResponse.json({ error: profilesError.message }, { status: 500 });

  return NextResponse.json({
    groupId: group.id,
    groupName: group.name,
    maxMembers: group.max_members,
    profiles: profiles ?? [],
  });
}
