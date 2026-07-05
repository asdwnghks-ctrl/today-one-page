"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  BookOpen,
  Check,
  ChevronLeft,
  Copy,
  Heart,
  Home,
  Library,
  Pencil,
  RefreshCw,
  Sparkles,
  SkipForward,
  Trash2,
  Users,
  X,
} from "lucide-react";
import type {
  AppState,
  Book,
  BookGift,
  Highlight,
  Profile,
  Reply,
  Segment,
  SegmentComment,
} from "@/lib/types";
import { MEMBER_COLOR_PALETTE } from "@/lib/color-palette";
import { READING_PLAN_SECTIONS } from "@/lib/reading-plan-sections";
import { supabaseBrowser } from "@/lib/supabase-browser";

type Tab = "today" | "reading" | "records";
type AuthMode = "landing" | "enter-code" | "pick-profile" | "create-group" | "join-group";

const HIGHLIGHT_COLORS = ["#F4B5C9", "#C8B5E8", "#B5D5E8", "#B8C49B"];

function formatDate(value?: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function shortDate(value?: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatPlanRange(segments: Segment[]) {
  const groups: { bookName: string; chapters: number[] }[] = [];
  for (const seg of segments) {
    const last = groups[groups.length - 1];
    if (last && last.bookName === seg.book_name) last.chapters.push(seg.chapter);
    else groups.push({ bookName: seg.book_name, chapters: [seg.chapter] });
  }
  return groups
    .map((group) => {
      const min = Math.min(...group.chapters);
      const max = Math.max(...group.chapters);
      return min === max ? `${group.bookName} ${min}장` : `${group.bookName} ${min}~${max}장`;
    })
    .join(" · ");
}

async function apiAction(type: string, payload?: Record<string, unknown>) {
  const response = await fetch("/api/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, payload }),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || "요청을 처리하지 못했어요");
  return json;
}

export default function Page() {
  const [state, setState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [tab, setTab] = useState<Tab>("today");
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [selectedBookId, setSelectedBookId] = useState<string>("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState("CLOSED");
  const [loginPending, setLoginPending] = useState(false);
  const broadcastChangeRef = useRef<(() => void) | null>(null);
  const notificationMarkingRef = useRef(false);

  const [authMode, setAuthMode] = useState<AuthMode>("landing");
  const [authPending, setAuthPending] = useState(false);
  const [lookup, setLookup] = useState<{
    groupId: string;
    groupName: string;
    maxMembers: number;
    profiles: Array<Pick<Profile, "id" | "slug" | "display_name" | "color_key" | "accent_color" | "accent_deep" | "accent_soft">>;
  } | null>(null);
  const [inviteCodeInput, setInviteCodeInput] = useState("");
  const [groupNameInput, setGroupNameInput] = useState("");
  const [yourNameInput, setYourNameInput] = useState("");
  const [colorKeyInput, setColorKeyInput] = useState(MEMBER_COLOR_PALETTE[0].colorKey);
  const [readingModeInput, setReadingModeInput] = useState<"daily_one" | "plan">("daily_one");
  const [createdInviteCode, setCreatedInviteCode] = useState<string | null>(null);
  const [publicBooks, setPublicBooks] = useState<{ id: string; name: string }[]>([]);
  const [startBookIdInput, setStartBookIdInput] = useState("");
  const [startDayIndexInput, setStartDayIndexInput] = useState(READING_PLAN_SECTIONS[0].startDay);
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);

  useEffect(() => {
    fetch("/api/books")
      .then((response) => response.json())
      .then((json) => setPublicBooks(json.books ?? []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!startBookIdInput && publicBooks.length) setStartBookIdInput(publicBooks[0].id);
  }, [publicBooks, startBookIdInput]);

  const fetchState = useCallback(async () => {
    const response = await fetch("/api/state", { cache: "no-store" });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error || "상태를 불러오지 못했어요");
    setState(json);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchState().catch((err) => {
      setError(err.message);
      setLoading(false);
    });
  }, [fetchState]);

  useEffect(() => {
    if (!state?.me) return;

    let refreshTimer: number | null = null;
    const channel = supabaseBrowser.channel(`group-${state.me.group_id}-live`);

    const scheduleRefresh = () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        fetchState().catch(() => undefined);
      }, 180);
    };

    channel.on("broadcast", { event: "state_changed" }, scheduleRefresh).subscribe((status) => {
      setRealtimeStatus(status);
    });

    broadcastChangeRef.current = () => {
      void channel.send({
        type: "broadcast",
        event: "state_changed",
        payload: {
          actorId: state.me?.id,
          at: Date.now(),
        },
      });
    };

    return () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      broadcastChangeRef.current = null;
      void supabaseBrowser.removeChannel(channel);
    };
  }, [fetchState, state?.me?.display_name, state?.me?.id, state?.me?.group_id]);

  const me = state?.me ?? null;
  const profiles = state?.profiles ?? [];
  const others = profiles.filter((profile) => profile.id !== me?.id);
  const currentSegment = state?.segments.find((segment) => segment.id === state.progress?.current_segment_id) ?? null;
  const activeSegment = state?.segments.find((segment) => segment.id === selectedSegmentId) ?? currentSegment;
  const currentBook = state?.books.find((book) => book.id === state.progress?.current_book_id) ?? null;
  const unreadCount = state?.notifications.filter((item) => !item.read_at).length ?? 0;

  useEffect(() => {
    if (!selectedBookId && state?.progress?.current_book_id) {
      setSelectedBookId(state.progress.current_book_id);
    }
  }, [selectedBookId, state?.progress?.current_book_id]);

  const quietlyMarkNotificationsRead = useCallback(
    async (types: string[]) => {
      if (!state?.me || notificationMarkingRef.current) return;
      const hasUnread = state.notifications.some((item) => !item.read_at && types.includes(item.type));
      if (!hasUnread) return;

      notificationMarkingRef.current = true;
      const readAt = new Date().toISOString();
      setState((prev) =>
        prev
          ? {
              ...prev,
              notifications: prev.notifications.map((item) =>
                !item.read_at && types.includes(item.type) ? { ...item, read_at: readAt } : item,
              ),
            }
          : prev,
      );
      try {
        await apiAction("mark_notifications_read", { types });
        await fetchState();
      } catch {
        fetchState().catch(() => undefined);
      } finally {
        notificationMarkingRef.current = false;
      }
    },
    [fetchState, state?.me, state?.notifications],
  );

  useEffect(() => {
    if (tab !== "reading") return;
    void quietlyMarkNotificationsRead(["comment", "reply"]);
  }, [quietlyMarkNotificationsRead, tab]);

  async function refreshAfter(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
      await fetchState();
      broadcastChangeRef.current?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "요청을 처리하지 못했어요");
      fetchState().catch(() => undefined);
    }
  }

  async function refreshAfterSilently(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
      await fetchState();
      broadcastChangeRef.current?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "요청을 처리하지 못했어요");
      fetchState().catch(() => undefined);
    }
  }

  async function login(groupId: string, slug: string) {
    if (loginPending) return;
    setLoginPending(true);
    setError("");
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, slug, pin }),
      });
      const json = await response.json();
      if (!response.ok) {
        setError(json.error || "비밀번호를 다시 확인해 주세요");
        return;
      }
      setPin("");
      await fetchState();
    } finally {
      setLoginPending(false);
    }
  }

  async function logout() {
    setState((prev) => (prev ? { ...prev, me: null } : prev));
    setTab("today");
    setSelectedSlug(null);
    setAuthMode("landing");
    setLookup(null);
    fetch("/api/logout", { method: "POST" }).catch(() => undefined);
  }

  async function createGroup() {
    if (authPending) return;
    setAuthPending(true);
    setError("");
    try {
      const response = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupName: groupNameInput,
          yourName: yourNameInput,
          colorKey: colorKeyInput,
          pin,
          readingMode: readingModeInput,
          startBookId: readingModeInput === "daily_one" ? startBookIdInput : undefined,
          startDayIndex: readingModeInput === "plan" ? startDayIndexInput : undefined,
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        setError(json.error || "그룹을 만들지 못했어요");
        return;
      }
      setPin("");
      setCreatedInviteCode(json.inviteCode);
    } finally {
      setAuthPending(false);
    }
  }

  async function lookupInviteCode(code: string) {
    if (authPending) return;
    setAuthPending(true);
    setError("");
    try {
      const response = await fetch(`/api/groups/lookup?code=${encodeURIComponent(code)}`);
      const json = await response.json();
      if (!response.ok) {
        setError(json.error || "초대 코드를 다시 확인해 주세요");
        return;
      }
      setLookup(json);
      setAuthMode("pick-profile");
    } finally {
      setAuthPending(false);
    }
  }

  async function joinGroup() {
    if (authPending || !lookup) return;
    setAuthPending(true);
    setError("");
    try {
      const response = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inviteCode: inviteCodeInput,
          yourName: yourNameInput,
          colorKey: colorKeyInput,
          pin,
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        setError(json.error || "그룹에 참여하지 못했어요");
        return;
      }
      setPin("");
      await fetchState();
    } finally {
      setAuthPending(false);
    }
  }

  async function checkReadOptimistically(segmentIds: string[]) {
    if (!me || !segmentIds.length) return;
    const checkedAt = new Date().toISOString();
    setState((prev) => {
      if (!prev) return prev;
      const newRows = segmentIds
        .filter((segmentId) => !prev.readingStates.some((item) => item.segment_id === segmentId && item.profile_id === me.id))
        .map((segmentId) => ({
          id: `local-${segmentId}-${me.id}`,
          segment_id: segmentId,
          profile_id: me.id,
          checked_at: checkedAt,
        }));
      if (!newRows.length) return prev;
      return { ...prev, readingStates: [...prev.readingStates, ...newRows] };
    });
    await refreshAfter(() => apiAction("check_read", { segmentIds }));
  }

  if (loading) {
    return (
      <main className="relative z-10 flex min-h-screen items-center justify-center px-6">
        <div className="card rounded-3xl px-6 py-5 text-sm text-[#8B7088]">천천히 준비하는 중...</div>
      </main>
    );
  }

  if (!me) {
    const header = (
      <div className="mb-10 pt-16 text-center">
        <div className="mb-5 inline-flex gap-2 text-[#A93F62]">
          <Sparkles size={18} />
          <Sparkles size={18} className="text-[#C8B5E8]" />
          <Sparkles size={18} className="text-[#B5D5E8]" />
        </div>
        <h1 className="text-5xl font-black leading-tight tracking-normal">
          오늘도<br />
          <span className="text-[#A93F62]">한 페이지</span>
        </h1>
      </div>
    );

    if (createdInviteCode) {
      return (
        <main className="relative z-10 mx-auto flex min-h-screen max-w-[480px] flex-col px-6 py-10">
          {header}
          <div className="card rounded-2xl p-6 text-center">
            <p className="text-sm text-[#8B7088]">그룹이 만들어졌어요!</p>
            <p className="mt-3 text-3xl font-black tracking-[0.2em]">{createdInviteCode}</p>
            <p className="mt-2 text-xs text-[#8B7088]">이 코드를 함께 읽을 사람에게 공유해 주세요.</p>
            <div className="mt-4 flex justify-center gap-2">
              <button
                onClick={() => void navigator.clipboard?.writeText(createdInviteCode)}
                className="inline-flex items-center gap-1 rounded-xl bg-white px-4 py-2 text-sm font-bold text-[#8B7088]"
              >
                <Copy size={14} /> 복사하기
              </button>
              <button
                onClick={() => {
                  setCreatedInviteCode(null);
                  void fetchState();
                }}
                className="rounded-xl px-4 py-2 text-sm font-bold text-white"
                style={{ background: "#A93F62" }}
              >
                시작하기
              </button>
            </div>
          </div>
        </main>
      );
    }

    return (
      <main className="relative z-10 mx-auto flex min-h-screen max-w-[480px] flex-col px-6 py-10">
        {header}

        {authMode === "landing" && (
          <div className="space-y-3">
            <button
              onClick={() => {
                setError("");
                setAuthMode("create-group");
              }}
              className="card focus-ring w-full rounded-2xl px-5 py-4 text-left transition hover:-translate-y-0.5"
            >
              <span className="block text-lg font-bold text-[#A93F62]">그룹 만들기</span>
              <span className="text-xs text-[#8B7088]">새 그룹을 시작하고 초대코드를 받아요</span>
            </button>
            <button
              onClick={() => {
                setError("");
                setAuthMode("enter-code");
              }}
              className="card focus-ring w-full rounded-2xl px-5 py-4 text-left transition hover:-translate-y-0.5"
            >
              <span className="block text-lg font-bold text-[#5F6F3E]">초대코드로 들어가기</span>
              <span className="text-xs text-[#8B7088]">이미 있는 그룹에 참여해요</span>
            </button>
          </div>
        )}

        {authMode === "enter-code" && (
          <div className="space-y-3">
            <BackButton onClick={() => setAuthMode("landing")} />
            <div className="card rounded-2xl p-4">
              <label className="text-xs font-bold text-[#8B7088]">초대코드</label>
              <input
                value={inviteCodeInput}
                onChange={(event) => setInviteCodeInput(event.target.value.toUpperCase())}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void lookupInviteCode(inviteCodeInput);
                }}
                className="focus-ring mt-2 w-full rounded-xl border border-[#F2DCE5] bg-white px-4 py-3 text-base tracking-[0.2em]"
                autoFocus
              />
              <button
                disabled={authPending || !inviteCodeInput.trim()}
                onClick={() => void lookupInviteCode(inviteCodeInput)}
                className="mt-3 w-full rounded-xl px-4 py-3 text-sm font-bold text-white disabled:cursor-default disabled:opacity-60"
                style={{ background: "#A93F62" }}
              >
                {authPending ? "확인 중" : "확인"}
              </button>
            </div>
          </div>
        )}

        {authMode === "create-group" && (
          <div className="space-y-3">
            <BackButton onClick={() => setAuthMode("landing")} />
            <div className="card space-y-3 rounded-2xl p-4">
              <div>
                <label className="text-xs font-bold text-[#8B7088]">그룹 이름</label>
                <input
                  value={groupNameInput}
                  onChange={(event) => setGroupNameInput(event.target.value)}
                  placeholder="예: 주니네 가족"
                  className="focus-ring mt-2 w-full rounded-xl border border-[#F2DCE5] bg-white px-4 py-3 text-base"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#8B7088]">내 이름</label>
                <input
                  value={yourNameInput}
                  onChange={(event) => setYourNameInput(event.target.value)}
                  className="focus-ring mt-2 w-full rounded-xl border border-[#F2DCE5] bg-white px-4 py-3 text-base"
                />
              </div>
              <ColorPicker value={colorKeyInput} onChange={setColorKeyInput} />
              <div>
                <label className="text-xs font-bold text-[#8B7088]">읽는 방식</label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <ReadingModeOption
                    active={readingModeInput === "daily_one"}
                    title="하루 1장"
                    description="같이 한 장씩, 천천히"
                    onClick={() => setReadingModeInput("daily_one")}
                  />
                  <ReadingModeOption
                    active={readingModeInput === "plan"}
                    title="읽기 계획표"
                    description="1년 성경 통독표대로"
                    onClick={() => setReadingModeInput("plan")}
                  />
                </div>
              </div>
              {readingModeInput === "daily_one" ? (
                <div>
                  <label className="text-xs font-bold text-[#8B7088]">시작할 책</label>
                  <select
                    value={startBookIdInput}
                    onChange={(event) => setStartBookIdInput(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-[#F2DCE5] bg-white px-3 py-3 text-sm"
                  >
                    {publicBooks.map((book) => (
                      <option key={book.id} value={book.id}>{book.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="text-xs font-bold text-[#8B7088]">시작할 범위</label>
                  <select
                    value={startDayIndexInput}
                    onChange={(event) => setStartDayIndexInput(Number(event.target.value))}
                    className="mt-2 w-full rounded-xl border border-[#F2DCE5] bg-white px-3 py-3 text-sm"
                  >
                    {READING_PLAN_SECTIONS.map((section) => (
                      <option key={section.startDay} value={section.startDay}>{section.label}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="text-xs font-bold text-[#8B7088]">내 비밀번호 (4~8자)</label>
                <input
                  value={pin}
                  onChange={(event) => setPin(event.target.value)}
                  className="focus-ring mt-2 w-full rounded-xl border border-[#F2DCE5] bg-white px-4 py-3 text-base"
                  inputMode="numeric"
                  type="password"
                />
              </div>
              <button
                disabled={
                  authPending ||
                  !groupNameInput.trim() ||
                  !yourNameInput.trim() ||
                  pin.length < 4 ||
                  (readingModeInput === "daily_one" && !startBookIdInput)
                }
                onClick={() => void createGroup()}
                className="w-full rounded-xl px-4 py-3 text-sm font-bold text-white disabled:cursor-default disabled:opacity-60"
                style={{ background: "#A93F62" }}
              >
                {authPending ? "만드는 중" : "그룹 만들기"}
              </button>
            </div>
          </div>
        )}

        {authMode === "pick-profile" && lookup && (
          <div className="space-y-3">
            <BackButton
              onClick={() => {
                setAuthMode("enter-code");
                setLookup(null);
                setSelectedSlug(null);
              }}
            />
            <p className="text-center text-sm text-[#8B7088]">{lookup.groupName}</p>
            {lookup.profiles.map((person) => (
              <button
                key={person.slug}
                onClick={() => {
                  setSelectedSlug(person.slug);
                  setError("");
                }}
                className="card focus-ring flex w-full items-center justify-between rounded-2xl px-5 py-4 text-left transition hover:-translate-y-0.5"
              >
                <span>
                  <span className="block text-lg font-bold" style={{ color: person.accent_color }}>
                    {person.display_name}
                  </span>
                  <span className="text-xs text-[#8B7088]">들어가기</span>
                </span>
                <span className="h-3 w-3 rounded-full" style={{ background: person.accent_color }} />
              </button>
            ))}
            {lookup.profiles.length < lookup.maxMembers && (
              <button
                onClick={() => setAuthMode("join-group")}
                className="w-full rounded-xl bg-white px-4 py-3 text-sm font-bold text-[#8B7088]"
              >
                새 멤버로 참여하기
              </button>
            )}

            {selectedSlug && (
              <div className="card mt-2 rounded-2xl p-4">
                <label className="text-xs font-bold text-[#8B7088]">비밀번호</label>
                <div className="mt-2 flex gap-2">
                  <input
                    value={pin}
                    onChange={(event) => setPin(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void login(lookup.groupId, selectedSlug);
                    }}
                    className="focus-ring min-w-0 flex-1 rounded-xl border border-[#F2DCE5] bg-white px-4 py-3 text-base"
                    inputMode="numeric"
                    type="password"
                    autoFocus
                  />
                  <button
                    disabled={loginPending}
                    onClick={() => void login(lookup.groupId, selectedSlug)}
                    className="focus-ring inline-flex min-w-[72px] items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white disabled:cursor-default disabled:opacity-80"
                    style={{ background: lookup.profiles.find((person) => person.slug === selectedSlug)?.accent_color ?? "#A93F62" }}
                  >
                    {loginPending ? "확인 중" : "확인"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {authMode === "join-group" && lookup && (
          <div className="space-y-3">
            <BackButton onClick={() => setAuthMode("pick-profile")} />
            <div className="card space-y-3 rounded-2xl p-4">
              <p className="text-sm font-bold">{lookup.groupName}에 참여해요</p>
              <div>
                <label className="text-xs font-bold text-[#8B7088]">내 이름</label>
                <input
                  value={yourNameInput}
                  onChange={(event) => setYourNameInput(event.target.value)}
                  className="focus-ring mt-2 w-full rounded-xl border border-[#F2DCE5] bg-white px-4 py-3 text-base"
                />
              </div>
              <ColorPicker value={colorKeyInput} onChange={setColorKeyInput} usedColorKeys={lookup.profiles.map((p) => p.color_key)} />
              <div>
                <label className="text-xs font-bold text-[#8B7088]">내 비밀번호 (4~8자)</label>
                <input
                  value={pin}
                  onChange={(event) => setPin(event.target.value)}
                  className="focus-ring mt-2 w-full rounded-xl border border-[#F2DCE5] bg-white px-4 py-3 text-base"
                  inputMode="numeric"
                  type="password"
                />
              </div>
              <button
                disabled={authPending || !yourNameInput.trim() || pin.length < 4}
                onClick={() => void joinGroup()}
                className="w-full rounded-xl px-4 py-3 text-sm font-bold text-white disabled:cursor-default disabled:opacity-60"
                style={{ background: "#5F6F3E" }}
              >
                {authPending ? "참여하는 중" : "참여하기"}
              </button>
            </div>
          </div>
        )}

        {error && <p className="mt-4 text-center text-sm text-[#A93F62]">{error}</p>}
      </main>
    );
  }

  const appState = state as AppState;

  return (
    <main className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-4 pb-24 pt-5 md:px-6">
      <header className="mb-5 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold" style={{ color: me.accent_color }}>
            <span className="h-2 w-2 rounded-full" style={{ background: me.accent_color }} />
            {me.display_name}님
          </div>
          <h1 className="mt-1 text-2xl font-black">오늘도 한 페이지</h1>
        </div>
        <div className="flex items-center gap-2">
          <IconButton label="그룹 정보" onClick={() => setGroupInfoOpen(true)}>
            <Users size={18} />
          </IconButton>
          <IconButton label="알림" onClick={() => setNotificationsOpen(true)}>
            <Bell size={18} />
            {unreadCount > 0 && <Badge>{unreadCount}</Badge>}
          </IconButton>
          <button onClick={() => void logout()} className="rounded-full px-3 py-2 text-xs text-[#8B7088] hover:bg-white/60">
            나가기
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-2xl border border-[#F4B5C9] bg-white px-4 py-3 text-sm text-[#A93F62]">
          {error}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0">
          {tab === "today" && currentSegment && (
            <TodayView
              state={appState}
              me={me}
              others={others}
              segment={currentSegment}
              book={currentBook}
              onRead={(segmentIds) => checkReadOptimistically(segmentIds)}
              onOpenSegment={(id) => {
                setSelectedSegmentId(id);
                setTab("reading");
              }}
              action={refreshAfterSilently}
              proposalAction={refreshAfter}
            />
          )}
          {tab === "reading" && activeSegment && (
            <ReadingView
              state={appState}
              me={me}
              activeSegment={activeSegment}
              selectedBookId={selectedBookId}
              setSelectedBookId={setSelectedBookId}
              setSelectedSegmentId={setSelectedSegmentId}
              action={refreshAfterSilently}
              proposalAction={refreshAfter}
            />
          )}
          {tab === "records" && (
            <RecordsView
              state={appState}
              selectedBookId={selectedBookId}
              setSelectedBookId={setSelectedBookId}
              selectedSegmentId={selectedSegmentId}
              setSelectedSegmentId={setSelectedSegmentId}
              me={me}
              action={refreshAfterSilently}
            />
          )}
        </section>

        <aside className="hidden lg:block">
          {appState.readingMode !== "plan" && <NextBookCard state={appState} me={me} action={refreshAfter} />}
        </aside>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[#F2DCE5] bg-[#FFF8F1]/95 px-3 py-2 backdrop-blur">
        <div className="mx-auto grid max-w-[400px] grid-cols-3 gap-2">
          <TabButton active={tab === "today"} icon={<Home size={18} />} label="오늘" onClick={() => setTab("today")} />
          <TabButton active={tab === "reading"} icon={<BookOpen size={18} />} label="코멘트" onClick={() => setTab("reading")} />
          <TabButton active={tab === "records"} icon={<Library size={18} />} label="기록" onClick={() => setTab("records")} />
        </div>
      </nav>

      {notificationsOpen && (
        <Drawer title="알림" onClose={() => setNotificationsOpen(false)}>
          <NotificationsView
            state={appState}
            action={refreshAfterSilently}
            onNavigate={(targetType, targetId) => {
              if (targetType === "segment" && targetId) {
                setSelectedSegmentId(targetId);
                setTab("records");
              }
              setNotificationsOpen(false);
            }}
          />
        </Drawer>
      )}

      {groupInfoOpen && (
        <Drawer title="그룹 정보" onClose={() => setGroupInfoOpen(false)}>
          <GroupInfoView state={appState} me={me} action={refreshAfterSilently} />
        </Drawer>
      )}
      <div className="fixed bottom-[78px] right-4 z-20 rounded-full bg-white/80 px-3 py-1 text-[11px] text-[#8B7088] shadow-sm">
        Realtime {realtimeStatus === "SUBSCRIBED" ? "연결됨" : "연결 중"}
      </div>
    </main>
  );
}

function MissScoreboard({ state, me, others }: { state: AppState; me: Profile; others: Profile[] }) {
  const myCount = state.missCounts[me.id] ?? 0;
  const otherCounts = others.map((profile) => ({ profile, count: state.missCounts[profile.id] ?? 0 }));
  const maxCount = Math.max(myCount, ...otherCounts.map((item) => item.count));
  if (maxCount === 0) return null;

  const myLosing = myCount === maxCount;

  return (
    <div className="card rounded-3xl p-4">
      <h3 className="mb-3 text-sm font-black text-[#8B7088]">이번 책 못 읽기 점수</h3>
      <div className="flex flex-wrap items-center justify-around gap-4">
        <div className={`text-center ${myLosing ? "opacity-100" : "opacity-60"}`}>
          <p className="text-xs font-bold" style={{ color: me.accent_color }}>{me.display_name}</p>
          <p className="mt-1 text-2xl font-black">{myCount}<span className="text-sm">번</span></p>
          {myLosing && <p className="text-xs text-[#A93F62]">😅 지고 있어요</p>}
        </div>
        {otherCounts.map(({ profile, count }) => {
          const losing = count === maxCount;
          return (
            <div key={profile.id} className={`text-center ${losing ? "opacity-100" : "opacity-60"}`}>
              <p className="text-xs font-bold" style={{ color: profile.accent_color }}>{profile.display_name}</p>
              <p className="mt-1 text-2xl font-black">{count}<span className="text-sm">번</span></p>
              {losing && <p className="text-xs text-[#A93F62]">😅 지고 있어요</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GiftSetupCard({ state, me, action }: { state: AppState; me: Profile; action: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [giftText, setGiftText] = useState("");
  const [editing, setEditing] = useState(false);

  const myGift: BookGift | null = state.myGift ?? null;
  const partnerHasGift: boolean = state.partnerHasGift ?? false;

  if (myGift && !editing) {
    return (
      <div className="card rounded-3xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-[#8B7088]">내가 설정한 선물 🎁</p>
            <p className="mt-1 text-sm font-bold">{myGift.gift_description}</p>
            <p className="mt-1 text-xs text-[#A89AA0]">다른 멤버들은 못 봐요</p>
          </div>
          <button onClick={() => { setGiftText(myGift.gift_description); setEditing(true); }} className="text-xs text-[#8B7088] underline">수정</button>
        </div>
        {partnerHasGift && <p className="mt-3 text-xs text-[#A93F62]">누군가 이미 선물을 설정했어요 🤫</p>}
      </div>
    );
  }

  if (!editing && !myGift) {
    return (
      <div className="card rounded-3xl p-4">
        <p className="text-sm font-black">선물 설정 🎁</p>
        <p className="mt-1 text-xs text-[#8B7088]">이번 책에서 지면 줄 선물을 몰래 정해봐요. 다른 멤버들은 책이 끝날 때까지 못 봐요.</p>
        {partnerHasGift && <p className="mt-2 text-xs text-[#A93F62]">누군가 이미 선물을 설정했어요 🤫</p>}
        <button onClick={() => setEditing(true)} className="mt-3 rounded-xl px-4 py-2 text-sm font-bold text-white" style={{ background: me.accent_color }}>
          선물 정하기
        </button>
      </div>
    );
  }

  return (
    <div className="card rounded-3xl p-4">
      <p className="mb-2 text-sm font-black">선물 입력 🎁</p>
      <input
        value={giftText}
        onChange={(e) => setGiftText(e.target.value)}
        placeholder="예: 맛있는 케이크 사주기"
        className="w-full rounded-xl border border-[#F2DCE5] px-3 py-2 text-sm"
        autoFocus
      />
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => {
            const giftDescription = giftText.trim();
            if (!giftDescription) return;
            setEditing(false);
            setGiftText("");
            void action(() => apiAction("set_gift", { giftDescription }));
          }}
          className="rounded-xl px-4 py-2 text-sm font-bold text-white"
          style={{ background: me.accent_color }}
        >
          저장
        </button>
        <button onClick={() => { setEditing(false); setGiftText(""); }} className="rounded-xl px-4 py-2 text-sm text-[#8B7088]">취소</button>
      </div>
    </div>
  );
}

function RevealedGiftsCard({ state }: { state: AppState }) {
  const gifts: BookGift[] = state.revealedGifts ?? [];
  if (!gifts.length) return null;

  return (
    <div className="card rounded-3xl p-5 border-2 border-[#F4B5C9]">
      <p className="mb-3 text-lg font-black">🎁 선물 공개!</p>
      {gifts.map((gift) => {
        const profile = state.profiles.find((p) => p.id === gift.profile_id);
        const sessionCounts = state.revealedGiftMissCounts[gift.session_id] ?? state.missCounts;
        const missCount = sessionCounts[gift.profile_id] ?? 0;
        const otherCounts = state.profiles.filter((item) => item.id !== gift.profile_id).map((item) => sessionCounts[item.id] ?? 0);
        const isLoser = otherCounts.every((c) => missCount >= c);
        return (
          <div key={gift.id} className="mb-3 rounded-2xl bg-[#FFF8F1] p-3">
            <p className="text-xs font-bold" style={{ color: profile?.accent_color }}>{profile?.display_name}</p>
            {isLoser && <p className="text-xs text-[#8B7088]">이번 책에서 {missCount}번 못 읽었어요 😅</p>}
            <p className="mt-1 font-bold">선물: {gift.gift_description}</p>
          </div>
        );
      })}
    </div>
  );
}

function TodayView({
  state,
  me,
  others,
  segment,
  book,
  onRead,
  onOpenSegment,
  action,
  proposalAction,
}: {
  state: AppState;
  me: Profile;
  others: Profile[];
  segment: Segment;
  book: Book | null;
  onRead: (segmentIds: string[]) => void;
  onOpenSegment: (id: string) => void;
  action: (fn: () => Promise<unknown>) => Promise<void>;
  proposalAction: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const isPlanMode = state.readingMode === "plan" && Boolean(state.planDay);
  const todaySegments = isPlanMode
    ? (state.planDay?.segment_ids
        .map((id) => state.segments.find((item) => item.id === id))
        .filter((item): item is Segment => Boolean(item)) ?? [])
    : [segment];
  const todaySegmentIds = todaySegments.map((item) => item.id);

  const myRead = todaySegmentIds.every((id) => state.readingStates.some((item) => item.segment_id === id && item.profile_id === me.id));
  const othersRead = others.map((profile) => ({
    profile,
    done: todaySegmentIds.every((id) => state.readingStates.some((item) => item.segment_id === id && item.profile_id === profile.id)),
  }));
  const allRead = myRead && othersRead.every((item) => item.done);
  const comments = state.comments.filter((item) => todaySegmentIds.includes(item.segment_id));
  const highlights = state.highlights.filter((item) => todaySegmentIds.includes(item.segment_id));
  const missedProfiles = state.manualAdvance.missedProfileIds
    .map((profileId) => state.profiles.find((profile) => profile.id === profileId)?.display_name)
    .filter((name): name is string => Boolean(name));
  const showManualAdvance = missedProfiles.length > 0;

  return (
    <div className="space-y-5">
      <RevealedGiftsCard state={state} />

      <div className="card rounded-3xl p-6">
        <p className="text-sm text-[#8B7088]">오늘은</p>
        <h2 className="mt-2 text-4xl font-black">
          {isPlanMode ? (
            <span style={{ color: me.accent_color }}>{formatPlanRange(todaySegments)}</span>
          ) : (
            <>
              <span style={{ color: me.accent_color }}>{segment.book_name}</span> {segment.chapter}장
            </>
          )}
        </h2>
        {(showManualAdvance || allRead) && (
          <p className="mt-2 text-sm text-[#8B7088]">
            {showManualAdvance
              ? `${missedProfiles.join(", ")}님이 전날 못 읽어서 멈춰 있어요.`
              : "오늘은 모두 읽었어요. 새벽 2시에 다음 범위가 열려요."}
          </p>
        )}
        <div className={`mt-6 grid gap-3 ${showManualAdvance ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          <a
            href={todaySegments[0]?.jw_url ?? undefined}
            target="_blank"
            rel="noreferrer"
            className="rounded-2xl px-4 py-4 text-center text-sm font-bold text-white"
            style={{ background: me.accent_color }}
          >
            연구용 본문 보기
          </a>
          <button
            disabled={myRead}
            onClick={() => onRead(todaySegmentIds)}
            className="rounded-2xl border border-dashed px-4 py-4 text-sm font-bold disabled:cursor-default disabled:opacity-60"
            style={{ borderColor: me.accent_soft, color: me.accent_color }}
          >
            {myRead ? "읽음 체크 완료" : "다 읽었어요"}
          </button>
          {showManualAdvance && (
            <button
              disabled={!state.manualAdvance.available}
              onClick={() => action(() => apiAction("manual_advance"))}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-4 text-sm font-bold disabled:cursor-default disabled:opacity-50"
              style={{ borderColor: me.accent_color, color: me.accent_color }}
            >
              <SkipForward size={16} />
              {state.manualAdvance.available ? "다음 범위 열기" : "읽음 체크 후 열기"}
            </button>
          )}
        </div>
      </div>

      <div className={`grid gap-3 ${others.length > 1 ? "sm:grid-cols-2 md:grid-cols-3" : "sm:grid-cols-2"}`}>
        <ReadChip profile={me} done={myRead} />
        {othersRead.map(({ profile, done }) => (
          <ReadChip key={profile.id} profile={profile} done={done} />
        ))}
      </div>

      <MissScoreboard state={state} me={me} others={others} />
      <GiftSetupCard state={state} me={me} action={action} />

      <div className="card rounded-3xl p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-black">이 장의 코멘트</h3>
          <button onClick={() => onOpenSegment(segment.id)} className="text-sm font-bold" style={{ color: me.accent_color }}>
            코멘트 열기
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <MiniStat label="코멘트" value={`${comments.length}개`} />
          <MiniStat label="구절 표시" value={`${highlights.length}개`} />
        </div>
      </div>

      {!isPlanMode && (
        <div className="lg:hidden">
          <NextBookCard state={state} me={me} action={proposalAction} />
        </div>
      )}
      {isPlanMode
        ? <p className="text-center text-xs text-[#A89AA0]">지금 함께 읽는 책: {todaySegments[todaySegments.length - 1]?.book_name ?? ""}</p>
        : book && <p className="text-center text-xs text-[#A89AA0]">지금 함께 읽는 책: {book.name}</p>}
    </div>
  );
}

function ReadingView({
  state,
  me,
  activeSegment,
  selectedBookId,
  setSelectedBookId,
  setSelectedSegmentId,
  action,
  proposalAction,
}: {
  state: AppState;
  me: Profile;
  activeSegment: Segment;
  selectedBookId: string;
  setSelectedBookId: (id: string) => void;
  setSelectedSegmentId: (id: string) => void;
  action: (fn: () => Promise<unknown>) => Promise<void>;
  proposalAction: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const selectedBook = state.books.find((book) => book.id === selectedBookId) ?? state.books.find((book) => book.id === activeSegment.book_id);
  const bookSegments = state.segments.filter((segment) => segment.book_id === selectedBook?.id);

  return (
    <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
      <div className="card rounded-3xl p-4">
          <h2 className="mb-3 text-lg font-black">코멘트할 장</h2>
        <div className="max-h-[360px] space-y-2 overflow-auto pr-1">
          {state.books.map((book) => (
            <button
              key={book.id}
              onClick={() => setSelectedBookId(book.id)}
              className={`w-full rounded-2xl px-3 py-2 text-left text-sm ${selectedBook?.id === book.id ? "bg-[#FCE4EC] font-bold text-[#A93F62]" : "hover:bg-white"}`}
            >
              {book.name}
            </button>
          ))}
        </div>
        {state.readingMode !== "plan" && <NextBookCard state={state} me={me} action={proposalAction} compact />}
      </div>

      <div className="space-y-5">
        <div className="card rounded-3xl p-4">
          <h2 className="mb-3 text-lg font-black">{selectedBook?.name ?? "책"} 코멘트</h2>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
            {bookSegments.map((segment) => {
              const done = state.readingStates.some((item) => item.segment_id === segment.id);
              const active = activeSegment.id === segment.id;
              return (
                <button
                  key={segment.id}
                  onClick={() => setSelectedSegmentId(segment.id)}
                  className={`rounded-xl border px-2 py-2 text-sm ${active ? "border-[#A93F62] bg-[#FCE4EC] font-bold text-[#A93F62]" : "border-[#F2DCE5] bg-white/80"}`}
                >
                  {segment.chapter}장 {done && <Check className="inline" size={13} />}
                </button>
              );
            })}
          </div>
        </div>
        <SegmentDetail state={state} me={me} segment={activeSegment} action={action} />
      </div>
    </div>
  );
}

function SegmentDetail({
  state,
  me,
  segment,
  action,
}: {
  state: AppState;
  me: Profile;
  segment: Segment;
  action: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [comment, setComment] = useState("");
  const [note, setNote] = useState("");
  const [manualVerse, setManualVerse] = useState("");
  const [startVerse, setStartVerse] = useState<number | null>(null);
  const [endVerse, setEndVerse] = useState<number | null>(null);
  const [color, setColor] = useState(HIGHLIGHT_COLORS[0]);
  const verseCount = state.verseCounts.find((item) => item.book_id === segment.book_id && item.chapter === segment.chapter)?.verse_count ?? null;
  const comments = state.comments.filter((item) => item.segment_id === segment.id);
  const highlights = state.highlights.filter((item) => item.segment_id === segment.id);
  const selectedVerseRef = getVerseRef(segment, startVerse, endVerse, manualVerse);

  function toggleVerse(verse: number) {
    if (!startVerse || (startVerse && endVerse)) {
      setStartVerse(verse);
      setEndVerse(null);
      return;
    }
    if (verse === startVerse) {
      setStartVerse(null);
      setEndVerse(null);
      return;
    }
    setEndVerse(verse);
  }

  return (
    <div className="space-y-5">
      <div className="card rounded-3xl p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-[#C8826A]">연구용 성경</p>
            <h2 className="mt-1 text-3xl font-black">{segment.display}</h2>
            <p className="mt-2 text-sm text-[#8B7088]">읽고 떠오른 생각을 먼저 남겨요.</p>
          </div>
          <a href={segment.jw_url ?? undefined} target="_blank" rel="noreferrer" className="rounded-full bg-white px-4 py-2 text-sm font-bold text-[#8B7088]">
            본문 보기
          </a>
        </div>

        <div className="mb-4 rounded-2xl bg-white p-4">
          <h3 className="mb-3 font-black">코멘트 남기기</h3>
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="이 장에서 떠오른 생각을 남겨요"
            className="min-h-28 w-full rounded-2xl border border-[#F2DCE5] px-4 py-3"
          />
          <button
            onClick={() => {
              const body = comment.trim();
              if (!body) return;
              setComment("");
              void action(async () => {
                await apiAction("add_comment", { segmentId: segment.id, body });
              });
            }}
            className="mt-3 rounded-xl px-4 py-2 text-sm font-bold text-white"
            style={{ background: me.accent_color }}
          >
            코멘트 남기기
          </button>
        </div>

        <div className="rounded-2xl bg-[#FFF8F1] p-4">
          <h3 className="mb-3 font-black">구절 표시도 남기기</h3>
          {verseCount ? (
            <div className="mb-3 grid grid-cols-6 gap-2 sm:grid-cols-10">
              {Array.from({ length: verseCount }, (_, index) => index + 1).map((verse) => {
                const selected = isVerseSelected(verse, startVerse, endVerse);
                return (
                  <button
                    key={verse}
                    onClick={() => toggleVerse(verse)}
                    className={`rounded-xl px-2 py-2 text-sm ${selected ? "font-bold text-white" : "bg-white text-[#8B7088]"}`}
                    style={selected ? { background: me.accent_color } : undefined}
                  >
                    {verse}
                  </button>
                );
              })}
            </div>
          ) : (
            <input
              value={manualVerse}
              onChange={(event) => setManualVerse(event.target.value)}
              placeholder={`${segment.book_name} ${segment.chapter}:1`}
              className="mb-3 w-full rounded-xl border border-[#F2DCE5] px-3 py-2"
            />
          )}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {HIGHLIGHT_COLORS.map((item) => (
              <button
                key={item}
                onClick={() => setColor(item)}
                className={`h-8 w-8 rounded-full border-2 ${color === item ? "border-[#3A2E3A]" : "border-white"}`}
                style={{ background: item }}
                aria-label="색 선택"
              />
            ))}
            <span className="text-sm text-[#8B7088]">{selectedVerseRef || "구절을 선택해 주세요"}</span>
          </div>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="짧은 메모를 남겨요"
            className="mb-3 min-h-20 w-full rounded-xl border border-[#F2DCE5] px-3 py-2"
          />
          <button
            onClick={() => {
              if (!selectedVerseRef) return;
              const nextHighlight = {
                segmentId: segment.id,
                verseRef: selectedVerseRef,
                startVerse,
                endVerse: endVerse ?? startVerse,
                note,
                color,
              };
              setNote("");
              setStartVerse(null);
              setEndVerse(null);
              setManualVerse("");
              void action(async () => {
                await apiAction("add_highlight", {
                  segmentId: nextHighlight.segmentId,
                  verseRef: nextHighlight.verseRef,
                  startVerse: nextHighlight.startVerse,
                  endVerse: nextHighlight.endVerse,
                  note: nextHighlight.note,
                  color: nextHighlight.color,
                });
              });
            }}
            className="rounded-xl px-4 py-2 text-sm font-bold text-white"
            style={{ background: me.accent_color }}
          >
            구절 남기기
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {highlights.map((highlight) => (
          <HighlightCard key={highlight.id} highlight={highlight} state={state} me={me} action={action} />
        ))}
        {comments.map((item) => (
          <CommentCard key={item.id} comment={item} state={state} me={me} action={action} />
        ))}
        {comments.length === 0 && highlights.length === 0 && (
          <div className="card rounded-3xl p-5 text-center text-sm text-[#8B7088]">아직 남긴 기록이 없어요.</div>
        )}
      </div>
    </div>
  );
}

function HighlightCard({ highlight, state, me, action }: { highlight: Highlight; state: AppState; me: Profile; action: (fn: () => Promise<unknown>) => Promise<void> }) {
  const author = state.profiles.find((profile) => profile.id === highlight.profile_id);
  const replies = state.replies.filter((reply) => reply.parent_type === "highlight" && reply.parent_id === highlight.id);
  const reactions = state.reactions.filter((reaction) => reaction.target_type === "highlight" && reaction.target_id === highlight.id);
  return (
    <EntryCard
      title={highlight.verse_ref}
      body={highlight.note || "표시만 남겼어요"}
      author={author}
      createdAt={highlight.created_at}
      tint={highlight.color || "#F4B5C9"}
      mine={highlight.profile_id === me.id}
      replies={replies}
      reactions={reactions.length}
      reacted={reactions.some((reaction) => reaction.profile_id === me.id)}
      state={state}
      me={me}
      onReact={() => action(() => apiAction("toggle_reaction", { targetType: "highlight", targetId: highlight.id }))}
      onReply={(body) => action(() => apiAction("add_reply", { parentType: "highlight", parentId: highlight.id, body }))}
      onEdit={() => editText(highlight.note || "", (body) => action(() => apiAction("update_highlight", { id: highlight.id, verseRef: highlight.verse_ref, note: body, color: highlight.color })))}
      onDelete={() => confirmDelete(() => action(() => apiAction("delete_highlight", { id: highlight.id })))}
      action={action}
    />
  );
}

function CommentCard({ comment, state, me, action }: { comment: SegmentComment; state: AppState; me: Profile; action: (fn: () => Promise<unknown>) => Promise<void> }) {
  const author = state.profiles.find((profile) => profile.id === comment.profile_id);
  const replies = state.replies.filter((reply) => reply.parent_type === "comment" && reply.parent_id === comment.id);
  const reactions = state.reactions.filter((reaction) => reaction.target_type === "comment" && reaction.target_id === comment.id);
  return (
    <EntryCard
      title="코멘트"
      body={comment.body}
      author={author}
      createdAt={comment.created_at}
      mine={comment.profile_id === me.id}
      replies={replies}
      reactions={reactions.length}
      reacted={reactions.some((reaction) => reaction.profile_id === me.id)}
      state={state}
      me={me}
      onReact={() => action(() => apiAction("toggle_reaction", { targetType: "comment", targetId: comment.id }))}
      onReply={(body) => action(() => apiAction("add_reply", { parentType: "comment", parentId: comment.id, body }))}
      onEdit={() => editText(comment.body, (body) => action(() => apiAction("update_comment", { id: comment.id, body })))}
      onDelete={() => confirmDelete(() => action(() => apiAction("delete_comment", { id: comment.id })))}
      action={action}
    />
  );
}

function EntryCard({
  title,
  body,
  author,
  createdAt,
  tint,
  mine,
  replies,
  reactions,
  reacted,
  state,
  me,
  onReact,
  onReply,
  onEdit,
  onDelete,
  action,
}: {
  title: string;
  body: string;
  author?: Profile;
  createdAt: string;
  tint?: string;
  mine: boolean;
  replies: Reply[];
  reactions: number;
  reacted: boolean;
  state: AppState;
  me: Profile;
  onReact: () => void;
  onReply: (body: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  action: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [reply, setReply] = useState("");
  const [localReacted, setLocalReacted] = useState(reacted);
  const [localReactions, setLocalReactions] = useState(reactions);

  useEffect(() => {
    setLocalReacted(reacted);
    setLocalReactions(reactions);
  }, [reacted, reactions]);

  function toggleLocalReaction() {
    const nextReacted = !localReacted;
    setLocalReacted(nextReacted);
    setLocalReactions((current) => Math.max(0, current + (nextReacted ? 1 : -1)));
    onReact();
  }

  return (
    <div className="card rounded-3xl p-5" style={tint ? { borderColor: tint } : undefined}>
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold" style={{ color: author?.accent_color ?? "#8B7088" }}>
            {author?.display_name ?? "누군가"} · {shortDate(createdAt)}
          </p>
          <h3 className="mt-1 font-black">{title}</h3>
        </div>
        {mine && (
          <div className="flex gap-1">
            <IconButton label="수정" onClick={onEdit}>
              <Pencil size={15} />
            </IconButton>
            <IconButton label="삭제" onClick={onDelete}>
              <Trash2 size={15} />
            </IconButton>
          </div>
        )}
      </div>
      <p className="whitespace-pre-wrap text-sm leading-6">{body}</p>
      <div className="mt-4 flex items-center gap-2">
        <button onClick={toggleLocalReaction} className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs ${localReacted ? "bg-[#FCE4EC] text-[#A93F62]" : "bg-white text-[#8B7088]"}`}>
          <Heart size={14} /> {localReactions}
        </button>
      </div>
      {replies.length > 0 && (
        <div className="mt-4 space-y-2 border-l-2 border-[#F2DCE5] pl-3">
          {replies.map((item) => {
            const replyAuthor = state.profiles.find((profile) => profile.id === item.profile_id);
            return (
              <div key={item.id} className="rounded-2xl bg-[#FFF8F1] p-3 text-sm">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-bold" style={{ color: replyAuthor?.accent_color ?? "#8B7088" }}>
                    {replyAuthor?.display_name} · {shortDate(item.created_at)}
                  </span>
                  {item.profile_id === me.id && (
                    <span className="flex gap-1">
                      <button onClick={() => editText(item.body, (next) => action(() => apiAction("update_reply", { id: item.id, body: next })))} className="text-[#8B7088]">
                        수정
                      </button>
                      <button onClick={() => confirmDelete(() => action(() => apiAction("delete_reply", { id: item.id })))} className="text-[#A93F62]">
                        삭제
                      </button>
                    </span>
                  )}
                </div>
                {item.body}
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <input value={reply} onChange={(event) => setReply(event.target.value)} placeholder="답글" className="min-w-0 flex-1 rounded-xl border border-[#F2DCE5] px-3 py-2 text-sm" />
        <button
          onClick={() => {
            if (!reply.trim()) return;
            onReply(reply);
            setReply("");
          }}
          className="rounded-xl px-3 py-2 text-sm font-bold text-white"
          style={{ background: me.accent_color }}
        >
          남기기
        </button>
      </div>
    </div>
  );
}

function RecordsView({
  state,
  selectedBookId,
  setSelectedBookId,
  selectedSegmentId,
  setSelectedSegmentId,
  me,
  action,
}: {
  state: AppState;
  selectedBookId: string;
  setSelectedBookId: (id: string) => void;
  selectedSegmentId: string | null;
  setSelectedSegmentId: (id: string) => void;
  me: Profile;
  action: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const selectedBook = state.books.find((book) => book.id === selectedBookId) ?? state.books[0];
  const bookSegments = state.segments.filter((segment) => segment.book_id === selectedBook?.id);
  const selectedSegment = state.segments.find((segment) => segment.id === selectedSegmentId) ?? bookSegments[0] ?? state.segments[0];
  return (
    <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
      <div className="card rounded-3xl p-4">
        <h2 className="mb-3 text-lg font-black">기록</h2>
        <div className="max-h-[420px] space-y-2 overflow-auto pr-1">
          {state.books.map((book) => {
            const segments = state.segments.filter((segment) => segment.book_id === book.id);
            const read = segments.filter((segment) => state.readingStates.some((item) => item.segment_id === segment.id)).length;
            return (
              <button key={book.id} onClick={() => setSelectedBookId(book.id)} className={`w-full rounded-2xl px-3 py-2 text-left text-sm ${selectedBook?.id === book.id ? "bg-[#FCE4EC] font-bold text-[#A93F62]" : "hover:bg-white"}`}>
                <span className="block">{book.name}</span>
                <span className="text-xs text-[#A89AA0]">{read}/{book.chapter_count}장</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="space-y-5">
        <div className="card rounded-3xl p-4">
          <h3 className="mb-3 font-black">{selectedBook?.name} 장</h3>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
            {bookSegments.map((segment) => {
              const states = state.readingStates.filter((item) => item.segment_id === segment.id);
              return (
                <button key={segment.id} onClick={() => setSelectedSegmentId(segment.id)} className={`rounded-xl border px-2 py-2 text-sm ${selectedSegment?.id === segment.id ? "border-[#A93F62] bg-[#FCE4EC] font-bold text-[#A93F62]" : "border-[#F2DCE5] bg-white/80"}`}>
                  {segment.chapter}장 {states.length > 0 && <Check className="inline" size={13} />}
                </button>
              );
            })}
          </div>
        </div>
        {selectedSegment && <RecordDetail state={state} segment={selectedSegment} me={me} action={action} />}
      </div>
    </div>
  );
}

function RecordDetail({ state, segment, me, action }: { state: AppState; segment: Segment; me: Profile; action: (fn: () => Promise<unknown>) => Promise<void> }) {
  const readStates = state.readingStates.filter((item) => item.segment_id === segment.id);
  return (
    <div className="space-y-5">
      <div className="card rounded-3xl p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-2xl font-black">{segment.display}</h2>
          <a href={segment.jw_url ?? undefined} target="_blank" rel="noreferrer" className="rounded-full bg-white px-4 py-2 text-sm font-bold text-[#8B7088]">
            본문 보기
          </a>
        </div>
        <div className="mt-3 space-y-1 text-sm text-[#8B7088]">
          {readStates.length ? (
            readStates.map((item) => {
              const profile = state.profiles.find((person) => person.id === item.profile_id);
              return <p key={item.id}>{profile?.display_name} · {formatDate(item.checked_at)}</p>;
            })
          ) : (
            <p>아직 함께 읽지 않은 장이에요.</p>
          )}
        </div>
      </div>
      <ReadOnlySegmentDetail state={state} segment={segment} />
    </div>
  );
}

function ReadOnlySegmentDetail({ state, segment }: { state: AppState; segment: Segment }) {
  const comments = state.comments.filter((item) => item.segment_id === segment.id);
  const highlights = state.highlights.filter((item) => item.segment_id === segment.id);

  return (
    <div className="space-y-3">
      {comments.map((comment) => {
        const author = state.profiles.find((profile) => profile.id === comment.profile_id);
        const replies = state.replies.filter((reply) => reply.parent_type === "comment" && reply.parent_id === comment.id);
        const reactions = state.reactions.filter((reaction) => reaction.target_type === "comment" && reaction.target_id === comment.id);
        return (
          <ReadOnlyEntryCard
            key={comment.id}
            title="코멘트"
            body={comment.body}
            author={author}
            createdAt={comment.created_at}
            replies={replies}
            reactions={reactions.length}
            state={state}
          />
        );
      })}
      {highlights.map((highlight) => {
        const author = state.profiles.find((profile) => profile.id === highlight.profile_id);
        const replies = state.replies.filter((reply) => reply.parent_type === "highlight" && reply.parent_id === highlight.id);
        const reactions = state.reactions.filter((reaction) => reaction.target_type === "highlight" && reaction.target_id === highlight.id);
        return (
          <ReadOnlyEntryCard
            key={highlight.id}
            title={highlight.verse_ref}
            body={highlight.note || "표시만 남겼어요"}
            author={author}
            createdAt={highlight.created_at}
            replies={replies}
            reactions={reactions.length}
            state={state}
            tint={highlight.color || "#F4B5C9"}
          />
        );
      })}
      {comments.length === 0 && highlights.length === 0 && (
        <div className="card rounded-3xl p-5 text-center text-sm text-[#8B7088]">아직 남긴 기록이 없어요.</div>
      )}
    </div>
  );
}

function ReadOnlyEntryCard({
  title,
  body,
  author,
  createdAt,
  replies,
  reactions,
  state,
  tint,
}: {
  title: string;
  body: string;
  author?: Profile;
  createdAt: string;
  replies: Reply[];
  reactions: number;
  state: AppState;
  tint?: string;
}) {
  return (
    <div className="card rounded-3xl p-5" style={tint ? { borderColor: tint } : undefined}>
      <p className="text-xs font-bold" style={{ color: author?.accent_color ?? "#8B7088" }}>
        {author?.display_name ?? "누군가"} · {shortDate(createdAt)}
      </p>
      <h3 className="mt-1 font-black">{title}</h3>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{body}</p>
      {reactions > 0 && <p className="mt-3 text-xs text-[#8B7088]">하트 {reactions}개</p>}
      {replies.length > 0 && (
        <div className="mt-4 space-y-2 border-l-2 border-[#F2DCE5] pl-3">
          {replies.map((reply) => {
            const replyAuthor = state.profiles.find((profile) => profile.id === reply.profile_id);
            return (
              <div key={reply.id} className="rounded-2xl bg-[#FFF8F1] p-3 text-sm">
                <p className="mb-1 text-xs font-bold" style={{ color: replyAuthor?.accent_color ?? "#8B7088" }}>
                  {replyAuthor?.display_name} · {shortDate(reply.created_at)}
                </p>
                {reply.body}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function getBookIdsWithReadingRecord(state: AppState) {
  const bookIds = new Set<string>();
  const segmentBookIds = new Map(state.segments.map((segment) => [segment.id, segment.book_id]));

  if (state.progress?.initial_book_id) bookIds.add(state.progress.initial_book_id);
  if (state.progress?.current_book_id) bookIds.add(state.progress.current_book_id);
  for (const readingState of state.readingStates) {
    const bookId = segmentBookIds.get(readingState.segment_id);
    if (bookId) bookIds.add(bookId);
  }
  for (const proposal of state.proposals) {
    if (proposal.status === "started") bookIds.add(proposal.proposed_book_id);
  }

  return bookIds;
}

function NextBookCard({ state, me, action, compact }: { state: AppState; me: Profile; action: (fn: () => Promise<unknown>) => Promise<void>; compact?: boolean }) {
  const readBookIds = useMemo(() => getBookIdsWithReadingRecord(state), [state]);
  const nextBook = state.nextBook;
  const nextBookInfo = state.books.find((book) => book.id === nextBook?.bookId);
  const [editing, setEditing] = useState(false);
  const [bookId, setBookId] = useState(nextBook?.bookId ?? "");

  useEffect(() => {
    setEditing(false);
    setBookId(nextBook?.bookId ?? "");
  }, [nextBook?.bookId]);

  if (!nextBook) return null;

  const openEditor = () => {
    setBookId(nextBook.bookId);
    setEditing(true);
  };

  const submit = () => {
    if (!bookId) return;
    setEditing(false);
    void action(() => apiAction("set_next_book", { bookId }));
  };

  return (
    <div className={`card mt-4 rounded-3xl p-4 ${compact ? "" : "sticky top-5"}`}>
      <h3 className="font-black">다음 책</h3>
      <div className="mt-3 rounded-2xl bg-[#FFF8F1] p-3 text-sm">
        <p className="font-bold">{nextBookInfo?.name ?? "정하는 중"}</p>
        <p className="mt-1 text-[#8B7088]">{nextBook.isOwnerPick ? "방장이 정했어요" : "자동으로 정해져요"}</p>
      </div>

      {state.isOwner && !editing && (
        <button onClick={openEditor} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-bold text-[#8B7088]">
          <RefreshCw size={14} />
          다음 책 바꾸기
        </button>
      )}

      {state.isOwner && editing && (
        <div className="mt-3 space-y-2">
          <select value={bookId} onChange={(event) => setBookId(event.target.value)} className="w-full rounded-xl border border-[#F2DCE5] bg-white px-3 py-2 text-sm">
            {state.books.map((book) => (
              <option key={book.id} value={book.id}>{book.name}{readBookIds.has(book.id) ? " (읽은 기록 있음)" : ""}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              onClick={submit}
              className="flex-1 rounded-xl px-3 py-2 text-sm font-bold text-white disabled:cursor-default disabled:opacity-50"
              style={{ background: me.accent_color }}
            >
              정하기
            </button>
            <button onClick={() => setEditing(false)} className="rounded-xl bg-white px-3 py-2 text-sm text-[#8B7088]">취소</button>
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationsView({ state, action, onNavigate }: { state: AppState; action: (fn: () => Promise<unknown>) => Promise<void>; onNavigate: (targetType: string | null, targetId: string | null) => void }) {
  const notifications = state.notifications.filter((item) => !item.read_at);
  return (
    <div className="space-y-3">
      {notifications.length > 0 && (
        <button onClick={() => action(() => apiAction("mark_all_notifications_read"))} className="rounded-xl bg-white px-3 py-2 text-sm font-bold text-[#8B7088]">
          모두 읽음
        </button>
      )}
      {notifications.map((item) => (
        <button
          key={item.id}
          onClick={() =>
            action(async () => {
              await apiAction("mark_notification_read", { id: item.id });
              onNavigate(item.target_type, item.target_id);
            })
          }
          className="block w-full rounded-2xl bg-[#FCE4EC] p-4 text-left"
        >
          <p className="font-bold">{item.title}</p>
          {item.body && <p className="mt-1 text-sm text-[#8B7088]">{item.body}</p>}
          <p className="mt-2 text-xs text-[#A89AA0]">{shortDate(item.created_at)}</p>
        </button>
      ))}
      {notifications.length === 0 && <p className="rounded-2xl bg-white p-4 text-center text-sm text-[#8B7088]">새 알림이 없어요.</p>}
    </div>
  );
}

function GroupInfoView({ state, me, action }: { state: AppState; me: Profile; action: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [copied, setCopied] = useState(false);
  const [editingGroupName, setEditingGroupName] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState(state.groupName);
  const [editingMyName, setEditingMyName] = useState(false);
  const [myNameDraft, setMyNameDraft] = useState(me.display_name);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-bold text-[#8B7088]">그룹 이름</p>
        {editingGroupName ? (
          <div className="mt-2 flex gap-2">
            <input
              value={groupNameDraft}
              onChange={(event) => setGroupNameDraft(event.target.value)}
              className="focus-ring min-w-0 flex-1 rounded-xl border border-[#F2DCE5] bg-white px-3 py-2 text-sm"
              autoFocus
            />
            <button
              onClick={() => {
                const name = groupNameDraft.trim();
                if (!name) return;
                setEditingGroupName(false);
                void action(() => apiAction("update_group_name", { groupName: name }));
              }}
              className="rounded-xl px-3 py-2 text-sm font-bold text-white"
              style={{ background: me.accent_color }}
            >
              저장
            </button>
          </div>
        ) : (
          <div className="mt-1 flex items-center gap-2">
            <p className="text-lg font-bold">{state.groupName}</p>
            {state.isOwner && (
              <button
                onClick={() => {
                  setGroupNameDraft(state.groupName);
                  setEditingGroupName(true);
                }}
                className="text-[#8B7088]"
                aria-label="그룹 이름 수정"
              >
                <Pencil size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="card rounded-2xl p-6 text-center">
        <p className="text-xs font-bold text-[#8B7088]">초대코드</p>
        <p className="mt-2 text-3xl font-black tracking-[0.2em]">{state.inviteCode}</p>
        <button
          onClick={() => {
            void navigator.clipboard?.writeText(state.inviteCode);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="mt-4 inline-flex items-center gap-1 rounded-xl bg-white px-4 py-2 text-sm font-bold text-[#8B7088]"
        >
          <Copy size={14} /> {copied ? "복사됨" : "복사하기"}
        </button>
      </div>
      <p className="text-center text-xs text-[#A89AA0]">
        코드를 잃어버려도 로그인된 멤버가 있으면 이 화면에서 다시 확인할 수 있어요.
      </p>

      <div>
        <p className="text-xs font-bold text-[#8B7088]">멤버</p>
        <div className="mt-2 space-y-2">
          {state.profiles.map((profile) => (
            <div key={profile.id} className="card flex items-center justify-between gap-2 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: profile.accent_color }} />
                {profile.id === me.id && editingMyName ? (
                  <input
                    value={myNameDraft}
                    onChange={(event) => setMyNameDraft(event.target.value)}
                    className="focus-ring min-w-0 rounded-xl border border-[#F2DCE5] bg-white px-2 py-1 text-sm"
                    autoFocus
                  />
                ) : (
                  <p className="font-bold" style={{ color: profile.accent_color }}>{profile.display_name}</p>
                )}
              </div>
              {profile.id === me.id && (
                editingMyName ? (
                  <button
                    onClick={() => {
                      const name = myNameDraft.trim();
                      if (!name) return;
                      setEditingMyName(false);
                      void action(() => apiAction("update_my_name", { displayName: name }));
                    }}
                    className="rounded-xl px-3 py-1 text-xs font-bold text-white"
                    style={{ background: me.accent_color }}
                  >
                    저장
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setMyNameDraft(profile.display_name);
                      setEditingMyName(true);
                    }}
                    className="text-[#8B7088]"
                    aria-label="내 이름 수정"
                  >
                    <Pencil size={14} />
                  </button>
                )
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Composer({ value, onChange, placeholder, button, color, onSubmit }: { value: string; onChange: (v: string) => void; placeholder: string; button: string; color: string; onSubmit: () => void }) {
  return (
    <div className="card rounded-3xl p-4">
      <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="min-h-24 w-full rounded-2xl border border-[#F2DCE5] px-4 py-3" />
      <button onClick={onSubmit} className="mt-3 rounded-xl px-4 py-2 text-sm font-bold text-white" style={{ background: color }}>
        {button}
      </button>
    </div>
  );
}

function ReadChip({ profile, done }: { profile: Profile; done: boolean }) {
  return (
    <div className="card flex items-center gap-3 rounded-2xl p-4">
      <span className="flex h-9 w-9 items-center justify-center rounded-full text-white" style={{ background: profile.accent_color }}>
        {done ? <Check size={18} /> : profile.display_name.slice(0, 1)}
      </span>
      <div>
        <p className="font-bold">{profile.display_name}</p>
        <p className="text-xs text-[#8B7088]">{done ? "읽었어요" : "천천히 읽는 중"}</p>
      </div>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1 text-sm font-bold text-[#8B7088]">
      <ChevronLeft size={16} /> 뒤로
    </button>
  );
}

function ColorPicker({
  value,
  onChange,
  usedColorKeys = [],
}: {
  value: string;
  onChange: (colorKey: string) => void;
  usedColorKeys?: string[];
}) {
  return (
    <div>
      <label className="text-xs font-bold text-[#8B7088]">내 색상</label>
      <div className="mt-2 flex flex-wrap gap-2">
        {MEMBER_COLOR_PALETTE.map((color) => {
          const used = usedColorKeys.includes(color.colorKey) && color.colorKey !== value;
          return (
            <button
              key={color.colorKey}
              type="button"
              disabled={used}
              onClick={() => onChange(color.colorKey)}
              className={`h-9 w-9 rounded-full border-2 disabled:cursor-not-allowed disabled:opacity-30 ${value === color.colorKey ? "border-[#3A2E3A]" : "border-white"}`}
              style={{ background: color.accentColor }}
              aria-label={color.colorKey}
            />
          );
        })}
      </div>
    </div>
  );
}

function ReadingModeOption({
  active,
  title,
  description,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-3 text-left text-sm ${active ? "border-[#A93F62] bg-[#FCE4EC]" : "border-[#F2DCE5] bg-white"}`}
    >
      <span className="block font-bold">{title}</span>
      <span className="text-xs text-[#8B7088]">{description}</span>
    </button>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[#FFF8F1] p-4">
      <p className="text-xs text-[#8B7088]">{label}</p>
      <p className="mt-1 text-xl font-black">{value}</p>
    </div>
  );
}

function TabButton({ active, icon, label, badge, onClick }: { active: boolean; icon: React.ReactNode; label: string; badge?: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`relative flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-xs ${active ? "bg-[#FCE4EC] font-bold text-[#A93F62]" : "text-[#8B7088]"}`}>
      {icon}
      {label}
      {!!badge && <Badge>{badge}</Badge>}
    </button>
  );
}

function IconButton({ label, children, onClick }: { label: string; children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-[#8B7088] shadow-sm" aria-label={label}>
      {children}
    </button>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-[#A93F62] px-1.5 py-0.5 text-[10px] font-bold text-white">{children}</span>;
}

function Drawer({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/20">
      <div className="absolute inset-y-0 right-0 w-full max-w-md overflow-auto bg-[#FFF8F1] p-4 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-black">{title}</h2>
          <IconButton label="닫기" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}

function getVerseRef(segment: Segment, start: number | null, end: number | null, manual: string) {
  if (manual.trim()) return manual.trim();
  if (!start) return "";
  const low = Math.min(start, end ?? start);
  const high = Math.max(start, end ?? start);
  return low === high ? `${segment.book_name} ${segment.chapter}:${low}` : `${segment.book_name} ${segment.chapter}:${low}-${high}`;
}

function isVerseSelected(verse: number, start: number | null, end: number | null) {
  if (!start) return false;
  const low = Math.min(start, end ?? start);
  const high = Math.max(start, end ?? start);
  return verse >= low && verse <= high;
}

function editText(current: string, save: (body: string) => void) {
  const next = window.prompt("수정할 내용을 입력해 주세요", current);
  if (next === null) return;
  if (!next.trim()) return;
  save(next.trim());
}

function confirmDelete(remove: () => void) {
  if (window.confirm("삭제할까요?")) remove();
}
