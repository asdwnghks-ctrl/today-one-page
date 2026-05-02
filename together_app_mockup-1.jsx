import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ─────────────────────────────────────────────────────────────
// 시안 v3 — 귀욤귀욤 파스텔 방향
//
// 방향 전환: 우아한 책 → 다정한 다이어리 / 교환일기
// 폰트: Pretendard (본문) + Cafe24Dongdong (제목)
//
// 색 팔레트:
//   희진 — 파스텔 핑크 메인 + 라벤더 + 하늘
//   주환 — 올리브 + 네이비 + 브라운
//   배경 — 따뜻한 크림+살짝 핑크 베이스
// ─────────────────────────────────────────────────────────────

const PEOPLE = [
  {
    id: "joohwan",
    name: "주환",
    accent: "#7A8456",        // 올리브
    accentDeep: "#3D4A5C",    // 네이비
    accentWarm: "#8B6F47",    // 브라운
    accentSoft: "#E8E5D4",    // 옅은 올리브
  },
  {
    id: "heejin",
    name: "희진",
    accent: "#F4B5C9",        // 파스텔 핑크 (메인)
    accentDeep: "#C8B5E8",    // 라벤더
    accentWarm: "#B5D5E8",    // 하늘
    accentSoft: "#FCE4EC",    // 옅은 핑크
  },
];

const HIGHLIGHT_COLORS = [
  { id: "pink", value: "#F4B5C9", label: "핑크" },
  { id: "lavender", value: "#C8B5E8", label: "라벤더" },
  { id: "sky", value: "#B5D5E8", label: "하늘" },
  { id: "olive", value: "#B8C49B", label: "올리브" },
];

const INITIAL_THREAD = [
  {
    id: 1,
    type: "highlight",
    userId: "heejin",
    verse: "창세기 1:27",
    note: "사람이 하느님의 형상대로 창조되었다는 게 새삼 와닿네 ✨",
    color: "#F4B5C9",
    timestamp: "어제 21:14",
    replies: [
      { id: 11, userId: "joohwan", body: "맞아 그 부분 나도 한참 머물렀어", timestamp: "어제 21:30" },
    ],
    reactions: [{ userId: "joohwan", emoji: "❤️" }],
  },
  {
    id: 2,
    type: "comment",
    userId: "joohwan",
    body: "오늘은 창조 부분 다시 읽으니까 처음 읽었을 때랑 좀 다르게 느껴지더라",
    timestamp: "오늘 08:22",
    replies: [],
    reactions: [],
  },
  {
    id: 3,
    type: "highlight",
    userId: "heejin",
    verse: "창세기 3:15",
    note: null,
    color: "#C8B5E8",
    timestamp: "오늘 08:45",
    replies: [],
    reactions: [],
  },
];

