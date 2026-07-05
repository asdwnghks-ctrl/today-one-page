# 08. 멀티 그룹 확장 (구현 완료)

## 방향

원래는 주환/희진 두 사람 전용이었지만, 친구 커플이 같은 앱을 쓰고 싶어 하면서 실제로 구현했다. 이 문서는 원래 "나중에 할 설계" 초안이었는데, 지금은 **as-built 참고 문서**로 갱신했다. 실제 구현이 초안과 다른 부분은 명시했다.

관련 코드 세션에서 함께 처리한 것:

- 그룹/초대코드/개인 PIN 인증 전체 구현 및 배포
- 읽기 계획표(`plan`) 모드 추가
- 채팅 기능 완전 제거 (원래 계획에는 없던 결정 — 실제 구현 중에 N명 UX 복잡도를 줄이기 위해 사용자가 결정)
- 다음 책 제안/수락 → 그룹장 지정 + 자동 선택으로 전환 (원래 계획엔 없던, 실사용 피드백 이후 추가된 변경)
- 그룹 정보 화면(초대코드 재확인, 멤버/그룹 이름 변경) (원래 계획엔 없던, 실사용 피드백 이후 추가된 기능)

---

## 확정되어 구현된 요건

- **가입 방식**: 초대 코드 (6자리, 혼동되는 `0/O/1/I` 제외 알파벳+숫자). 그룹 생성자가 코드를 받아 상대에게 공유.
- **그룹 인원**: 2~5명 (`max_members` 기본 5).
- **그룹장**: 그룹당 1명. 그룹 생성자가 자동으로 그룹장이 됨. 위임/이전 기능은 없음(아직).
- **기존 데이터**: 주환/희진 읽기 기록·코멘트·선물 전부 보존 → 첫 번째 그룹(`주환♥희진`, 초대코드 `TGBHER`)으로 마이그레이션 완료.
- **읽기 방식 선택**: 그룹 생성 시 하루 1장(`daily_one`) 또는 읽기 계획표(`plan`) 중 하나를 고르고, 시작 지점(책 또는 계획표 범위)도 그 자리에서 정한다. 이후 변경 UI는 없음.

## 스키마 (실제 적용된 것)

`supabase/migrations/202607040001_multi_group_schema.sql`, `...002_multi_group_backfill.sql`, `...003_profiles_pin_hash_notnull.sql` 3개로 적용했다.

### `groups`

```sql
create table groups (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  invite_code  text unique not null,
  owner_id     uuid references profiles(id),
  max_members  int not null default 5,
  reading_mode text not null default 'daily_one' check (reading_mode in ('daily_one', 'plan')),
  created_at   timestamptz not null default now()
);
```

> 원래 초안에는 `gift_enabled`(선물 기능 on/off), `reading_plan_id`(계획표 종류 선택) 컬럼이 있었는데 **구현하지 않았다**. 선물 기능은 항상 켜져 있고, 계획표는 JW 1년 통독표 1개만 지원한다.

### 기존 테이블 변경

| 테이블 | 추가 컬럼 | 비고 |
|--------|-----------|------|
| `profiles` | `group_id uuid references groups(id)` | `unique(group_id, slug)`로 변경(기존 전역 unique였던 slug 제약을 그룹 단위로 완화) |
| `profiles` | `pin_hash text not null` | scrypt 해시, `lib/pin.ts` |
| `reading_progress` | `group_id uuid references groups(id)` | `unique` — 그룹당 정확히 1행 |
| `reading_progress` | `plan_day_index int` | `plan` 모드 전용 |
| `book_proposals` | `group_id uuid references groups(id)` | |

### 신규 테이블: `plan_days`

원래 초안에는 없던 테이블. 읽기 계획표 모드를 위해 추가했다.

```sql
create table plan_days (
  day_index   int primary key,
  book_id     text not null references books(id),
  segment_ids text[] not null
);
```

363행, `scripts/seed-reading-plan.ts`로 시딩. 상세는 `03-data-model.md` 참고.

### 변경 불필요했던 테이블

