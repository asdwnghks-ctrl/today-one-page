# 08. 멀티 그룹 확장 설계

## 방향

지금은 주환/희진 두 사람 전용이지만, 친구·가족·커플 누구나 같은 서비스를 쓸 수 있게 확장한다.
구현은 나중에 하고, 이 문서에 설계를 먼저 정리해 나간다.

---

## 확정된 요건

- **가입 방식**: 초대 코드 (6자리 영숫자). 그룹 생성자가 코드를 받아 상대에게 공유.
- **그룹 인원**: 2~5명 유연 (커플, 친구 소모임, 가족 등).
- **그룹장**: 그룹당 1명. 그룹 생성자가 자동으로 그룹장이 됨.
- **기존 데이터**: 주환/희진 읽기 기록·코멘트·선물 등 전부 보존 → 첫 번째 그룹으로 마이그레이션.

---

## 스키마 변경안

### 신규 테이블: `groups`

```sql
create table groups (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,                        -- e.g. "주환♥희진"
  invite_code         text unique not null,                 -- 6자리 영숫자
  owner_id            uuid references profiles(id),         -- 그룹장
  max_members         int not null default 5,
  gift_enabled        boolean not null default true,        -- 선물 기능 on/off
  reading_mode        text not null default 'daily_one',    -- 'daily_one' | 'plan'
  reading_plan_id     text,                                 -- reading_mode = 'plan'일 때 어떤 계획표
  created_at          timestamptz not null default now()
);
```

### 기존 테이블 FK 추가

| 테이블 | 추가 컬럼 | 비고 |
|--------|-----------|------|
| `profiles` | `group_id uuid references groups(id)` | 사람이 어느 그룹 소속인지 |
| `profiles` | `pin_hash text not null` | 개인 PIN (사용자가 직접 설정) |
| `reading_progress` | `group_id uuid references groups(id)` | 그룹별 진행상태 |
| `book_proposals` | `group_id uuid references groups(id)` | 그룹별 책 제안 |
| `messages` | `group_id uuid references groups(id)` | 그룹 채팅 |

### 변경 불필요한 테이블

`profile_id` 기반이라 group 필터는 profile 조인으로 해결 가능:

- `reading_states`, `reading_misses`, `book_gifts`
- `highlights`, `comments`, `replies`, `reactions`
- `notifications`, `message_reads`

---

## 인증 플로우 변경안

### 현재

```
로그인: slug 선택 + APP_SHARED_PIN 입력
쿠키: top_profile (slug)
```

### 변경 후

```
그룹 생성:  그룹명 입력 → 내 이름 + 색상 + 개인 PIN 설정 → invite_code 발급
그룹 참여:  invite_code 입력 → 내 이름 + 색상 + 개인 PIN 설정 → profile 생성
로그인:     invite_code 입력 → 멤버 이름 박스 표시 → 내 이름 선택 → 내 PIN 입력
쿠키:       top_group (group_id) + top_profile (slug)
```

초대코드는 "이 그룹에 들어올 수 있는 열쇠"이고, PIN은 "내 계정 잠금"이다.
그룹 공용 PIN 없음 — 개인마다 각자 설정.

### 기존 주환/희진 로그인 하위 호환

마이그레이션 시 기존 `APP_SHARED_PIN`을 두 사람 각자의 초기 PIN으로 세팅.
이후 각자 변경 가능.

---

## 새 API 엔드포인트

### `POST /api/groups` — 그룹 생성

```typescript
// 요청
{ group_name: string; your_name: string; your_color: string; your_pin: string }

// 처리
// 1. 6자리 invite_code 랜덤 생성 (충돌 시 재시도)
// 2. groups insert
// 3. profiles insert (첫 멤버, pin_hash 저장)
// 4. 쿠키 설정

// 응답
{ invite_code: string }
```

### `POST /api/join` — 초대코드로 참여

```typescript
// 요청
{ invite_code: string; your_name: string; your_color: string; your_pin: string }

// 처리
// 1. invite_code로 그룹 조회
// 2. 현재 인원 수 확인 (max_members 초과 시 거절)
// 3. profiles insert (slug = 이름 기반 자동 생성, pin_hash 저장)
// 4. 쿠키 설정

// 응답
{ profile_slug: string }
```

---

## 비즈니스 로직 변경

### lib/reading-progress.ts

모든 exported 함수에 `groupId: string` 파라미터 추가.
`profiles` 조회 시 `group_id = groupId` 필터 적용.

### app/api/state/route.ts