export default function App() {
  const [screen, setScreen] = useState("landing");
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const handleSelectPerson = (p) => {
    setSelected(p);
    setPin("");
    setError("");
    setScreen("login");
  };

  const handleSubmitPin = () => {
    if (pin.length < 4) {
      setError("비밀번호를 입력해 주세요");
      return;
    }
    setScreen("today");
  };

  return (
    <>
      {/* 폰트 임포트 */}
      <style>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
        @import url('https://fastly.jsdelivr.net/gh/projectnoonnu/noonfonts_two@1.0/Cafe24Dongdong.woff2') format('woff2');
        @font-face {
          font-family: 'Cafe24Dongdong';
          src: url('https://fastly.jsdelivr.net/gh/projectnoonnu/noonfonts_two@1.0/Cafe24Dongdong.woff') format('woff');
          font-weight: normal;
          font-style: normal;
        }
        .font-display { font-family: 'Cafe24Dongdong', 'Pretendard', sans-serif; }
        .font-body { font-family: 'Pretendard', -apple-system, sans-serif; }
      `}</style>

      <div
        className="min-h-screen w-full font-body"
        style={{
          background:
            "radial-gradient(ellipse at top right, #FFF0F3 0%, #FFF6EE 40%, #FAF0F5 100%)",
          color: "#3A2E3A",
        }}
      >
        {/* 작은 점 패턴 (귀여움 + 텍스처) */}
        <div
          className="fixed inset-0 pointer-events-none opacity-[0.4]"
          style={{
            backgroundImage:
              "radial-gradient(circle, #F4B5C9 1px, transparent 1px), radial-gradient(circle, #C8B5E8 1px, transparent 1px)",
            backgroundSize: "60px 60px, 80px 80px",
            backgroundPosition: "0 0, 30px 40px",
          }}
        />

        <div className="relative max-w-[480px] mx-auto px-6 py-10 min-h-screen flex flex-col">
          <AnimatePresence mode="wait">
            {screen === "landing" && (
              <Landing key="landing" onSelect={handleSelectPerson} />
            )}
            {screen === "login" && (
              <Login
                key="login"
                person={selected}
                pin={pin}
                setPin={setPin}
                error={error}
                onBack={() => setScreen("landing")}
                onSubmit={handleSubmitPin}
              />
            )}
            {screen === "today" && (
              <Today
                key="today"
                person={selected}
                onLogout={() => setScreen("landing")}
                onComplete={() => setScreen("segment")}
              />
            )}
            {screen === "segment" && (
              <SegmentDetail
                key="segment"
                person={selected}
                onBack={() => setScreen("today")}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// 랜딩
// ─────────────────────────────────────────────────────────────
function Landing({ onSelect }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="flex-1 flex flex-col"
    >
      <div className="pt-20 pb-12 text-center">
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.5, type: "spring" }}
          className="inline-flex gap-1 mb-6"
        >
          <Sparkle color="#F4B5C9" />
          <Sparkle color="#C8B5E8" delay={0.1} />
          <Sparkle color="#B5D5E8" delay={0.2} />
        </motion.div>

        <motion.h1
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="text-5xl leading-tight mb-3 font-display"
          style={{ color: "#3A2E3A" }}
        >
          오늘도<br />
          <span style={{ color: "#F4B5C9" }}>한 페이지</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="text-sm leading-relaxed"
          style={{ color: "#8B7088" }}
        >
          누구로 들어갈까요?
        </motion.p>
      </div>

      <div className="space-y-4 mb-auto">
        {PEOPLE.map((p, i) => (
          <motion.button
            key={p.id}
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.65 + i * 0.12, duration: 0.5 }}
            whileHover={{ y: -3, scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelect(p)}
            className="w-full text-left rounded-[28px] px-7 py-6 transition-shadow"
            style={{
              backgroundColor: "#FFFFFF",
              border: `2px solid ${p.accentSoft}`,
              boxShadow: `0 4px 16px ${p.accent}22`,
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <div
                  className="text-xs mb-1.5 flex items-center gap-1.5"
                  style={{ color: p.accent, fontWeight: 600 }}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: p.accent }}
                  />
                  {p.id === "joohwan" ? "주환님" : "희진님"}
                </div>
                <div
                  className="text-3xl font-display"
                  style={{ color: "#3A2E3A" }}
                >
                  {p.name}
                </div>
              </div>
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center"
                style={{ backgroundColor: p.accentSoft, color: p.accent }}
              >
                <ArrowRight />
              </div>
            </div>
          </motion.button>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.7 }}
        className="text-center pt-12 pb-6 text-xs flex items-center justify-center gap-2"
        style={{ color: "#A89AA0" }}
      >
        <span>🌷</span>
        <span>함께 읽은 47장</span>
        <span>🌷</span>
      </motion.div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// 비밀번호
// ─────────────────────────────────────────────────────────────
function Login({ person, pin, setPin, error, onBack, onSubmit }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.4 }}
      className="flex-1 flex flex-col"
    >
      <button
        onClick={onBack}
        className="text-sm pt-6 pb-12 self-start hover:opacity-70 transition-opacity"
        style={{ color: "#8B7088" }}
      >
        ← 돌아가기
      </button>

      <div className="flex-1 flex flex-col justify-center pb-32">
        <div className="mb-12">
          <div
            className="text-xs mb-2 flex items-center gap-1.5"
            style={{ color: person.accent, fontWeight: 600 }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: person.accent }}
            />
            {person.name}님
          </div>
          <h2 className="text-4xl mb-3 font-display" style={{ color: "#3A2E3A" }}>
            반가워요 🌸
          </h2>
          <p className="text-sm" style={{ color: "#8B7088" }}>
            비밀번호를 입력해 주세요
          </p>
        </div>

        <div
          className="rounded-3xl p-6"
          style={{
            backgroundColor: "#FFFFFF",
            border: `2px solid ${person.accentSoft}`,
            boxShadow: `0 4px 16px ${person.accent}1A`,
          }}
        >
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSubmit()}
            autoFocus
            placeholder="••••"
            className="w-full bg-transparent text-2xl tracking-[0.5em] py-3 outline-none text-center"
            style={{
              color: "#3A2E3A",
              fontFamily: "monospace",
            }}
          />
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xs mt-2 text-center"
              style={{ color: "#D67070" }}
            >
              {error}
            </motion.div>
          )}
        </div>

        <button
          onClick={onSubmit}
          className="mt-6 py-4 rounded-full text-sm transition-all hover:opacity-90 font-display"
          style={{
            backgroundColor: person.accent,
            color: "#FFFFFF",
            boxShadow: `0 4px 14px ${person.accent}55`,
          }}
        >
          들어가기
        </button>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// 오늘
// ─────────────────────────────────────────────────────────────
function Today({ person, onLogout, onComplete }) {
  const todayReading = { book: "창세기", chapter: 1, section: "모세의 기록" };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="flex-1 flex flex-col"
    >
      <div className="flex items-center justify-between pt-6 pb-10">
        <div>
          <div
            className="text-xs flex items-center gap-1.5"
            style={{ color: person.accent, fontWeight: 600 }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: person.accent }}
            />
            {person.name}님
          </div>
          <div className="text-xs mt-1.5" style={{ color: "#A89AA0" }}>
            5월 2일 토요일
          </div>
        </div>
        <button
          onClick={onLogout}
          className="text-xs opacity-70 hover:opacity-100"
          style={{ color: "#8B7088" }}
        >
          나가기
        </button>
      </div>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.6 }}
        className="mb-8"
      >
        <p className="text-sm leading-relaxed mb-2" style={{ color: "#8B7088" }}>
          {person.name}님, 오늘은
        </p>
        <h1 className="text-4xl leading-tight mb-2 font-display" style={{ color: "#3A2E3A" }}>
          <span style={{ color: person.accent }}>{todayReading.book}</span> {todayReading.chapter}장
        </h1>
        <p className="text-sm" style={{ color: "#8B7088" }}>
          을 읽어볼까요? ☕
        </p>
      </motion.div>

      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.6 }}
        className="rounded-[28px] p-7 mb-6"
        style={{
          backgroundColor: "#FFFFFF",
          border: "2px solid #FCE4EC",
          boxShadow: "0 4px 20px rgba(244, 181, 201, 0.15)",
        }}
      >
        <div
          className="text-xs mb-4 flex items-center gap-2"
          style={{ color: "#C8826A", fontWeight: 600 }}
        >
          <span style={{ color: "#D69870" }}>◆</span>
          {todayReading.section}
        </div>
        <div className="text-2xl mb-6 font-display" style={{ color: "#3A2E3A" }}>
          창세기 1장
        </div>
        <div className="space-y-3">
          <a
            href="https://www.jw.org/finder?wtlocale=KO&pub=nwt&srctype=wol&book=1&chapter=1"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-4 rounded-full text-center text-sm transition-all hover:opacity-90 block font-display"
            style={{
              backgroundColor: person.accent,
              color: "#FFFFFF",
              boxShadow: `0 4px 14px ${person.accent}55`,
            }}
          >
            본문 보러 가기 →
          </a>
          <button
            onClick={onComplete}
            className="w-full py-3.5 rounded-full text-sm transition-all hover:bg-black/5"
            style={{
              backgroundColor: "transparent",
              border: `2px dashed ${person.accentSoft}`,
              color: "#8B7088",
            }}
          >
            ✓ 다 읽었어요
          </button>
        </div>
      </motion.div>

      <div className="pt-4 pb-4 text-center text-xs flex items-center justify-center gap-2" style={{ color: "#A89AA0" }}>
        <span>✿</span>
        <span>천천히, 함께</span>
        <span>✿</span>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// 세그먼트 상세
// ─────────────────────────────────────────────────────────────
function SegmentDetail({ person, onBack }) {
  const [thread, setThread] = useState(INITIAL_THREAD);
  const [showHighlightForm, setShowHighlightForm] = useState(false);
  const [showCommentForm, setShowCommentForm] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);

  const addHighlight = (data) => {
    setThread([
      ...thread,
      { id: Date.now(), type: "highlight", userId: person.id, ...data, timestamp: "방금", replies: [], reactions: [] },
    ]);
    setShowHighlightForm(false);
  };

  const addComment = (body) => {
    setThread([
      ...thread,
      { id: Date.now(), type: "comment", userId: person.id, body, timestamp: "방금", replies: [], reactions: [] },
    ]);
    setShowCommentForm(false);
  };

  const addReply = (parentId, body) => {
    setThread(
      thread.map((item) =>
        item.id === parentId
          ? { ...item, replies: [...item.replies, { id: Date.now(), userId: person.id, body, timestamp: "방금" }] }
          : item
      )
    );
    setReplyingTo(null);
  };

  const toggleReaction = (itemId) => {
    setThread(
      thread.map((item) => {
        if (item.id !== itemId) return item;
        const has = item.reactions.some((r) => r.userId === person.id);
        return {
          ...item,
          reactions: has
            ? item.reactions.filter((r) => r.userId !== person.id)
            : [...item.reactions, { userId: person.id, emoji: "❤️" }],
        };
      })
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="flex-1 flex flex-col pb-10"
    >
      <div className="flex items-center justify-between pt-6 pb-8">
        <button onClick={onBack} className="text-sm hover:opacity-70 transition-opacity" style={{ color: "#8B7088" }}>
          ← 돌아가기
        </button>
        <div className="text-xs" style={{ color: "#A89AA0" }}>5월 2일</div>
      </div>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.5 }}
        className="mb-8"
      >
        <div className="text-xs mb-3 flex items-center gap-2" style={{ color: "#C8826A", fontWeight: 600 }}>
          <span style={{ color: "#D69870" }}>◆</span>
          모세의 기록
        </div>
        <h1 className="text-4xl mb-4 font-display" style={{ color: "#3A2E3A" }}>
          창세기 <span style={{ color: "#F4B5C9" }}>1장</span>
        </h1>

        <div className="flex items-center gap-3 text-xs flex-wrap">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ backgroundColor: "#E8E5D4" }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#7A8456" }} />
            <span style={{ color: "#7A8456", fontWeight: 600 }}>주환 ✓</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ backgroundColor: "#FCE4EC" }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#F4B5C9" }} />
            <span style={{ color: "#D67E9C", fontWeight: 600 }}>희진 ✓</span>
          </div>
          <a
            href="https://www.jw.org/finder?wtlocale=KO&pub=nwt&srctype=wol&book=1&chapter=1"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto underline hover:opacity-70 text-xs"
            style={{ color: "#8B7088" }}
          >
            본문 보기 →
          </a>
        </div>
      </motion.div>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.25, duration: 0.5 }}
        className="grid grid-cols-2 gap-3 mb-8"
      >
        <button
          onClick={() => { setShowHighlightForm(true); setShowCommentForm(false); }}
          className="py-3.5 rounded-full text-sm transition-all hover:opacity-90 font-display"
          style={{
            backgroundColor: person.accent,
            color: "#FFFFFF",
            boxShadow: `0 4px 12px ${person.accent}44`,
          }}
        >
          ✨ 구절 표시
        </button>
        <button
          onClick={() => { setShowCommentForm(true); setShowHighlightForm(false); }}
          className="py-3.5 rounded-full text-sm transition-all"
          style={{
            backgroundColor: "#FFFFFF",
            border: `2px solid ${person.accentSoft}`,
            color: person.accent,
          }}
        >
          💬 코멘트
        </button>
      </motion.div>

      <AnimatePresence>
        {showHighlightForm && (
          <HighlightForm person={person} onSubmit={addHighlight} onCancel={() => setShowHighlightForm(false)} />
        )}
        {showCommentForm && (
          <CommentForm
            person={person}
            placeholder="이 부분에 대한 생각을 자유롭게…"
            onSubmit={addComment}
            onCancel={() => setShowCommentForm(false)}
          />
        )}
      </AnimatePresence>

      <div className="mb-3 text-xs flex items-center gap-2" style={{ color: "#A89AA0" }}>
        <span>♡</span>
        <span style={{ fontWeight: 600 }}>둘의 대화</span>
      </div>

      <div className="space-y-4">
        {thread.map((item, i) => (
          <ThreadItem
            key={item.id}
            item={item}
            person={person}
            isReplying={replyingTo === item.id}
            onReply={() => setReplyingTo(item.id)}
            onCancelReply={() => setReplyingTo(null)}
            onSubmitReply={(body) => addReply(item.id, body)}
            onToggleReaction={() => toggleReaction(item.id)}
            delay={i * 0.05}
          />
        ))}
      </div>
    </motion.div>
  );
}

function ThreadItem({ item, person, isReplying, onReply, onCancelReply, onSubmitReply, onToggleReaction, delay }) {
  const author = PEOPLE.find((p) => p.id === item.userId);
  const isSelf = item.userId === person.id;
  const hasMyReaction = item.reactions.some((r) => r.userId === person.id);

  return (
    <motion.div
      initial={{ y: 12, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay, duration: 0.4 }}
      className="rounded-[24px]"
      style={{
        backgroundColor: "#FFFFFF",
        border: `2px solid ${author.accentSoft}`,
        boxShadow: `0 2px 12px ${author.accent}1A`,
      }}
    >
      <div className="p-5">
        <div className="flex items-baseline justify-between mb-3">
          <div className="flex items-baseline gap-2">
            <span className="w-2 h-2 rounded-full self-center" style={{ backgroundColor: author.accent, display: "inline-block" }} />
            <span className="text-sm font-display" style={{ color: author.accent }}>
              {author.name}
            </span>
            <span className="text-[10px]" style={{ color: "#A89AA0" }}>{item.timestamp}</span>
          </div>
          <span
            className="text-[10px] px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: item.type === "highlight" ? "#FCE4EC" : "#E8E5D4",
              color: item.type === "highlight" ? "#D67E9C" : "#7A8456",
              fontWeight: 600,
            }}
          >
            {item.type === "highlight" ? "✨ 구절" : "💬 코멘트"}
          </span>
        </div>

        {item.type === "highlight" ? (
          <div>
            <div
              className="inline-block px-3 py-1.5 rounded-full text-xs mb-3"
              style={{ backgroundColor: item.color + "55", color: "#3A2E3A", fontWeight: 600 }}
            >
              {item.verse}
            </div>
            {item.note ? (
              <p className="text-sm leading-relaxed" style={{ color: "#3A2E3A" }}>
                {item.note}
              </p>
            ) : (
              <p className="text-xs" style={{ color: "#A89AA0" }}>
                메모 없이 색깔만 ♡
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm leading-relaxed" style={{ color: "#3A2E3A" }}>
            {item.body}
          </p>
        )}

        <div className="flex items-center gap-4 mt-4 text-xs" style={{ color: "#8B7088" }}>
          <button
            onClick={onToggleReaction}
            className="flex items-center gap-1 hover:opacity-70 transition-opacity"
            style={{ color: hasMyReaction ? "#D67070" : "#8B7088" }}
          >
            <span>{hasMyReaction ? "❤️" : "♡"}</span>
            {item.reactions.length > 0 && <span>{item.reactions.length}</span>}
          </button>
          {!isSelf && (
            <button onClick={onReply} className="hover:opacity-70 transition-opacity">
              ↩ 답글
            </button>
          )}
        </div>
      </div>

      {item.replies.length > 0 && (
        <div className="px-5 pb-4 ml-4 space-y-3" style={{ borderLeft: `2px dashed ${author.accentSoft}` }}>
          {item.replies.map((reply) => {
            const replyAuthor = PEOPLE.find((p) => p.id === reply.userId);
            return (
              <div key={reply.id} className="pl-4 pt-3">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="w-1.5 h-1.5 rounded-full self-center" style={{ backgroundColor: replyAuthor.accent, display: "inline-block" }} />
                  <span className="text-xs font-display" style={{ color: replyAuthor.accent }}>
                    {replyAuthor.name}
                  </span>
                  <span className="text-[10px]" style={{ color: "#A89AA0" }}>{reply.timestamp}</span>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: "#3A2E3A" }}>
                  {reply.body}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {isReplying && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5">
              <ReplyInput person={person} onSubmit={onSubmitReply} onCancel={onCancelReply} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function HighlightForm({ person, onSubmit, onCancel }) {
  const [verse, setVerse] = useState("");
  const [note, setNote] = useState("");
  const [color, setColor] = useState(HIGHLIGHT_COLORS[0].value);

  const handleSubmit = () => {
    if (!verse.trim()) return;
    onSubmit({ verse: verse.trim(), note: note.trim() || null, color });
  };

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="overflow-hidden mb-6"
    >
      <div
        className="rounded-[24px] p-5"
        style={{
          backgroundColor: "#FFFFFF",
          border: `2px solid ${person.accentSoft}`,
          boxShadow: `0 4px 16px ${person.accent}1A`,
        }}
      >
        <div className="text-xs mb-3 font-display" style={{ color: person.accent }}>
          ✨ 구절 표시
        </div>
        <input
          value={verse}
          onChange={(e) => setVerse(e.target.value)}
          placeholder="예: 창세기 1:27"
          className="w-full bg-transparent text-base py-2 outline-none"
          style={{
            borderBottom: `1.5px solid ${person.accentSoft}`,
            color: "#3A2E3A",
          }}
        />
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="짧은 메모 (선택)"
          rows={2}
          className="w-full bg-transparent text-sm py-3 outline-none resize-none mt-2"
          style={{ color: "#3A2E3A" }}
        />
        <div className="flex items-center gap-2 mt-2 mb-4">
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c.id}
              onClick={() => setColor(c.value)}
              className="w-9 h-9 rounded-full transition-transform hover:scale-110 flex items-center justify-center"
              style={{
                backgroundColor: c.value,
                outline: color === c.value ? `3px solid ${c.value}` : "none",
                outlineOffset: "2px",
              }}
            >
              {color === c.value && <span style={{ color: "#FFFFFF" }}>✓</span>}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSubmit}
            className="flex-1 py-3 rounded-full text-sm font-display"
            style={{
              backgroundColor: person.accent,
              color: "#FFFFFF",
              boxShadow: `0 4px 12px ${person.accent}55`,
            }}
          >
            남기기
          </button>
          <button
            onClick={onCancel}
            className="px-5 py-3 rounded-full text-sm"
            style={{ color: "#8B7088" }}
          >
            취소
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function CommentForm({ person, placeholder, onSubmit, onCancel }) {
  const [body, setBody] = useState("");

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="overflow-hidden mb-6"
    >
      <div
        className="rounded-[24px] p-5"
        style={{
          backgroundColor: "#FFFFFF",
          border: `2px solid ${person.accentSoft}`,
          boxShadow: `0 4px 16px ${person.accent}1A`,
        }}
      >
        <div className="text-xs mb-3 font-display" style={{ color: person.accent }}>
          💬 코멘트
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={placeholder}
          rows={3}
          autoFocus
          className="w-full bg-transparent text-sm leading-relaxed outline-none resize-none"
          style={{ color: "#3A2E3A" }}
        />
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => body.trim() && onSubmit(body.trim())}
            className="flex-1 py-3 rounded-full text-sm font-display"
            style={{
              backgroundColor: person.accent,
              color: "#FFFFFF",
              boxShadow: `0 4px 12px ${person.accent}55`,
            }}
          >
            남기기
          </button>
          <button
            onClick={onCancel}
            className="px-5 py-3 rounded-full text-sm"
            style={{ color: "#8B7088" }}
          >
            취소
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function ReplyInput({ person, onSubmit, onCancel }) {
  const [body, setBody] = useState("");

  return (
    <div className="flex gap-2 items-end pt-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="답글…"
        rows={1}
        autoFocus
        className="flex-1 bg-transparent text-sm py-2 outline-none resize-none"
        style={{
          borderBottom: `1.5px solid ${person.accentSoft}`,
          color: "#3A2E3A",
        }}
      />
      <button
        onClick={() => body.trim() && onSubmit(body.trim())}
        className="px-4 py-2 rounded-full text-xs font-display"
        style={{
          backgroundColor: person.accent,
          color: "#FFFFFF",
        }}
      >
        보내기
      </button>
      <button onClick={onCancel} className="px-2 text-xs" style={{ color: "#8B7088" }}>
        취소
      </button>
    </div>
  );
}

function ArrowRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 8h10m0 0L9 4m4 4l-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Sparkle({ color, delay = 0 }) {
  return (
    <motion.svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      animate={{ scale: [1, 1.2, 1], rotate: [0, 15, 0] }}
      transition={{ duration: 2, delay, repeat: Infinity, repeatDelay: 1 }}
    >
      <path
        d="M10 2L11.5 8.5L18 10L11.5 11.5L10 18L8.5 11.5L2 10L8.5 8.5L10 2Z"
        fill={color}
      />
    </motion.svg>
  );
}
