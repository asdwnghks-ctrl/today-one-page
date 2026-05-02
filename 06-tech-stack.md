# 06. 기술 스택

## 결론

MVP는 **Vercel + Supabase만으로 충분하다.**

프론트엔드는 Next.js로 만들고, 배포는 Vercel에 올린다. 데이터베이스, 인증, 파일 저장, 실시간 채팅은 Supabase를 사용한다.

## 선택한 스택

- **Framework:** Next.js
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **UI Components:** shadcn/ui
- **Animation:** Framer Motion
- **Icons:** lucide-react
- **Backend:** Supabase
- **Database:** Supabase Postgres
- **Realtime:** Supabase Realtime
- **Auth:** Supabase Auth 또는 PIN 기반 커스텀 로그인
- **Deploy:** Vercel

## 왜 이 조합인가

개발자가 정식 개발 경험이 많지 않고, AI 코딩 도구의 도움을 많이 받을 예정이므로 다음 기준을 우선한다.

- 문서와 예제가 많다.
- AI가 잘 다루는 대중적인 스택이다.
- 무료 플랜으로 시작할 수 있다.
- 서버 운영이 거의 필요 없다.
- 실시간 채팅을 별도 서버 없이 만들 수 있다.
- 나중에 데이터가 쌓여도 Postgres 기반이라 오래 가져갈 수 있다.

## Supabase가 맡는 것

- 두 사람의 사용자 정보
- 로그인/세션 관리
- 책, segment seed 데이터
- 읽음 체크 상태
- 하이라이트
- 장별 코멘트와 답글
- 실시간 채팅 메시지
- 읽음 상태
- 나중에 이미지가 필요해지면 Storage

현재 Supabase 상태:

- CLI: `npx supabase`
- Local config: `supabase/config.toml`
- Remote project: `today-one-page`
- Project ref: `ggezuvdhuaizerfmkevl`
- Project URL: `https://ggezuvdhuaizerfmkevl.supabase.co`
- Local link: 완료

Supabase CLI 자동 로그인은 비대화형 터미널에서 막히므로, Dashboard에서 access token을 만든 뒤 CLI에 전달해야 한다.

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
- 현재 Framework Preset: `Other`

아직 실제 Next.js 앱이 없어서 Vercel은 `Other` 프로젝트로 연결되어 있다. Next.js 앱을 scaffold한 뒤에는 Vercel이 Next.js 프로젝트로 빌드하도록 설정을 맞춘다.

## 자동 배포 흐름

로컬에서 커밋하면 Git hook이 자동으로 GitHub에 push한다. Vercel은 GitHub 저장소와 연결되어 있으므로, `main` 브랜치에 push가 들어가면 자동 배포를 실행한다.

흐름:

```text
local commit -> auto git push -> GitHub main -> Vercel deployment
```

주의: 현재는 앱 진입점이 없어서 Vercel에 연결은 되어 있지만 실제 서비스 화면은 아직 없다. Next.js 앱을 만든 뒤부터 배포 결과가 의미 있게 보인다.

## 실시간 채팅 방식

채팅 메시지는 Supabase Postgres의 `messages` 테이블에 저장한다. 새 메시지가 insert되면 Supabase Realtime subscription으로 상대 화면에 즉시 반영한다.

MVP 메시지 모델:

```sql
messages
- id
- sender_id
- body
- created_at
- read_at
```

두 사람만 쓰는 앱이므로 처음에는 `room_id` 없이 시작해도 된다. 나중에 구조를 더 일반화하고 싶으면 `chat_rooms`, `chat_members`를 추가할 수 있다.

## 인증 방향

회원가입은 만들지 않는다. 가능한 선택지는 두 가지다.

### 1. Supabase Auth 사용

- 주환, 희진 계정을 미리 만들어둔다.
- 이메일/비밀번호 또는 매직링크를 쓴다.
- 보안과 세션 관리가 안정적이다.

### 2. PIN 기반 커스텀 로그인

- 랜딩에서 이름을 고르고 PIN을 입력한다.
- 앱의 감성에는 가장 잘 맞는다.
- 보안 처리를 직접 설계해야 한다.

MVP 추천은 **Supabase Auth를 내부적으로 쓰되, 화면은 이름 선택 + 비밀번호 입력처럼 보이게 만드는 방식**이다. 사용자는 단순한 PIN 로그인처럼 느끼고, 내부 세션은 Supabase가 관리한다.

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
