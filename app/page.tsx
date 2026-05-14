"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  Bell,
  BookOpen,
  Check,
  ChevronLeft,
  Heart,
  Home,
  Library,
  LoaderCircle,
  MessageCircle,
  Pencil,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type {
  AppState,
  Book,
  BookGift,
  Highlight,
  Message,
  Profile,
  Reply,
  Segment,
  SegmentComment,
} from "@/lib/types";
import { supabaseBrowser } from "@/lib/supabase-browser";

type Tab = "today" | "reading" | "chat" | "records";

const FALLBACK_PEOPLE = [
  {
    slug: "joohwan",
    display_name: "주환",
    accent_color: "#5F6F3E",
    accent_deep: "#48552F",
    accent_soft: "#E8E5D4",
  },
  {
    slug: "heejin",
    display_name: "희진",
    accent_color: "#A93F62",
    accent_deep: "#8F2F50",
    accent_soft: "#FCE4EC",
  },
];

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
  const [selectedBookId, setSelectedBookId] = useState<string>("ecc");
  const [chatOpen, setChatOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [onlineProfileIds, setOnlineProfileIds] = useState<string[]>([]);
  const [realtimeStatus, setRealtimeStatus] = useState("CLOSED");
  const [actionPending, setActionPending] = useState(false);
  const broadcastChangeRef = useRef<(() => void) | null>(null);
  const actionPendingRef = useRef(false);
  const notificationMarkingRef = useRef(false);

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
    const channel = supabaseBrowser.channel("today-one-page-live", {
      config: {
        presence: {
          key: state.me.id,
        },
      },
    });

    const scheduleRefresh = () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        fetchState().catch(() => undefined);
      }, 180);
    };

    channel
      .on("broadcast", { event: "state_changed" }, scheduleRefresh)
      .on("presence", { event: "sync" }, () => {
        const presence = channel.presenceState() as Record<string, Array<{ profileId?: string }>>;
        const ids = Object.values(presence)
          .flat()
          .map((item) => item.profileId)
          .filter((id): id is string => Boolean(id));
        setOnlineProfileIds(Array.from(new Set(ids)));
      })
      .subscribe((status) => {
        setRealtimeStatus(status);
        if (status === "SUBSCRIBED") {
          void channel.track({
            profileId: state.me?.id,
            displayName: state.me?.display_name,
            onlineAt: new Date().toISOString(),
          });
        }
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
  }, [fetchState, state?.me?.display_name, state?.me?.id]);

  const me = state?.me ?? null;
  const profiles = state?.profiles?.length ? state.profiles : (FALLBACK_PEOPLE as Profile[]);
  const other = state?.profiles.find((profile) => profile.id !== me?.id) ?? null;
  const currentSegment = state?.segments.find((segment) => segment.id === state.progress?.current_segment_id) ?? null;
  const activeSegment = state?.segments.find((segment) => segment.id === selectedSegmentId) ?? currentSegment;
  const currentBook = state?.books.find((book) => book.id === state.progress?.current_book_id) ?? null;
  const unreadCount = state?.notifications.filter((item) => !item.read_at).length ?? 0;
  const unreadMessages = useMemo(() => {
    if (!state?.me) return 0;
    const read = new Set(state.messageReads.filter((item) => item.profile_id === state.me?.id).map((item) => item.message_id));
    return state.messages.filter((message) => message.sender_id !== state.me?.id && !message.deleted_at && !read.has(message.id)).length;
  }, [state]);

  const quietlyMarkMessagesRead = useCallback(async () => {
    if (!state?.me || notificationMarkingRef.current) return;
    const read = new Set(state.messageReads.filter((item) => item.profile_id === state.me?.id).map((item) => item.message_id));
    const hasUnreadMessages = state.messages.some((message) => message.sender_id !== state.me?.id && !message.deleted_at && !read.has(message.id));
    const hasUnreadMessageNotifications = state.notifications.some((item) => !item.read_at && item.type === "message");
    if (!hasUnreadMessages && !hasUnreadMessageNotifications) return;

    notificationMarkingRef.current = true;
    const readAt = new Date().toISOString();
    setState((prev) =>
      prev
        ? {
            ...prev,
            messageReads: [
              ...prev.messageReads,
              ...prev.messages
                .filter((message) => message.sender_id !== prev.me?.id && !message.deleted_at)
                .filter((message) => !prev.messageReads.some((item) => item.profile_id === prev.me?.id && item.message_id === message.id))
                .map((message) => ({ id: `local-${message.id}`, message_id: message.id, profile_id: prev.me?.id ?? "", read_at: readAt })),
            ],
            notifications: prev.notifications.map((item) =>
              !item.read_at && item.type === "message" ? { ...item, read_at: readAt } : item,
            ),
          }
        : prev,
    );
    try {
      await apiAction("mark_messages_read");
      await fetchState();
    } catch {
      fetchState().catch(() => undefined);
    } finally {
      notificationMarkingRef.current = false;
    }
  }, [fetchState, state?.me, state?.messageReads, state?.messages, state?.notifications]);

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

  useEffect(() => {
    if (tab !== "chat" && !chatOpen) return;
    void quietlyMarkMessagesRead();
  }, [chatOpen, quietlyMarkMessagesRead, tab]);

  async function runWithPending(action: () => Promise<void>) {
    if (actionPendingRef.current) return;
    actionPendingRef.current = true;
    setActionPending(true);
    try {
      await action();
    } finally {
      actionPendingRef.current = false;
      setActionPending(false);
    }
  }

  async function refreshAfter(action: () => Promise<unknown>) {
    await runWithPending(async () => {
      setError("");
      try {
        await action();
        await fetchState();
        broadcastChangeRef.current?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "요청을 처리하지 못했어요");
      }
    });
  }

  async function refreshAfterSilently(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
      await fetchState();
      broadcastChangeRef.current?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "요청을 처리하지 못했어요");
    }
  }

  async function sendChatMessage(body: string) {
    setError("");
    try {
      await apiAction("send_message", { body });
      await fetchState();
      broadcastChangeRef.current?.();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "메시지를 보내지 못했어요");
      return false;
    }
  }

  async function login(slug: string) {
    await runWithPending(async () => {
      setError("");
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, pin }),
      });
      const json = await response.json();
      if (!response.ok) {
        setError(json.error || "비밀번호를 다시 확인해 주세요");
        return;
      }
      setPin("");
      await fetchState();
    });
  }

  async function logout() {
    await runWithPending(async () => {
      await fetch("/api/logout", { method: "POST" });
      setState((prev) => (prev ? { ...prev, me: null } : prev));
      setTab("today");
      setSelectedSlug(null);
    });
  }

  if (loading) {
    return (
      <main className="relative z-10 flex min-h-screen items-center justify-center px-6">
        <div className="card rounded-3xl px-6 py-5 text-sm text-[#8B7088]">천천히 준비하는 중...</div>
      </main>
    );
  }

  if (!me) {
    return (
      <main className="relative z-10 mx-auto flex min-h-screen max-w-[480px] flex-col px-6 py-10">
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
          <p className="mt-4 text-sm text-[#8B7088]">누구로 들어갈까요?</p>
        </div>

        <div className="space-y-3">
          {profiles.map((person) => (
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
        </div>

        {selectedSlug && (
          <div className="card mt-5 rounded-2xl p-4">
            <label className="text-xs font-bold text-[#8B7088]">비밀번호</label>
            <div className="mt-2 flex gap-2">
              <input
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void login(selectedSlug);
                }}
                className="focus-ring min-w-0 flex-1 rounded-xl border border-[#F2DCE5] bg-white px-4 py-3 text-base"
                inputMode="numeric"
                type="password"
                autoFocus
              />
              <button
                onClick={() => void login(selectedSlug)}
                className="focus-ring rounded-xl px-4 py-3 text-sm font-bold text-white"
                style={{ background: profiles.find((person) => person.slug === selectedSlug)?.accent_color ?? "#A93F62" }}
              >
                확인
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
      {actionPending && <PendingOverlay />}
      <header className="mb-5 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold" style={{ color: me.accent_color }}>
            <span className="h-2 w-2 rounded-full" style={{ background: me.accent_color }} />
            {me.display_name}님
          </div>
          <h1 className="mt-1 text-2xl font-black">오늘도 한 페이지</h1>
        </div>
        <div className="flex items-center gap-2">
          <IconButton label="알림" onClick={() => setNotificationsOpen(true)}>
            <Bell size={18} />
            {unreadCount > 0 && <Badge>{unreadCount}</Badge>}
          </IconButton>
          <IconButton label="채팅" onClick={() => setChatOpen(true)}>
            <MessageCircle size={18} />
            {unreadMessages > 0 && <Badge>{unreadMessages}</Badge>}
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
              other={other}
              segment={currentSegment}
              book={currentBook}
              onRead={() => refreshAfter(() => apiAction("check_read", { segmentId: currentSegment.id }))}
              onOpenSegment={(id) => {
                setSelectedSegmentId(id);
                setTab("reading");
              }}
              action={refreshAfter}
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
              action={refreshAfter}
            />
          )}
          {tab === "chat" && <ChatView state={appState} me={me} action={refreshAfterSilently} onSendMessage={sendChatMessage} onlineProfileIds={onlineProfileIds} />}
          {tab === "records" && (
            <RecordsView
              state={appState}
              selectedBookId={selectedBookId}
              setSelectedBookId={setSelectedBookId}
              selectedSegmentId={selectedSegmentId}
              setSelectedSegmentId={setSelectedSegmentId}
              me={me}
              action={refreshAfter}
            />
          )}
        </section>

        <aside className="hidden lg:block">
          <ProposalCard state={appState} me={me} action={refreshAfter} />
        </aside>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[#F2DCE5] bg-[#FFF8F1]/95 px-3 py-2 backdrop-blur">
        <div className="mx-auto grid max-w-[520px] grid-cols-4 gap-2">
          <TabButton active={tab === "today"} icon={<Home size={18} />} label="오늘" onClick={() => setTab("today")} />
          <TabButton active={tab === "reading"} icon={<BookOpen size={18} />} label="코멘트" onClick={() => setTab("reading")} />
          <TabButton active={tab === "chat"} icon={<MessageCircle size={18} />} label="채팅" badge={unreadMessages} onClick={() => setTab("chat")} />
          <TabButton active={tab === "records"} icon={<Library size={18} />} label="기록" onClick={() => setTab("records")} />
        </div>
      </nav>

      {chatOpen && (
        <Drawer title="둘만의 대화" onClose={() => setChatOpen(false)}>
          <ChatView state={appState} me={me} action={refreshAfterSilently} onSendMessage={sendChatMessage} onlineProfileIds={onlineProfileIds} compact />
        </Drawer>
      )}

      {notificationsOpen && (
        <Drawer title="알림" onClose={() => setNotificationsOpen(false)}>
          <NotificationsView
            state={appState}
            action={refreshAfter}
            onNavigate={(targetType, targetId) => {
              if (targetType === "segment" && targetId) {
                setSelectedSegmentId(targetId);
                setTab("records");
              }
              if (targetType === "message") setTab("chat");
              setNotificationsOpen(false);
            }}
          />
        </Drawer>
      )}
      <div className="fixed bottom-[78px] right-4 z-20 rounded-full bg-white/80 px-3 py-1 text-[11px] text-[#8B7088] shadow-sm">
        Realtime {realtimeStatus === "SUBSCRIBED" ? "연결됨" : "연결 중"}
      </div>
    </main>
  );
}

function MissScoreboard({ state, me, other }: { state: AppState; me: Profile; other: Profile | null }) {
  const myCount = state.missCounts[me.id] ?? 0;
  const otherCount = other ? (state.missCounts[other.id] ?? 0) : 0;
  if (myCount === 0 && otherCount === 0) return null;

  const myLosing = myCount > otherCount;
  const otherLosing = other && otherCount > myCount;

  return (
    <div className="card rounded-3xl p-4">
      <h3 className="mb-3 text-sm font-black text-[#8B7088]">이번 책 못 읽기 점수</h3>
      <div className="flex items-center justify-around gap-4">
        <div className={`text-center ${myLosing ? "opacity-100" : "opacity-60"}`}>
          <p className="text-xs font-bold" style={{ color: me.accent_color }}>{me.display_name}</p>
          <p className="mt-1 text-2xl font-black">{myCount}<span className="text-sm">번</span></p>
          {myLosing && <p className="text-xs text-[#A93F62]">😅 지고 있어요</p>}
        </div>
        <div className="text-sm text-[#C8B5E8]">vs</div>
        {other && (
          <div className={`text-center ${otherLosing ? "opacity-100" : "opacity-60"}`}>
            <p className="text-xs font-bold" style={{ color: other.accent_color }}>{other.display_name}</p>
            <p className="mt-1 text-2xl font-black">{otherCount}<span className="text-sm">번</span></p>
            {otherLosing && <p className="text-xs text-[#A93F62]">😅 지고 있어요</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function PendingOverlay() {
  return (
    <>
      <div className="fixed inset-0 z-50 cursor-wait bg-white/10" aria-hidden="true" />
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-24 left-1/2 z-50 inline-flex -translate-x-1/2 items-center gap-2 rounded-full border border-[#F2DCE5] bg-white px-4 py-2 text-sm font-bold text-[#8B7088] shadow-lg"
      >
        <LoaderCircle className="animate-spin text-[#A93F62]" size={16} />
        처리 중...
      </div>
    </>
  );
}

function GiftSetupCard({ state, me, other, action }: { state: AppState; me: Profile; other: Profile | null; action: (fn: () => Promise<unknown>) => Promise<void> }) {
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
            <p className="mt-1 text-xs text-[#A89AA0]">{other?.display_name}은(는) 못 봐요</p>
          </div>
          <button onClick={() => { setGiftText(myGift.gift_description); setEditing(true); }} className="text-xs text-[#8B7088] underline">수정</button>
        </div>
        {partnerHasGift && <p className="mt-3 text-xs text-[#A93F62]">상대방도 선물을 설정했어요 🤫</p>}
      </div>
    );
  }

  if (!editing && !myGift) {
    return (
      <div className="card rounded-3xl p-4">
        <p className="text-sm font-black">선물 설정 🎁</p>
        <p className="mt-1 text-xs text-[#8B7088]">이번 책에서 지면 줄 선물을 몰래 정해봐요. {other?.display_name}은(는) 책이 끝날 때까지 못 봐요.</p>
        {partnerHasGift && <p className="mt-2 text-xs text-[#A93F62]">상대방이 이미 선물을 설정했어요 🤫</p>}
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
          onClick={() => action(async () => { await apiAction("set_gift", { giftDescription: giftText }); setEditing(false); setGiftText(""); })}
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
  other,
  segment,
  book,
  onRead,
  onOpenSegment,
  action,
}: {
  state: AppState;
  me: Profile;
  other: Profile | null;
  segment: Segment;
  book: Book | null;
  onRead: () => void;
  onOpenSegment: (id: string) => void;
  action: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const myRead = state.readingStates.some((item) => item.segment_id === segment.id && item.profile_id === me.id);
  const otherRead = other ? state.readingStates.some((item) => item.segment_id === segment.id && item.profile_id === other.id) : false;
  const bothRead = myRead && otherRead;
  const comments = state.comments.filter((item) => item.segment_id === segment.id);
  const highlights = state.highlights.filter((item) => item.segment_id === segment.id);

  return (
    <div className="space-y-5">
      <RevealedGiftsCard state={state} />

      <div className="card rounded-3xl p-6">
        <p className="text-sm text-[#8B7088]">오늘은</p>
        <h2 className="mt-2 text-4xl font-black">
          <span style={{ color: me.accent_color }}>{segment.book_name}</span> {segment.chapter}장
        </h2>
        <p className="mt-2 text-sm text-[#8B7088]">
          {bothRead ? "오늘은 둘 다 읽었어요. 새벽 2시에 다음 범위가 열려요." : "여유 있을 때 천천히, 함께."}
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <a
            href={segment.jw_url ?? undefined}
            target="_blank"
            rel="noreferrer"
            className="rounded-2xl px-4 py-4 text-center text-sm font-bold text-white"
            style={{ background: me.accent_color }}
          >
            연구용 본문 보기
          </a>
          <button
            disabled={myRead}
            onClick={onRead}
            className="rounded-2xl border border-dashed px-4 py-4 text-sm font-bold disabled:cursor-default disabled:opacity-60"
            style={{ borderColor: me.accent_soft, color: me.accent_color }}
          >
            {myRead ? "읽음 체크 완료" : "다 읽었어요"}
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <ReadChip profile={me} done={myRead} />
        {other && <ReadChip profile={other} done={otherRead} />}
      </div>

      <MissScoreboard state={state} me={me} other={other} />
      <GiftSetupCard state={state} me={me} other={other} action={action} />

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

      {state.progress?.status === "choosing_book" && <ProposalCard state={state} me={me} action={action} />}
      {book && <p className="text-center text-xs text-[#A89AA0]">지금 함께 읽는 책: {book.name}</p>}
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
}: {
  state: AppState;
  me: Profile;
  activeSegment: Segment;
  selectedBookId: string;
  setSelectedBookId: (id: string) => void;
  setSelectedSegmentId: (id: string) => void;
  action: (fn: () => Promise<unknown>) => Promise<void>;
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
        <ProposalCard state={state} me={me} action={action} compact />
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
            onClick={() =>
              action(async () => {
                await apiAction("add_comment", { segmentId: segment.id, body: comment });
                setComment("");
              })
            }
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
            onClick={() =>
              action(async () => {
                await apiAction("add_highlight", {
                  segmentId: segment.id,
                  verseRef: selectedVerseRef,
                  startVerse,
                  endVerse: endVerse ?? startVerse,
                  note,
                  color,
                });
                setNote("");
                setStartVerse(null);
                setEndVerse(null);
                setManualVerse("");
              })
            }
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
        <button onClick={onReact} className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs ${reacted ? "bg-[#FCE4EC] text-[#A93F62]" : "bg-white text-[#8B7088]"}`}>
          <Heart size={14} /> {reactions}
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

function ChatView({
  state,
  me,
  action,
  onSendMessage,
  onlineProfileIds = [],
  compact,
}: {
  state: AppState;
  me: Profile;
  action?: (fn: () => Promise<unknown>) => Promise<void>;
  onSendMessage?: (body: string) => Promise<boolean>;
  onlineProfileIds?: string[];
  compact?: boolean;
}) {
  const [message, setMessage] = useState("");
  const [pendingMessages, setPendingMessages] = useState<Message[]>([]);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const submittedMessageKeysRef = useRef(new Set<string>());
  const composingRef = useRef(false);
  const visibleMessages = useMemo(() => [...state.messages.filter((item) => !item.deleted_at), ...pendingMessages], [pendingMessages, state.messages]);
  const latestMessageId = visibleMessages[visibleMessages.length - 1]?.id;

  function scrollMessagesToLatest() {
    const messagesEl = messagesRef.current;
    if (!messagesEl) return;
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function sendCurrentMessage() {
    if (!onSendMessage || composingRef.current) return;
    const body = message.trim();
    if (!body) return;
    const dedupeKey = `${me.id}:${body}`;
    if (submittedMessageKeysRef.current.has(dedupeKey)) return;

    const optimisticMessage: Message = {
      id: `pending-${Date.now()}`,
      sender_id: me.id,
      body,
      created_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
    };

    submittedMessageKeysRef.current.add(dedupeKey);
    flushSync(() => {
      setMessage("");
      setPendingMessages((prev) => [...prev, optimisticMessage]);
    });
    scrollMessagesToLatest();
    window.requestAnimationFrame(scrollMessagesToLatest);

    const sent = await onSendMessage(body);
    setPendingMessages((prev) => prev.filter((item) => item.id !== optimisticMessage.id));
    if (!sent) {
      setMessage((current) => current || body);
    }
    submittedMessageKeysRef.current.delete(dedupeKey);
  }

  useLayoutEffect(() => {
    scrollMessagesToLatest();
    const frame = window.requestAnimationFrame(scrollMessagesToLatest);
    return () => window.cancelAnimationFrame(frame);
  }, [latestMessageId, visibleMessages.length, compact]);

  const other = state.profiles.find((profile) => profile.id !== me.id);
  const otherOnline = other ? onlineProfileIds.includes(other.id) : false;
  const readByOther = new Set(
    state.messageReads
      .filter((item) => item.profile_id !== me.id)
      .map((item) => item.message_id),
  );
  return (
    <div className={`card flex ${compact ? "h-[calc(100vh-120px)]" : "h-[calc(100vh-190px)] min-h-[520px]"} min-h-0 flex-col rounded-3xl`}>
      <div className="border-b border-[#F2DCE5] p-4">
        <h2 className="text-lg font-black">둘만의 대화</h2>
        <p className="text-xs text-[#8B7088]">
          {otherOnline ? `${other?.display_name ?? "상대"}와 함께 있는 중` : "답장은 천천히 와도 괜찮아요."}
        </p>
      </div>
      <div ref={messagesRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
        {visibleMessages.map((item) => {
          const mine = item.sender_id === me.id;
          const author = state.profiles.find((profile) => profile.id === item.sender_id);
          const pending = item.id.startsWith("pending-");
          return (
            <div key={item.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm ${mine ? "text-white" : "bg-white"}`} style={mine ? { background: me.accent_color } : { border: `1px solid ${author?.accent_soft ?? "#F2DCE5"}` }}>
                {!mine && <div className="mb-1 text-xs font-bold" style={{ color: author?.accent_color }}>{author?.display_name}</div>}
                <p className="whitespace-pre-wrap">{item.body}</p>
                <div className={`mt-1 flex items-center justify-between gap-3 text-[11px] ${mine ? "text-white/75" : "text-[#A89AA0]"}`}>
                  <span>{shortDate(item.created_at)} {!pending && item.edited_at ? "· 수정됨" : ""}</span>
                  {mine && !pending && readByOther.has(item.id) && <span>읽음</span>}
                  {mine && !pending && action && <MessageTools item={item} action={action} />}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void sendCurrentMessage();
        }}
        className="flex gap-2 border-t border-[#F2DCE5] p-3"
      >
        <input
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && event.nativeEvent.isComposing) {
              event.preventDefault();
            }
          }}
          placeholder="메시지"
          className="min-w-0 flex-1 rounded-2xl border border-[#F2DCE5] px-4 py-3"
        />
        <button
          disabled={!message.trim() || !onSendMessage}
          className={`rounded-2xl px-4 transition ${message.trim() && onSendMessage ? "text-white" : "bg-white text-[#C8B5BF]"} disabled:cursor-default`}
          style={message.trim() && onSendMessage ? { background: me.accent_color } : undefined}
          aria-label="보내기"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}

function MessageTools({ item, action }: { item: Message; action: (fn: () => Promise<unknown>) => Promise<void> }) {
  return (
    <span className="ml-2 inline-flex gap-2">
      <button type="button" onClick={() => editText(item.body, (body) => action(() => apiAction("update_message", { id: item.id, body })))} className="underline">
        수정
      </button>
      <button type="button" onClick={() => confirmDelete(() => action(() => apiAction("delete_message", { id: item.id })))} className="underline">
        삭제
      </button>
    </span>
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

function ProposalCard({ state, me, action, compact }: { state: AppState; me: Profile; action: (fn: () => Promise<unknown>) => Promise<void>; compact?: boolean }) {
  const [bookId, setBookId] = useState("ecc");
  const [note, setNote] = useState("");
  const pending = state.proposals.find((item) => item.status === "pending");
  const accepted = state.proposals.find((item) => item.status === "accepted");
  const pendingBook = state.books.find((book) => book.id === pending?.proposed_book_id);
  const acceptedBook = state.books.find((book) => book.id === accepted?.proposed_book_id);
  const proposedByMe = pending?.proposed_by === me.id;
  return (
    <div className={`card mt-4 rounded-3xl p-4 ${compact ? "" : "sticky top-5"}`}>
      <h3 className="font-black">다음 책</h3>
      {pending ? (
        <div className="mt-3 rounded-2xl bg-[#FFF8F1] p-3 text-sm">
          <p className="font-bold">{pendingBook?.name} 제안 중</p>
          <p className="mt-1 text-[#8B7088]">{pending.note || "같이 읽어볼까요?"}</p>
          {proposedByMe ? (
            <p className="mt-3 text-xs text-[#A89AA0]">상대의 수락을 기다리는 중이에요.</p>
          ) : (
            <button onClick={() => action(() => apiAction("accept_proposal", { id: pending.id }))} className="mt-3 rounded-xl px-3 py-2 text-sm font-bold text-white" style={{ background: me.accent_color }}>
              수락하기
            </button>
          )}
        </div>
      ) : accepted ? (
        <div className="mt-3 rounded-2xl bg-[#FFF8F1] p-3 text-sm">
          <p className="font-bold">{acceptedBook?.name} 확정</p>
          <p className="mt-1 text-[#8B7088]">지금 읽는 책이 끝난 다음 날 1장이 열려요.</p>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <select value={bookId} onChange={(event) => setBookId(event.target.value)} className="w-full rounded-xl border border-[#F2DCE5] bg-white px-3 py-2 text-sm">
            {state.books.map((book) => (
              <option key={book.id} value={book.id}>{book.name}</option>
            ))}
          </select>
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="짧은 제안 메모" className="w-full rounded-xl border border-[#F2DCE5] px-3 py-2 text-sm" />
          <button onClick={() => action(() => apiAction("propose_book", { bookId, note }))} className="w-full rounded-xl px-3 py-2 text-sm font-bold text-white" style={{ background: me.accent_color }}>
            제안하기
          </button>
        </div>
      )}
    </div>
  );
}

function NotificationsView({ state, action, onNavigate }: { state: AppState; action: (fn: () => Promise<unknown>) => Promise<void>; onNavigate: (targetType: string | null, targetId: string | null) => void }) {
  return (
    <div className="space-y-3">
      <button onClick={() => action(() => apiAction("mark_all_notifications_read"))} className="rounded-xl bg-white px-3 py-2 text-sm font-bold text-[#8B7088]">
        모두 읽음
      </button>
      {state.notifications.map((item) => (
        <button
          key={item.id}
          onClick={() =>
            action(async () => {
              await apiAction("mark_notification_read", { id: item.id });
              onNavigate(item.target_type, item.target_id);
            })
          }
          className={`block w-full rounded-2xl p-4 text-left ${item.read_at ? "bg-white/70" : "bg-[#FCE4EC]"}`}
        >
          <p className="font-bold">{item.title}</p>
          {item.body && <p className="mt-1 text-sm text-[#8B7088]">{item.body}</p>}
          <p className="mt-2 text-xs text-[#A89AA0]">{shortDate(item.created_at)}</p>
        </button>
      ))}
      {state.notifications.length === 0 && <p className="rounded-2xl bg-white p-4 text-center text-sm text-[#8B7088]">새 알림이 없어요.</p>}
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