`profile_id` 기반이라 group 필터는 profile 조인으로 해결:

- `reading_states`, `reading_misses`, `book_gifts`
- `highlights`, `comments`, `replies`, `reactions`
- `notifications`

### 손대지 않은 테이블: `messages`, `message_reads`

채팅 기능을 완전히 제거하면서 이 두 테이블에 `group_id`를 추가할 필요 자체가 없어졌다. 스키마는 그대로 남겨뒀다(드롭하지 않음) — 내보내기 스크립트(`scripts/export-chat.ts`)로 이미 `docs/chat-archive.md`에 텍스트 백업을 남겼으므로 데이터 손실 걱정 없이 나중에 원하면 별도로 drop해도 된다.

---

## 인증 플로우 (실제 구현)

```
그룹 생성:  POST /api/groups — 그룹명 + 내 이름/색상/PIN + 읽기 방식 + 시작 지점(책 또는 계획표 범위)
그룹 참여:  POST /api/join — invite_code + 내 이름/색상/PIN (색상은 그룹 내 중복 불가)
코드 조회:  GET /api/groups/lookup?code=... — 로그인 전에 그룹명/멤버 목록 확인 (PIN 해시 노출 안 함)
로그인:     POST /api/login — {groupId, slug, pin}
쿠키:       top_group (group id) + top_profile (slug), 둘 다 httpOnly
```

초대코드는 "이 그룹에 들어올 수 있는 열쇠"이고, PIN은 "내 계정 잠금"이다. 그룹 공용 PIN 없음 — 개인마다 각자 설정.

### 기존 주환/희진 로그인 하위 호환

마이그레이션 시 기존 `APP_SHARED_PIN` 값을 두 사람 각자의 초기 PIN으로 해싱해서 세팅했다(`scripts/migrate-pins.ts`). 로그인 경험은 똑같이 유지됐다(같은 비밀번호, 다만 이제 그 앞에 초대코드 `TGBHER` 입력이 추가됨). 이후 각자 원하면 PIN을 바꿀 수 있는 UI는 아직 없다(이름 변경만 가능).

## 실제 구현된 API 엔드포인트

- `POST /api/groups` — 그룹 생성
- `POST /api/join` — 초대코드로 참여
- `GET /api/groups/lookup?code=` — 그룹/멤버 조회 (공개)
- `GET /api/books` — 66권 목록 (공개, 그룹 생성 폼에서 시작 책 선택용)
- `POST /api/login` / `POST /api/logout`
- `GET /api/state` — 로그인 후 전체 상태 (그룹 스코핑)
- `POST /api/action` — 나머지 모든 동작 (아래 참고)

`app/api/action/route.ts`의 액션 목록: `check_read`, `add_comment`, `update_comment`, `delete_comment`, `add_highlight`, `update_highlight`, `delete_highlight`, `add_reply`, `update_reply`, `delete_reply`, `toggle_reaction`, `set_next_book`, `update_my_name`, `update_group_name`, `manual_advance`, `set_gift`, `mark_notification_read`, `mark_notifications_read`, `mark_all_notifications_read`.

> `propose_book`/`accept_proposal` 액션은 초안에는 있었지만 실제로는 만들지 않았다. 대신 `set_next_book`(그룹장 전용) 하나로 대체했다 — 아래 "다음 책" 절 참고.

---

## 비즈니스 로직 변경

### `lib/reading-progress.ts`

모든 exported 함수에 `groupId: string` 파라미터를 추가했다. 추가로 `resolveNextBook(groupId, excludeBookId)`를 새로 만들어서 "다음 책이 무엇인지"를 서버가 단일 소스로 계산한다(아래 참고).

### `app/api/state/route.ts`

`top_group` 쿠키에서 group_id를 추출해 모든 쿼리를 필터링한다. `segments`, `verse_counts`처럼 1000행이 넘는 테이블은 `fetchAllRows` 헬퍼로 페이지네이션한다(Supabase 호스팅 프로젝트의 PostgREST 1000행 캡 때문 — 실제로 이 캡에 두 번 걸렸다).

