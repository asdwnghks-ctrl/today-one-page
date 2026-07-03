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

// JW "성경 읽기 계획표" (sbr, 2009 Watch Tower) — canonical order, Genesis -> Revelation.
// Each entry is one reading day: "book start-end" or, for days that combine two short
// books, "book1 s-e;book2 s-e" (segments are concatenated in that order).
const DAY_PLAN: string[] = [
  // 모세의 기록
  "gen 1-3", "gen 4-7", "gen 8-11", "gen 12-15", "gen 16-18", "gen 19-22", "gen 23-24", "gen 25-27",
  "gen 28-30", "gen 31-32", "gen 33-34", "gen 35-37", "gen 38-40", "gen 41-42", "gen 43-45", "gen 46-48", "gen 49-50",
  "exo 1-4", "exo 5-7", "exo 8-10", "exo 11-13", "exo 14-15", "exo 16-18", "exo 19-21", "exo 22-25",
  "exo 26-28", "exo 29-30", "exo 31-33", "exo 34-35", "exo 36-38", "exo 39-40",
  "lev 1-4", "lev 5-7", "lev 8-10", "lev 11-13", "lev 14-15", "lev 16-18", "lev 19-21", "lev 22-23", "lev 24-25", "lev 26-27",
  "num 1-3", "num 4-6", "num 7-9", "num 10-12", "num 13-15", "num 16-18", "num 19-21", "num 22-24", "num 25-27", "num 28-30", "num 31-32", "num 33-36",
  "deu 1-2", "deu 3-4", "deu 5-7", "deu 8-10", "deu 11-13", "deu 14-16", "deu 17-19", "deu 20-22", "deu 23-26", "deu 27-28", "deu 29-31", "deu 32-32", "deu 33-34",
  // 이스라엘이 약속의 땅에 들어가다
  "jos 1-4", "jos 5-7", "jos 8-9", "jos 10-12", "jos 13-15", "jos 16-18", "jos 19-21", "jos 22-24",
  "jdg 1-2", "jdg 3-5", "jdg 6-7", "jdg 8-9", "jdg 10-11", "jdg 12-13", "jdg 14-16", "jdg 17-19", "jdg 20-21",
  "rut 1-4",
  // 이스라엘의 왕정 시대
  "1sa 1-2", "1sa 3-6", "1sa 7-9", "1sa 10-12", "1sa 13-14", "1sa 15-16", "1sa 17-18", "1sa 19-21", "1sa 22-24", "1sa 25-27", "1sa 28-31",
  "2sa 1-2", "2sa 3-5", "2sa 6-8", "2sa 9-12", "2sa 13-14", "2sa 15-16", "2sa 17-18", "2sa 19-20", "2sa 21-22", "2sa 23-24",
  "1ki 1-2", "1ki 3-5", "1ki 6-7", "1ki 8-8", "1ki 9-10", "1ki 11-12", "1ki 13-14", "1ki 15-17", "1ki 18-19", "1ki 20-21", "1ki 22-22",
  "2ki 1-3", "2ki 4-5", "2ki 6-8", "2ki 9-10", "2ki 11-13", "2ki 14-15", "2ki 16-17", "2ki 18-19", "2ki 20-22", "2ki 23-25",
  "1ch 1-2", "1ch 3-5", "1ch 6-7", "1ch 8-10", "1ch 11-12", "1ch 13-15", "1ch 16-17", "1ch 18-20", "1ch 21-23", "1ch 24-26", "1ch 27-29",
  "2ch 1-3", "2ch 4-6", "2ch 7-9", "2ch 10-14", "2ch 15-18", "2ch 19-22", "2ch 23-25", "2ch 26-28", "2ch 29-30", "2ch 31-33", "2ch 34-36",
  // 유대인들이 유배 생활에서 돌아오다
  "ezr 1-3", "ezr 4-7", "ezr 8-10",
  "neh 1-3", "neh 4-6", "neh 7-8", "neh 9-10", "neh 11-13",
  "est 1-4", "est 5-10",
  // 고난과 인내, 노래와 지혜
  "job 1-5", "job 6-9", "job 10-14", "job 15-18", "job 19-20", "job 21-24", "job 25-29", "job 30-31", "job 32-34", "job 35-38", "job 39-42",
  "psa 1-8", "psa 9-16", "psa 17-19", "psa 20-25", "psa 26-31", "psa 32-35", "psa 36-38", "psa 39-42", "psa 43-47", "psa 48-52",
  "psa 53-58", "psa 59-64", "psa 65-68", "psa 69-72", "psa 73-77", "psa 78-79", "psa 80-86", "psa 87-90", "psa 91-96", "psa 97-103",
  "psa 104-105", "psa 106-108", "psa 109-115", "psa 116-119", "psa 120-129", "psa 130-138", "psa 139-144", "psa 145-150",
  "pro 1-4", "pro 5-8", "pro 9-12", "pro 13-16", "pro 17-19", "pro 20-22", "pro 23-27", "pro 28-31",
  "ecc 1-4", "ecc 5-8", "ecc 9-12",
  "sol 1-8",
  // 예언서
  "isa 1-4", "isa 5-7", "isa 8-10", "isa 11-14", "isa 15-19", "isa 20-24", "isa 25-28", "isa 29-31", "isa 32-35",
  "isa 36-37", "isa 38-40", "isa 41-43", "isa 44-47", "isa 48-50", "isa 51-55", "isa 56-58", "isa 59-62", "isa 63-66",
  "jer 1-3", "jer 4-5", "jer 6-7", "jer 8-10", "jer 11-13", "jer 14-16", "jer 17-20", "jer 21-23", "jer 24-26", "jer 27-29",
  "jer 30-31", "jer 32-33", "jer 34-36", "jer 37-39", "jer 40-42", "jer 43-44", "jer 45-48", "jer 49-50", "jer 51-52",
  "lam 1-2", "lam 3-5",
  "eze 1-3", "eze 4-6", "eze 7-9", "eze 10-12", "eze 13-15", "eze 16-16", "eze 17-18", "eze 19-21", "eze 22-23",
  "eze 24-26", "eze 27-28", "eze 29-31", "eze 32-33", "eze 34-36", "eze 37-38", "eze 39-40", "eze 41-43", "eze 44-45", "eze 46-48",
  "dan 1-2", "dan 3-4", "dan 5-7", "dan 8-10", "dan 11-12",
  "hos 1-7", "hos 8-14",
  "joe 1-3",
  "amo 1-5", "amo 6-9",
  "oba 1-1;jon 1-4",
  "mic 1-7",
  "nah 1-3;hab 1-3",
  "zep 1-3;hag 1-2",
  "zec 1-7", "zec 8-11", "zec 12-14",
  "mal 1-4",
  // 예수의 생애와 봉사에 관한 기록
  "mat 1-4", "mat 5-7", "mat 8-10", "mat 11-13", "mat 14-17", "mat 18-20", "mat 21-23", "mat 24-25", "mat 26-26", "mat 27-28",
  "mar 1-3", "mar 4-5", "mar 6-8", "mar 9-10", "mar 11-13", "mar 14-16",
  "luk 1-2", "luk 3-5", "luk 6-7", "luk 8-9", "luk 10-11", "luk 12-13", "luk 14-17", "luk 18-19", "luk 20-22", "luk 23-24",
  "joh 1-3", "joh 4-5", "joh 6-7", "joh 8-9", "joh 10-12", "joh 13-15", "joh 16-18", "joh 19-21",
  // 그리스도인 회중의 성장
  "act 1-3", "act 4-6", "act 7-8", "act 9-11", "act 12-14", "act 15-16", "act 17-19", "act 20-21", "act 22-23", "act 24-26", "act 27-28",
  "rom 1-3", "rom 4-7", "rom 8-11", "rom 12-16",
  "1co 1-6", "1co 7-10", "1co 11-14", "1co 15-16",
  "2co 1-6", "2co 7-10", "2co 11-13",
  "gal 1-6",
  "eph 1-6",
  "phi 1-4",
  "col 1-4",
  "1th 1-5",
  "2th 1-3",
  "1ti 1-6",
  "2ti 1-4",
  "tit 1-3;phm 1-1",
  "heb 1-6", "heb 7-10", "heb 11-13",
  "jas 1-5",
  "1pe 1-5",
  "2pe 1-3",
  "1jo 1-5",
  "2jo 1-1;3jo 1-1;jud 1-1",
  "rev 1-4", "rev 5-9", "rev 10-14", "rev 15-18", "rev 19-22",
];

