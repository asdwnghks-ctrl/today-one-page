# 06. 기술 스택

## 결론

MVP는 **Vercel + Supabase만으로 충분하다.**

프론트엔드는 Next.js로 만들고, 배포는 Vercel에 올린다. 데이터베이스, 인증, 파일 저장, 실시간 채팅은 Supabase를 사용한다.

## 선택한 스택

- **Framework:** Next.js
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **UI Components:** Tailwind 기반 로컬 컴포넌트
- **Icons:** lucide-react
- **Backend:** Supabase
- **Database:** Supabase Postgres
- **Realtime:** Supabase Realtime (그룹별 스코핑된 상태 변경 브로드캐스트만, 채팅/presence는 제거됨)
- **Auth:** 초대코드 + 그룹별 개인 PIN(scrypt 해싱) + httpOnly cookie 2개(`top_group`, `top_profile`)
- **Deploy:** Vercel

> `together_app_mockup-1.jsx` 초기 목업에는 Framer Motion이 쓰였지만, 실제 구현(`app/page.tsx`)은 별도 애니메이션 라이브러리 없이 Tailwind transition만으로 처리했다. `package.json`에는 여전히 `framer-motion`이 있지만 코드에서 import하지 않는다.

## 왜 이 조합인가

개발자가 정식 개발 경험이 많지 않고, AI 코딩 도구의 도움을 많이 받을 예정이므로 다음 기준을 우선한다.

- 문서와 예제가 많다.
- AI가 잘 다루는 대중적인 스택이다.
- 무료 플랜으로 시작할 수 있다.
- 서버 운영이 거의 필요 없다.
- 실시간 채팅을 별도 서버 없이 만들 수 있다.
- 나중에 데이터가 쌓여도 Postgres 기반이라 오래 가져갈 수 있다.

## Supabase가 맡는 것

- 그룹/사용자 정보 (`groups`, `profiles`)
- 로그인/세션 관리 (초대코드 + PIN 검증)
- 책, segment, 읽기 계획표(`plan_days`), 절 수(`verse_counts`) seed 데이터
- 성서 segment 읽음 체크 상태
- 회차별 못 읽음 기록
- 회차별 선물 약속과 공개 상태
- 다음 책 지정/자동 선택 상태 (`book_proposals`)
- 하이라이트
- 장별 코멘트와 답글
- 그룹별 스코핑된 실시간 상태 변경 브로드캐스트
- 나중에 이미지가 필요해지면 Storage

현재 Supabase 상태:

- CLI: `npx supabase`
- Local config: `supabase/config.toml`
- Remote project: `today-one-page`
- Project ref: `ggezuvdhuaizerfmkevl`
- Project URL: `https://ggezuvdhuaizerfmkevl.supabase.co`
- Local link: 완료

Supabase CLI 자동 로그인은 비대화형 터미널에서 막히므로, Dashboard에서 access token을 만든 뒤 CLI에 전달해야 한다. `supabase db push`는 DB 비밀번호가 필요한데 저장해두지 않으므로, 마이그레이션은 Supabase Management API(`POST /v1/projects/{ref}/database/query`, personal access token 인증)로 직접 SQL을 실행해서 적용했다. 이 경로는 CLI가 막힐 때의 대안으로 계속 쓸 수 있다.

> **1000행 캡 주의:** 호스팅된 프로젝트는 PostgREST 응답을 클라이언트가 요청한 range와 무관하게 1000행으로 제한한다. `segments`(1,189행), `verse_counts`(1,189행)처럼 이 이상인 테이블은 반드시 `.range()`로 나눠서 가져와야 한다(`app/api/state/route.ts`의 `fetchAllRows` 참고). 새 테이블이 1000행을 넘어갈 가능성이 있으면 처음부터 페이지네이션을 고려한다.

## Vercel이 맡는 것

- Next.js 앱 배포
- 무료 도메인 제공
- 환경 변수 관리
- 자동 배포

현재 Vercel 프로젝트:

- Project: `today-one-page`
- GitHub: `https://github.com/asdwnghks-ctrl/today-one-page`
- Root Directory: `.`
- Node.js: `24.x`
- Framework: `nextjs` (`vercel.json`)

현재 저장소에는 실제 Next.js 앱이 있고, `vercel.json`에서 Next.js 빌드와 `npm run build`를 사용하도록 설정되어 있다.

## 자동 배포 흐름