### `app/api/action/route.ts`

각 액션 핸들러에서 `actor.group_id` 기준으로 필터링한다. `notifyOthers()`도 같은 그룹 멤버에게만 알림을 보낸다.

---

## 다음 책 선택 (원래 계획과 가장 크게 달라진 부분)

### 원래 계획: 제안/수락 (2인 전용)

```
한 사람이 제안 → 상대가 수락 → 현재 책이 끝나면 예약된 책으로 전환
```

이 흐름은 N명 그룹에서 "누가 제안하고 누가 수락하는가"가 애매해지고, 무엇보다 **그룹을 막 만들었을 때 상대가 없으면 아무도 제안을 수락할 수 없어서 오늘 탭이 계속 빈 채로 있는 문제**가 실제로 발생했다(친구 커플이 그룹을 두 번이나 새로 만들었다가 둘 다 막혀 있었던 걸 나중에 라이브 DB에서 확인함).

### 실제 구현: 그룹장 지정 + 자동 선택

```
책이 완료됨
  → book_proposals에 그룹장이 지정한 status='accepted' 행이 있으면 그 책
  → 없으면: 안 읽은 책 중 sort_order가 가장 앞선 책 (전부 읽었으면 창세기부터 재독)
  → 그 책 1장으로 즉시 전환, 새 session_id 발급, 선물 공개
```

- `set_next_book` 액션(그룹장 전용)이 언제든 다음 책을 바꿀 수 있다. UI에서는 "다음 책" 카드에 드롭다운으로 노출된다.
- 그룹 생성 시점에는 시작할 책을 폼에서 바로 고르기 때문에 이 로직이 필요 없다(처음부터 `reading`으로 시작).
- `book_proposals` 테이블은 재사용했지만 의미가 바뀌었다 — `status`는 이제 `accepted`(그룹장이 지정) / `started`(실제로 시작됨) / `cancelled`만 쓰고, `pending`은 없다.

## 선물/미스 시스템 N명 대응

### 실제 구현 (N명)

```
N명 못읽음 집계
→ 최다 못읽음인 사람(들)이 패자
→ 패자가 여러 명이면 각자 선물 공개
→ 전원 동점(0회 포함)이면 전원 공개
```

`revealGiftsForSession()`(`lib/reading-progress.ts`)는 애초에 `profileIds` 배열을 순회하는 구조라 N명에도 코드 변경 없이 그대로 동작했다.

추가로 실사용 중 발견한 버그: 공개된 선물을 화면에 보여줄 때 "최근 6개를 전체 기간에서" 가져오다 보니 예전 회차 선물이 계속 같이 떴다. 지금은 **가장 최근에 공개된 회차 하나만** 보여주도록 고쳤다(`app/api/state/route.ts`).

## 읽기 계획표 모드 (원래 계획엔 미정이었던 것)

원래 초안은 `reading_mode='plan'`과 `reading_plan_id` 컬럼만 언급하고 "계획표 종류는 추후 정의"로 미뤄뒀다. 실제로는:

- 계획표는 JW 공식 "성경 읽기 계획표"(sbr, 2009 Watch Tower) 1개만 지원. 여러 계획표 선택 기능은 없음(그래서 `reading_plan_id` 컬럼도 안 만들었다).
- 데이터는 `plan_days` 테이블(363행)로 관리. `scripts/seed-reading-plan.ts`가 세그먼트 순서/개수를 자체 검증한다.
- 11개 범주와 시작일은 `lib/reading-plan-sections.ts`에 정의. 그룹 생성 시 이 중 하나를 시작 지점으로 고른다.
- 선물 공개 주기는 책 단위가 아니라 **30 plan-day마다**(책/섹션 단위로 하면 너무 들쭉날쭉해서 — 하루 만에 끝나는 책도 있고 몇 달 걸리는 구간도 있음).
- 363일차를 완료하면 `completed` 상태로 멈춘다.

## UI 변경 포인트 (실제 반영)

### `app/page.tsx`

