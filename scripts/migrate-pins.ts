import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv } from "../lib/env";
import { hashPin } from "../lib/pin";

loadLocalEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const sharedPin = process.env.APP_SHARED_PIN;

if (!supabaseUrl || !secretKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY");
}
if (!sharedPin) {
  throw new Error("Missing APP_SHARED_PIN");
}

const supabase = createClient(supabaseUrl, secretKey, {
  auth: { persistSession: false },
});

async function main() {
  const pinHash = await hashPin(sharedPin as string);
  const { data, error } = await supabase.from("profiles").update({ pin_hash: pinHash }).is("pin_hash", null).select("slug");
  if (error) throw new Error(error.message);
  console.log(`Migrated PIN for ${data?.length ?? 0} profile(s): ${(data ?? []).map((p) => p.slug).join(", ")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