type Range = { bookId: string; start: number; end: number };

function parseDay(entry: string): Range[] {
  return entry.split(";").map((part) => {
    const [bookId, chapterRange] = part.trim().split(" ");
    const [start, end] = chapterRange.split("-").map(Number);
    return { bookId, start, end };
  });
}

async function main() {
  const { data: books, error: booksError } = await supabase.from("books").select("id,name,chapter_count");
  if (booksError) throw new Error(booksError.message);
  const chapterCountByBook = new Map((books ?? []).map((b) => [b.id, b.chapter_count]));

  const { data: segments, error: segmentsError } = await supabase
    .from("segments")
    .select("id,book_id,chapter,global_order")
    .order("global_order");
  if (segmentsError) throw new Error(segmentsError.message);
  const segmentByBookChapter = new Map((segments ?? []).map((s) => [`${s.book_id}:${s.chapter}`, s]));

  const rows: { day_index: number; book_id: string; segment_ids: string[] }[] = [];
  const seenBookChapters = new Map<string, Set<number>>();
  const allGlobalOrders: number[] = [];

  DAY_PLAN.forEach((entry, index) => {
    const ranges = parseDay(entry);
    const segmentIds: string[] = [];
    let lastBookId = "";

    for (const range of ranges) {
      lastBookId = range.bookId;
      if (!seenBookChapters.has(range.bookId)) seenBookChapters.set(range.bookId, new Set());
      const seenChapters = seenBookChapters.get(range.bookId)!;

      for (let chapter = range.start; chapter <= range.end; chapter += 1) {
        const segment = segmentByBookChapter.get(`${range.bookId}:${chapter}`);
        if (!segment) throw new Error(`Missing segment for ${range.bookId} chapter ${chapter} (day ${index + 1}: "${entry}")`);
        if (seenChapters.has(chapter)) throw new Error(`Duplicate chapter ${range.bookId} ${chapter} (day ${index + 1}: "${entry}")`);
        seenChapters.add(chapter);
        segmentIds.push(segment.id);
        allGlobalOrders.push(segment.global_order);
      }
    }

    rows.push({ day_index: index + 1, book_id: lastBookId, segment_ids: segmentIds });
  });

  // Validate every book's chapters are fully covered (no gaps, no extras).
  for (const [bookId, expectedCount] of chapterCountByBook.entries()) {
    const covered = seenBookChapters.get(bookId);
    const coveredCount = covered ? covered.size : 0;
    if (coveredCount !== expectedCount) {
      throw new Error(`Book "${bookId}" has ${coveredCount} chapters in the plan but expected ${expectedCount}`);
    }
  }

  // Validate global order is strictly increasing (no skipped/reordered books) and every
  // segment is used exactly once across the whole plan.
  const totalSegments = allGlobalOrders.length;
  const expectedTotal = (segments ?? []).length;
  if (totalSegments !== expectedTotal) {
    throw new Error(`Plan covers ${totalSegments} segments but the Bible has ${expectedTotal}`);
  }
  for (let i = 1; i < allGlobalOrders.length; i += 1) {
    if (allGlobalOrders[i] <= allGlobalOrders[i - 1]) {
      throw new Error(`global_order not strictly increasing around position ${i} (${allGlobalOrders[i - 1]} -> ${allGlobalOrders[i]})`);
    }
  }

  console.log(`Validated ${rows.length} plan days covering ${totalSegments} segments across ${chapterCountByBook.size} books.`);

  const { error: insertError } = await supabase.from("plan_days").upsert(rows, { onConflict: "day_index" });
  if (insertError) throw new Error(insertError.message);
  console.log(`Inserted/updated ${rows.length} rows into plan_days.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
