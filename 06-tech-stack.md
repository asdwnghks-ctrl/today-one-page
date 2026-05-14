# 06. 기술 스택

## 결론

MVP는 **Vercel + Supabase만으로 충분하다.**

프론트엔드는 Next.js로 만들고, 배포는 Vercel에 올린다. 데이터베이스, 인증, 파일 저장, 실시간 채팅은 Supabase를 사용한다.

## 선택한 스택

- **Framework:** Next.js
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **UI Components:** Tailwind 기반 로컬 컴포넌트
- **Animation:** Framer Motion
- **Icons:** lucide-react
- **Backend:** Supabase
- **Database:** Supabase Postgres
- **Realtime:** Supabase Realtime
- **Auth:** 공유 PIN + httpOnly cookie 기반 이름 선택 로그인
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
- 성서 segment 읽음 체크 상태
- 책 회차별 못 읽음 기록
- 책 회차별 선물 약속과 공개 상태
- 다음 책 제안/수락 상태
- 하이라이트
- 장별 코멘트와 답글
- 실시간 채팅 메시지
- 메신저 메시지 읽음 상태
- 메신저 접속 상태 presence
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

- 로그인
- 상태 조회
- 읽음 체크
- 코멘트/하이라이트/반응 저장
- 책 제안/수락
- 채팅 메시지 저장
- 앱 안 알림 읽음 처리

Render가 유용해질 수 있는 경우:

- Vercel 요청 시간 안에 처리하기 어려운 긴 백그라운드 작업이 생길 때
- 정교한 cron/worker가 필요할 때
- 대용량 파일 처리, 이미지 변환, 외부 API polling 같은 서버 상주 작업이 필요할 때
- Supabase Edge Function이나 Vercel Cron보다 별도 서버 운영이 더 단순해질 때

현재는 인프라를 늘리기보다 Vercel + Supabase 조합을 유지한다.

## 실시간 채팅 방식

채팅 메시지는 Supabase Postgres의 `messages` 테이블에 저장한다. 새 메시지가 insert되면 Supabase Realtime subscription으로 상대 화면에 즉시 반영한다.

MVP 메시지 모델:

```sql
messages
- id
- sender_id
- body
- created_at
- edited_at
- deleted_at
```

두 사람만 쓰는 앱이므로 처음에는 `room_id` 없이 시작해도 된다. 나중에 구조를 더 일반화하고 싶으면 `chat_rooms`, `chat_members`를 추가할 수 있다.

메신저 접속 상태는 Supabase Realtime Presence로 처리한다. 앱이 열려 있으면 현재 사용자를 chat presence channel에 등록하고, 상대가 같은 channel에 있으면 접속 중으로 표시한다.

메신저 읽음 상태는 `message_reads` 테이블로 처리한다. 사용자가 둘뿐이라도 누가 언제 읽었는지 명확히 남기는 편이 안전하다. 성서 코멘트에는 `read_at`이나 presence 개념을 붙이지 않는다.

## 인증 방향

회원가입은 만들지 않는다. 화면은 이름 선택 + 비밀번호 입력처럼 보이게 만든다.

### 현재 선택: 공유 PIN + httpOnly cookie

- 주환, 희진 profile을 Supabase에 미리 만들어둔다.
- 앱 서버는 `APP_SHARED_PIN`을 확인한다.
- PIN이 맞으면 `top_profile` httpOnly cookie에 현재 사용자 slug를 저장한다.
- 브라우저는 Supabase service role key를 직접 갖지 않는다.

사용자는 단순한 PIN/비밀번호 로그인처럼 느낀다. 나중에 보안을 더 엄격하게 가져가야 하면 Supabase Auth로 전환할 수 있다.

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