`top_group` 쿠키에서 group_id 추출 후 모든 쿼리 필터링:
```typescript
const groupId = cookieStore.get("top_group")?.value;
```

### app/api/action/route.ts

action 핸들러에서 group_id 검증 추가. `notifyOthers()`도 group 내 프로필에만 알림.

---

## 선물/미스 시스템 N명 대응

### 현재 (2명 전용)

```
미스 비교 → 더 많이 쉰 쪽이 패자 → 패자 선물 공개
```

### 변경 후 (N명)

```
N명 미스 집계
→ 최다 미스인 사람(들)이 패자
→ 패자가 여러 명이면 각자 선물 공개
→ 전원 동점이면 무승부 (선물 비공개 유지)
```

`revealGiftsForSession()` 함수 변경 위치: `lib/reading-progress.ts`

---

## UI 변경 포인트

### app/page.tsx

| 변경 전 | 변경 후 |
|---------|---------|
| `const other = profiles.find(p => p.id !== me?.id)` | `const others = profiles.filter(p => p.id !== me?.id)` |
| "상대 아직" | "X명 중 Y명 읽음" |
| "희진이 졌어요" | "주환, 희진이 졌어요" (복수 패자 가능) |

### 신규 화면

- `/create-group` — 그룹 생성 (그룹명, 내 이름/색상, PIN 설정)
- `/join` — 초대코드로 그룹 참여 (코드 + PIN + 이름/색상)
- 로그인 화면 — 초대코드 입력 필드 추가

---

## 기존 데이터 마이그레이션 SQL (초안)

```sql
-- 기본 그룹 생성 (주환/희진)
insert into groups (name, invite_code, pin_hash)
values ('주환♥희진', 'TGBHER', '<APP_SHARED_PIN 해시값>');

-- 기존 프로필 연결
update profiles
set group_id = (select id from groups where invite_code = 'TGBHER');

-- 기존 reading_progress 연결
update reading_progress
set group_id = (select id from groups where invite_code = 'TGBHER');

-- 기존 book_proposals 연결
update book_proposals
set group_id = (select id from groups where invite_code = 'TGBHER');

-- 기존 messages 연결
update messages
set group_id = (select id from groups where invite_code = 'TGBHER');
```

---

## 구현 순서 (나중에 시작할 때)

1. 스키마 마이그레이션 + 기존 데이터 마이그레이션
2. 타입 변경 (`lib/types.ts`)
3. 인증 플로우 변경 (`app/api/login`, 신규 `groups`, `join`)
4. state + action 필터링
5. 비즈니스 로직 (`reading-progress.ts`)
6. UI 변경 (메인 화면, 신규 그룹 생성/참여 화면)

---

## 그룹장 권한

그룹장만 할 수 있는 것:
- 그룹 이름 변경
- 멤버 내보내기
- 그룹 삭제
- 그룹장 위임
- **그룹 설정 변경** (아래 참고)

그룹장이 탈퇴하면 → 가입 순서가 가장 빠른 멤버가 자동 승계.

UI: 내 프로필 옆에 작은 왕관 아이콘 등으로 표시.

---

## 그룹 설정 (방장 전용)

### 1. 선물 기능 on/off (`gift_enabled`)

| 값 | 동작 |
|----|------|
| `true` (기본) | 책 시작 시 선물 약속, 책 완료 시 패자 공개 |
| `false` | 선물 약속 UI 숨김, 미스 기록은 계속하되 공개 없음 |

### 2. 읽기 방식 (`reading_mode`)

| 값 | 동작 |
|----|------|
| `daily_one` (기본) | 하루 1장. 둘 다 체크 → 다음 날 오전 2시에 다음 장 |
| `plan` | 성경읽기 계획표 기준. 계획표에 따라 하루 읽을 범위가 달라짐 |

`plan` 모드에서는 `reading_plan_id`로 어떤 계획표를 따를지 지정.
계획표 종류는 추후 정의 (예: "1년 완독", "맥체인 계획표" 등).

### 설정 변경 시점

- 선물 기능, 읽기 방식 모두 변경 즉시 적용. 책 읽는 도중에 바꿔도 바로 반영.

---

---

## 미결 사항

- 색상 팔레트 정의: 새 멤버가 선택할 수 있는 색상 목록 (현재는 올리브/핑크 2가지만 존재)
- 그룹 탈퇴/삭제 정책 상세
- 그룹장 위임 UI 위치
- 성경읽기 계획표 종류 및 데이터 구조 (plan 모드 구현 시 별도 정의 필요)
- RLS 정책: group_id 기반 행 수준 보안 강화 시점
