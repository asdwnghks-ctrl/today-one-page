import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv } from "../lib/env";

loadLocalEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !secretKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY");
}

const supabase = createClient(supabaseUrl, secretKey, {
  auth: { persistSession: false },
});

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function splitKst(iso: string) {
  const kst = new Date(new Date(iso).getTime() + KST_OFFSET_MS);
  const day = `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())}`;
  const time = `${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}`;
  return { day, time };
}

async function main() {
  const { data: profiles, error: profileError } = await supabase.from("profiles").select("id,display_name");
  if (profileError) throw new Error(profileError.message);
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));

  const { data: messages, error: messageError } = await supabase
    .from("messages")
    .select("id,sender_id,body,created_at,edited_at,deleted_at")
    .order("created_at", { ascending: true });
  if (messageError) throw new Error(messageError.message);

  const visible = (messages ?? []).filter((m) => !m.deleted_at);

  const lines: string[] = [];
  lines.push("# 채팅 기록 보관");
  lines.push("");
  lines.push(`주환/희진이 나눈 대화를 채팅 기능을 없애기 전에 남겨둔 기록이다. 총 ${visible.length}개 메시지.`);
  lines.push("");

  let lastDay = "";
  for (const message of visible) {
    const displayName = nameById.get(message.sender_id) ?? "알 수 없음";
    const { day, time } = splitKst(message.created_at);
    if (day !== lastDay) {
      lines.push(`## ${day}`);
      lines.push("");
      lastDay = day;
    }
    const edited = message.edited_at ? " (수정됨)" : "";
    lines.push(`**${displayName}** \`${time}\`${edited}  `);
    lines.push(message.body.replace(/\r?\n/g, "  \n"));
    lines.push("");
  }

  fs.writeFileSync("docs/chat-archive.md", lines.join("\n"), "utf8");
  console.log(`Exported ${visible.length} messages (of ${messages?.length ?? 0} total) to docs/chat-archive.md`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
