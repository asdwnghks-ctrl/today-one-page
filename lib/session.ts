import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Profile } from "@/lib/types";

const PROFILE_COLUMNS = "id,slug,display_name,color_key,accent_color,accent_deep,accent_soft,group_id";

export async function getSessionProfile(): Promise<Profile | null> {
  const cookieStore = await cookies();
  const groupId = cookieStore.get("top_group")?.value;
  const slug = cookieStore.get("top_profile")?.value;
  if (!groupId || !slug) return null;

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("group_id", groupId)
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) return null;
  return data as Profile;
}

export async function requireSessionProfile(): Promise<Profile> {
  const profile = await getSessionProfile();
  if (!profile) throw new Error("로그인이 필요해요");
  return profile;
}

export function setSessionCookies(response: NextResponse, groupId: string, slug: string) {
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  };
  response.cookies.set("top_group", groupId, options);
  response.cookies.set("top_profile", slug, options);
}

export function clearSessionCookies(response: NextResponse) {
  response.cookies.delete("top_group");
  response.cookies.delete("top_profile");
}