| 변경 전 (2인 전용) | 변경 후 (N명) |
|---------|---------|
| `const other = profiles.find(p => p.id !== me?.id)` | `const others = profiles.filter(p => p.id !== me?.id)` |
| `ProposalCard` (제안/수락 UI) | `NextBookCard` (자동 선택 표시 + 그룹장 지정 드롭다운) |
| 채팅 탭/drawer | 제거 |
| 기록 탭 기본 책 = `"ecc"` 하드코딩 | 기본 책 = 오늘 읽는 책 |
| "여유 있을 때 천천히, 함께." 채움 문구 | 할 말 없으면 문구 자체를 안 띄움 |

### 신규 화면

- 그룹 생성 (그룹명, 내 이름/색상/PIN, 읽기 방식, 시작 지점)
- 초대코드 입력 → 멤버 선택
- 새 멤버로 참여
- 그룹 정보 (초대코드 재확인, 멤버/그룹 이름 변경)

---

## 기존 데이터 마이그레이션 (실제 적용된 SQL)

`202607040002_multi_group_backfill.sql`에서 실행:

```sql
insert into groups (name, invite_code, max_members)
values ('주환♥희진', 'TGBHER', 5);

update profiles set group_id = (select id from groups where invite_code = 'TGBHER') where group_id is null;
update reading_progress set group_id = (select id from groups where invite_code = 'TGBHER') where group_id is null;
update book_proposals set group_id = (select id from groups where invite_code = 'TGBHER') where group_id is null;

update groups g
set owner_id = (select p.id from profiles p where p.slug = 'joohwan' and p.group_id = g.id)
where g.invite_code = 'TGBHER' and g.owner_id is null;

alter table profiles alter column group_id set not null;
alter table reading_progress alter column group_id set not null;
alter table book_proposals alter column group_id set not null;
create unique index reading_progress_group_id_key on reading_progress(group_id);
```

PIN은 별도 Node 스크립트(`scripts/migrate-pins.ts`)로 채웠다 — scrypt 해시는 SQL만으로 만들 수 없어서, `202607040003_profiles_pin_hash_notnull.sql`(NOT NULL 잠금)은 이 스크립트 실행 **후**에 적용해야 한다.

---

## 마이그레이션 적용 방법 (참고)

`supabase db push`는 DB 비밀번호가 필요한데 이 저장소에는 저장돼 있지 않다. 실제로는 Supabase Management API(`POST https://api.supabase.com/v1/projects/{ref}/database/query`, personal access token으로 인증)를 통해 SQL을 직접 실행해서 적용했다. CLI 접근이 막히면 이 경로가 대안이 된다.

---

## 그룹장 권한 (구현된 범위)

지금 그룹장만 할 수 있는 것:

- 다음 책 지정 (`set_next_book`)
- 그룹 이름 변경 (`update_group_name`)

**아직 구현하지 않은 것** (원래 초안에 있었지만 미룬 것):

- 멤버 내보내기
- 그룹 삭제
- 그룹장 위임 (탈퇴 시 자동 승계 포함)
- 선물 기능 on/off
- 그룹 생성 후 읽기 방식 변경

UI: 그룹장 여부를 나타내는 왕관 아이콘 등은 아직 없다. `state.isOwner` 값으로 그룹장 전용 버튼(다음 책 바꾸기, 그룹 이름 수정)의 노출 여부만 다르다.

---

## 미결 사항

- RLS 정책: 지금은 서버 라우트의 `group_id` 필터링에만 의존한다. RLS 자체를 켜서 이중 방어를 추가할지는 미정.
- 그룹장 위임/그룹 삭제/멤버 추방 UI.
- 여러 읽기 계획표 지원 (지금은 1개만).
- PIN 변경 UI (지금은 이름 변경만 가능).
- 초대코드 완전 분실(전원 로그아웃 + 코드/PIN 모두 기억 못 함) 시 복구 수단 — 지금은 없음, 사용자에게 코드를 별도로 저장해두라고 안내하는 것으로 대체.