로컬에서 커밋하면 Git hook이 자동으로 GitHub에 push한다. Vercel은 GitHub 저장소와 연결되어 있으므로, `main` 브랜치에 push가 들어가면 자동 배포를 실행한다.

흐름:

```text
local commit -> auto git push -> GitHub main -> Vercel deployment
```

주의: 배포 결과가 DB 상태에 의존하므로 Vercel 환경 변수와 Supabase migration 상태를 함께 확인해야 한다.

## Render 사용 여부

현재 API 규모에서는 Render를 별도로 붙일 필요가 크지 않다.

지금 앱의 서버 작업은 Next.js Route Handler와 Supabase로 충분하다.

- 로그인 / 그룹 생성 / 초대코드 참여
- 상태 조회
- 읽음 체크
- 코멘트/하이라이트/반응 저장
- 다음 책 지정/자동 선택
- 앱 안 알림 읽음 처리

Render가 유용해질 수 있는 경우:

- Vercel 요청 시간 안에 처리하기 어려운 긴 백그라운드 작업이 생길 때
- 정교한 cron/worker가 필요할 때
- 대용량 파일 처리, 이미지 변환, 외부 API polling 같은 서버 상주 작업이 필요할 때
- Supabase Edge Function이나 Vercel Cron보다 별도 서버 운영이 더 단순해질 때

현재는 인프라를 늘리기보다 Vercel + Supabase 조합을 유지한다.

## 실시간 방식 (채팅 제거 이후)

실시간 채팅 기능은 완전히 제거했다. `messages`/`message_reads` 테이블은 스키마상 남아있지만(마이그레이션에서 일부러 drop하지 않음) 앱은 더 이상 쓰지 않는다. 기존 대화 내용은 `docs/chat-archive.md`로 텍스트 내보내기해서 보존했다.

지금 Supabase Realtime은 훨씬 단순한 용도로만 쓰인다: 그룹별로 스코핑된 채널(`group-${groupId}-live`)에서 "누군가 상태를 바꿨다"는 `broadcast` 이벤트만 주고받고, 받는 쪽은 전체 상태를 다시 fetch한다. 채팅 전용이던 presence(접속 중 표시)도 함께 제거했다 — 채널 이름이 그룹별로 나뉘어 있어서 다른 그룹의 브로드캐스트가 새지 않는 것만 신경 쓰면 된다.

## 인증 방향

회원가입은 만들지 않는다. 화면은 초대코드 입력 → 이름 선택 → 비밀번호 입력처럼 보이게 만든다.

### 현재 선택: 초대코드 + 그룹별 개인 PIN + httpOnly cookie 2개

- 그룹을 만들거나 참여할 때 각자 자기 PIN을 직접 정한다(그룹 공용 PIN 없음).
- `lib/pin.ts`가 Node 내장 `crypto.scrypt`로 PIN을 해싱한다(`"scrypt:salt:hash"` 형식). 새 의존성 추가 없이 처리했다.
- 로그인 성공 시 `top_group`(그룹 id) + `top_profile`(slug) 두 개의 httpOnly cookie를 설정한다.
- 브라우저는 Supabase service role key를 직접 갖지 않는다.

최초 사용자였던 주환/희진은 마이그레이션 시 기존 공유 PIN(`APP_SHARED_PIN`)이 각자의 초기 개인 PIN으로 해싱되어 들어갔다(로그인 경험 유지, `scripts/migrate-pins.ts`). 이후 `APP_SHARED_PIN`은 런타임에서 더 이상 읽지 않는다.

사용자는 단순한 초대코드+PIN 로그인처럼 느낀다. 나중에 보안을 더 엄격하게 가져가야 하면 Supabase Auth로 전환할 수 있다.

## 지금 당장 필요한 외부 도구

- GitHub: 코드 저장소
- Vercel: 배포
- Supabase: DB, Auth, Realtime

선택적으로 나중에 필요한 것:

- Sentry: 오류 추적
- Resend: 이메일 알림
- Vercel Analytics: 사용 흐름 확인

처음에는 선택 도구를 붙이지 않는다. 앱이 실제로 쓰이기 시작한 뒤 필요가 생기면 추가한다.

## 피할 것

- 별도 Node 서버 운영
- 복잡한 WebSocket 서버 직접 구현
- Docker 기반 운영
- 너무 새로운 프레임워크
- 처음부터 과한 상태관리 라이브러리
- MVP부터 푸시 알림, 이미지 업로드, 음성 메시지까지 넣기
