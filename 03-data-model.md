# 03. 데이터 모델

## 한 줄 방향

**여러 그룹, 각 그룹 2~5명, 66권 1,189개 segment, 그리고 오래 보존될 기록.**

원래는 "두 사람 고정" 전제로 단순하게 설계했지만, 실제로 멀티 그룹 확장을 하면서 `group_id` 기반 격리 모델로 바뀌었다. 그래도 과한 확장성(조직/권한 체계 등)은 넣지 않고, 소규모 그룹이 오래 쓰는 데 필요한 만큼만 둔다.

## 핵심 개념

- **group:** 초대코드로 묶이는 사용자 그룹(2~5명). 읽기 방식(`daily_one`/`plan`)을 그룹 생성 시 하나 고른다.
- **profile:** 그룹에 속한 사람 한 명. 개인 PIN으로 로그인한다.
- **section:** 성서 책을 묶는 분류(전역, 그룹과 무관).
- **book:** 성서 66권(전역).
- **segment:** 함께 읽는 최소 단위. 한 장이 segment 하나(전역).
- **plan_days:** 읽기 계획표(`plan` 모드) 하루치 범위. 363일, 전역 공용 데이터.
- **reading_progress:** 그룹별 현재 진행 상태(그룹당 정확히 1행).
- **reading_state:** 각 segment를 각 사람이 읽었는지 나타내는 상태.
- **reading_miss:** 한국시간 오전 2시 경계가 지났을 때 아직 읽지 못한 사람을 회차별로 남기는 기록.
- **book_gift:** 회차별로 미리 적어두는 선물 약속. 회차가 끝날 때 공개된다.
- **book_proposal:** 하루 1장 모드에서 "다음 책"을 그룹장이 지정한 기록(더 이상 제안/수락 협상이 아니다).
- **highlight:** 특정 구절에 남기는 표시와 짧은 메모.
- **comment:** 특정 segment에 묶이는 장별 코멘트.
- **reply:** highlight나 comment에 붙는 답글.
- **reaction:** highlight/comment/reply에 붙는 작은 반응.
- **verse_count:** 책/장별 절 수(구절 선택 UI용). 66권 1,189개 장 전체가 채워져 있다.
- **notification:** 앱 안에서 확인하는 조용한 알림.

> `messages`/`message_reads` 테이블은 스키마상 남아있지만(마이그레이션에서 일부러 drop하지 않음) 앱은 더 이상 사용하지 않는다. 채팅 기능 자체가 제거되었다. 기존 주환/희진 채팅 내역은 `docs/chat-archive.md`에 텍스트로 보존했다.

## seed 데이터

기본 성서 구조는 `seed_data.json`을 기준으로 한다.

- sections: 8개
- books: 66권
- segments: 1,189개

읽기 계획표 데이터는 `scripts/seed-reading-plan.ts`에, 절 수 데이터는 `scripts/seed-verse-counts.ts`에 있다. 둘 다 실행 시 `segments`/`books` 테이블과 대조해서 정합성을 자체 검증한다.

`segments_split.json`은 초기 설계 단계의 책별 읽기 묶음 초안으로, 지금은 참고용으로만 남아있다(실제 계획표 데이터는 `plan_days`를 따로 사용).

## groups

```sql
groups
- id uuid primary key
- name text not null
- invite_code text unique not null
- owner_id uuid references profiles(id)
- max_members int not null default 5
- reading_mode text not null default 'daily_one'  -- 'daily_one' | 'plan'
- created_at timestamptz not null
```

- `owner_id`와 `profiles.group_id`는 서로 참조하는 순환 FK라, 그룹 생성 시 "그룹 insert(owner_id null) → 첫 profile insert → owner_id update" 순서로 처리한다.
- `reading_mode`는 그룹 생성 시 한 번만 정하고 이후 변경 UI는 없다.
- `invite_code`는 6자리(혼동되는 0/O/1/I 제외 알파벳+숫자), `lib/invite-code.ts`에서 생성하고 충돌 시 재시도한다.

## profiles

```sql
profiles
- id uuid primary key
- slug text not null                    -- 로그인용 내부 키, 그룹 내에서만 unique
- display_name text not null            -- 본인이 언제든 변경 가능 (update_my_name)
- role text not null
- color_key text not null                -- lib/color-palette.ts 6색 중 하나, 그룹 내 중복 불가
- accent_color text not null
- accent_deep text not null
- accent_soft text not null
- auth_email text
- group_id uuid references groups(id)
- pin_hash text not null                 -- scrypt 해시 ("scrypt:salt:hash" 형식), lib/pin.ts
- created_at timestamptz not null
- unique(group_id, slug)
```

- 로그인은 `{groupId, slug, pin}`을 서버에 보내면 `pin_hash`를 `verifyPin`으로 검증하고, 맞으면 `top_group`(group id) + `top_profile`(slug) 두 개의 httpOnly cookie를 설정한다.
- 최초 사용자였던 주환/희진의 `pin_hash`는 마이그레이션 시 기존 공유 PIN(`APP_SHARED_PIN`)을 해싱해서 그대로 넣었다(로그인 경험 유지). 이후 각자 원하면 바꿀 수 있는 UI는 아직 없다(이름 변경만 가능).

## sections

성서 책을 큰 흐름으로 묶는 분류다. 그룹과 무관한 전역 데이터.

```sql
sections
- id text primary key
- name text not null
- description text
- sort_order integer not null
```

## books

성서 66권을 저장한다. 전역 데이터.

```sql
books
- id text primary key
- section_id text not null references sections(id)
- name text not null
- sort_order integer not null
- chapter_count integer not null
- wol_book_number integer not null
```

## segments

segment는 읽기와 기록의 중심 단위다. 한 장이 segment 하나. 전역 데이터(1,189개).

```sql
segments
- id text primary key
- book_id text not null references books(id)
- book_name text not null
- section_id text not null references sections(id)
- chapter integer not null
- display text not null
- sort_order integer not null
- global_order integer not null
- mark text
- jw_url text
- created_at timestamptz not null
```

본문은 앱 DB에 저장하지 않는다. `jw_url`은 WOL의 신세계역 성경 연구용 장 페이지로 보내는 링크다.

> **주의 (1000행 캡):** 호스팅된 Supabase 프로젝트는 PostgREST 응답을 요청 범위와 무관하게 1000행으로 제한한다. `segments`(1,189행)와 `verse_counts`(1,189행)처럼 1000행을 넘는 테이블은 `.range()`로 페이지네이션해서 가져와야 한다(`app/api/state/route.ts`의 `fetchAllRows` 헬퍼). 새로 큰 테이블을 조회할 때는 이 캡을 항상 염두에 둔다.

## plan_days

읽기 계획표(`plan` 모드) 하루치 범위. 그룹과 무관한 전역 공용 데이터(성서 본문처럼 한 번만 시딩).

```sql
plan_days
- day_index int primary key      -- 1~363
- book_id text not null references books(id)   -- 표시용 책 (그 날 마지막 세그먼트의 책)
- segment_ids text[] not null    -- 그 날 읽을 세그먼트들, 순서대로
```

JW 공식 "성경 읽기 계획표"(sbr, 2009 Watch Tower) 기준. 하루 범위가 책 경계를 넘는 날(예: 오바댜 1장 + 요나 1~4장)은 `segment_ids`에 두 책의 세그먼트가 순서대로 섞여 들어간다. `scripts/seed-reading-plan.ts`가 전체 363일이 1,189개 segment를 빠짐없이 정확히 한 번씩 커버하는지 검증한다.

11개 범주와 시작 `day_index`는 `lib/reading-plan-sections.ts`에 정의되어 있다(그룹 생성 시 "시작할 범위" 드롭다운에 사용):

| 범주 | 시작일 |
|------|--------|
| 모세의 기록 | 1 |
| 이스라엘이 약속의 땅에 들어가다 | 67 |
| 이스라엘의 왕정 시대 | 85 |
| 유대인들이 유배 생활에서 돌아오다 | 149 |
| 고난과 인내에 관한 기록 | 159 |
| 노래와 실용적인 조언이 담긴 책 | 170 |
| 예언서 | 210 |
| 예수의 생애와 봉사에 관한 기록 | 286 |
| 그리스도인 회중의 성장 | 320 |
| 바울이 쓴 편지 | 331 |
| 다른 사도와 제자들의 글 | 354 |

## reading_progress

그룹별 현재 진행 상태. 그룹당 정확히 1행(`reading_progress_group_id_key` unique index).

```sql
reading_progress
- id uuid primary key
- group_id uuid not null references groups(id)
- current_book_id text references books(id)
- current_segment_id text references segments(id)
- initial_book_id text references books(id)
- status text not null              -- 'reading' | 'choosing_book'(레거시) | 'completed'(plan 모드 완독)
- session_id uuid not null default gen_random_uuid()
- plan_day_index int                -- plan 모드에서만 사용
- started_at timestamptz
- completed_at timestamptz
- updated_at timestamptz not null
```

- `session_id`는 선물/못읽음 계산의 회차 구분자다. 하루 1장 모드는 책이 바뀔 때, 계획표 모드는 30 plan-day마다 새 `session_id`가 발급된다.
- 그룹 생성 시 바로 `status: 'reading'`으로 시작한다(시작 책/시작 계획표 범위를 생성 폼에서 직접 고르기 때문에, 예전처럼 빈 `choosing_book` 상태로 시작하지 않는다).
- `choosing_book` 상태는 레거시 안전장치로만 남아있다. 그룹장이 "다음 책 지정"(`set_next_book`)을 하면 그 상태에서도 즉시 `reading`으로 자가 치유된다.

## book_proposals

하루 1장 모드에서 "다음 책이 무엇인지" 저장하는 테이블이다. **더 이상 제안/수락 협상이 아니다** — 그룹장이 지정하거나, 지정이 없으면 자동으로 정해진다.

```sql
book_proposals
- id uuid primary key
- group_id uuid not null references groups(id)
- proposed_book_id text not null references books(id)
- proposed_by uuid not null references profiles(id)   -- 그룹장(지정한 사람)
- accepted_by uuid references profiles(id)             -- proposed_by와 동일값으로 채움
- status text not null           -- 'accepted' | 'started' | 'cancelled' ('pending'은 더 이상 안 씀)
- note text                      -- UI에 입력란이 없어져서 항상 null
- created_at timestamptz not null
- accepted_at timestamptz
- cancelled_at timestamptz
```

동작 (`lib/reading-progress.ts`의 `resolveNextBook`):

1. 그룹에 `status = 'accepted'`인 행이 있으면 그 책이 다음 책이다(그룹장이 지정한 것).
2. 없으면 자동으로 정한다: 그룹의 읽은 기록(`reading_progress.initial_book_id`/`current_book_id` + `reading_states`로 확인된 책 + `status='started'`인 과거 제안)에 없는 책 중 `sort_order`가 가장 앞선 책. 전부 읽었으면 창세기(`sort_order` 1번)로 되돌아간다(재독 허용).
3. 책이 완료되는 순간, 정해진 다음 책의 1장으로 넘어가면서 그 제안(있었다면)을 `status: 'started'`로 표시한다.

그룹장 전용 액션 `set_next_book`은 기존 `accepted` 행을 `cancelled`로 바꾸고 새 `accepted` 행을 넣는다. 그룹이 `choosing_book`(레거시 멈춤) 상태였다면 그 자리에서 즉시 시작한다.

## reading_states

각 사람이 각 segment를 읽었는지 저장한다.

```sql
reading_states
- id uuid primary key
- segment_id text not null references segments(id)
- profile_id uuid not null references profiles(id)
- checked_at timestamptz
- created_at timestamptz not null
- updated_at timestamptz not null
- unique(segment_id, profile_id)
```

규칙:

- `checked_at`이 있으면 읽음.
- `plan` 모드는 하루 범위에 여러 segment가 있을 수 있어서, "오늘 읽었다"는 그 날의 `segment_ids` 전부에 `checked_at`이 있어야 인정된다. `check_read` 액션은 `segmentIds: string[]`(복수)와 기존 `segmentId`(단수, 하위호환) 둘 다 받는다.
- 그룹원 전원이 체크해도 즉시 다음으로 바뀌지 않는다. 최신 체크가 지난 한국시간 오전 2시 경계보다 이전이어야 다음 상태 조회 때 넘어간다.

## reading_misses

하루 경계가 지났는데 현재 segment(들)를 읽지 않은 사람을 기록한다. 경계는 한국시간 오전 2시다.

```sql
reading_misses
- id uuid primary key
- segment_id text not null references segments(id)
- session_id uuid not null
- profile_id uuid not null references profiles(id)
- book_id text not null
- missed_boundary timestamptz not null
- created_at timestamptz not null
- unique(segment_id, profile_id, missed_boundary)
```

- `plan` 모드에서 하루 범위가 여러 segment일 때는 그 날의 **첫 segment**를 대표로 사용해서 기록한다(못읽음은 표시용 카운터라 장 단위 정밀도가 필요 없음).
- `session_id`로 현재 회차의 못 읽음 횟수를 계산한다. N명 그룹에서도 그대로 동작한다 — 최다 못읽음 인원이 여러 명이면 전부 패자로 처리된다.

## book_gifts

회차 동안 각자가 적어두는 선물 약속이다. 다른 그룹원에게는 "선물을 적어두었는지" 정도만 보이고, 내용은 회차를 마칠 때 공개된다.

```sql
book_gifts
- id uuid primary key
- session_id uuid not null
- profile_id uuid not null references profiles(id)
- gift_description text not null
- is_revealed boolean not null
- revealed_at timestamptz
- created_at timestamptz not null
- unique(session_id, profile_id)
```

규칙:

- 회차가 끝나면(하루 1장: 책 완료, 계획표: 30일마다) 못 읽음 횟수가 가장 많은 사람(들)의 선물이 공개된다.
- 동률이거나 전원 0회면 전원 공개될 수 있다.
- **공개된 선물은 가장 최근 회차 것만 화면에 보인다.** 예전에는 최근 6개를 전체 기간에서 가져와서 옛날 회차 선물이 계속 같이 떴는데(실사용 버그), 지금은 `book_gifts`에서 가장 최근에 `revealed_at`이 찍힌 `session_id` 하나만 조회해서 그 회차의 선물만 반환한다.

## highlights

특정 segment 안의 구절 표시다. 본문 전체를 저장하지 않고 구절 참조와 메모만 저장한다.

```sql
highlights
- id uuid primary key
- segment_id text not null references segments(id)
- profile_id uuid not null references profiles(id)
- verse_ref text not null
- start_verse integer
- end_verse integer
- note text
- color text
- created_at timestamptz not null
- updated_at timestamptz not null
- deleted_at timestamptz
```

## comments

segment에 묶이는 깊은 기록이다.

```sql
comments
- id uuid primary key
- segment_id text not null references segments(id)
- profile_id uuid not null references profiles(id)
- body text not null
- created_at timestamptz not null
- updated_at timestamptz not null
- deleted_at timestamptz
```

과거 segment에도 새 코멘트를 달 수 있다. 본인 글만 수정/삭제 가능.

## replies

highlight와 comment 모두에 답글을 달 수 있게 하나의 테이블로 둔다.

```sql
replies
- id uuid primary key
- parent_type text not null   -- 'highlight' | 'comment'
- parent_id uuid not null
- profile_id uuid not null references profiles(id)
- body text not null
- created_at timestamptz not null
- updated_at timestamptz not null
- deleted_at timestamptz
```

Postgres에서 다형 참조를 엄격하게 foreign key로 걸기 어렵기 때문에 앱 로직으로 보호한다.

## reactions

작은 공감 표시다.

```sql
reactions
- id uuid primary key
- target_type text not null   -- 'highlight' | 'comment' | 'reply'
- target_id uuid not null
- profile_id uuid not null references profiles(id)
- emoji text not null
- created_at timestamptz not null
- unique(target_type, target_id, profile_id, emoji)
```

기본 emoji는 `heart` 하나.

## verse_counts

구절 번호 선택 UI를 위해 책/장별 절 수를 저장한다. **66권 1,189개 장 전체가 채워져 있다** (표준 영어 성경 구분 기준, `scripts/seed-verse-counts.ts`). 최초에는 전도서 12장만 있었으나(당시 시작 책이었기 때문), 전체 책으로 확장했다.

```sql
verse_counts
- id uuid primary key
- book_id text not null references books(id)
- chapter integer not null
- verse_count integer not null
- unique(book_id, chapter)
```

데이터 정확도: 표준 구분 기반이라 NWT와 극소수 장에서 ±1절 차이 가능성이 있다. 창세기 1장(31절), 요한계시록 22장(21절), 시편 119편(176절), 에스겔 16장(63절), 다니엘 3장(30절), 욥기 41장(34절) 등을 jw.org 스터디 바이블로 표본 대조해서 확인했다. 데이터가 없는 장은 여전히 직접 타이핑 입력으로 대체되는 fallback이 남아있다(코드는 안 바뀜, 데이터만 채움).

## notifications

앱 안에서 확인하는 조용한 알림이다.

```sql
notifications
- id uuid primary key
- profile_id uuid not null references profiles(id)
- type text not null
- title text not null
- body text
- target_type text
- target_id text
- read_at timestamptz
- created_at timestamptz not null
```

알림 종류:

- `comment`: 새 코멘트
- `reply`: 새 답글
- `book_proposal` / `book_accepted`: 다음 책 지정(그룹장) 관련
- `reading_checked`: 그룹원의 읽음 체크
- `reading_advanced`: 다음 범위가 열리거나 완독했을 때

> `message` 타입은 채팅 제거와 함께 없어졌다. 상태 조회 시 `type != 'message'` 조건으로 과거의 잔여 알림도 걸러낸다.

규칙:

- 본인이 만든 행동에는 본인 알림을 만들지 않는다.
- 상태 조회에서는 읽지 않은 알림만 가져온다.
- 알림을 누르면 관련 segment/기록 화면으로 이동한다.

## presence / 실시간

Supabase Realtime 채널은 그룹별로 스코핑된다(`group-${groupId}-live`). 다른 그룹의 상태 변경 브로드캐스트가 새지 않는다.

원래는 여기에 메신저 presence(접속 중 표시)도 있었지만, 채팅 제거와 함께 사용자별 presence 추적도 제거했다. 지금 실시간 채널은 "누군가 상태를 바꿨으니 새로고침하라"는 신호(broadcast)만 주고받는다.

## 기록 화면을 위한 조회

기록 화면은 성경 책 목록에서 시작한다. 기본 선택된 책은 **오늘 읽는 책**이다(하드코딩 아님). 책을 고르면 장 목록이 나오고, 각 장 옆에 읽음 상태를 표시한다. 장을 누르면 그 장을 언제 읽었는지, 어떤 코멘트/하이라이트/답글/반응이 있었는지 보여준다.

## 삭제 정책

기록이 오래 남는 앱이므로 기본은 soft delete다.

- `deleted_at`을 채우고 목록에서 숨긴다.
- 운영자가 필요하면 Supabase Dashboard에서 완전 삭제할 수 있다.

## 그룹 데이터 격리

RLS 대신 **앱 레벨(서버 라우트)에서 `group_id` 필터링**으로 격리한다(서버는 service role 키를 쓰므로 RLS를 거치지 않는다). 모든 조회/쓰기 쿼리는 `top_group` 쿠키에서 얻은 `group_id`로 스코핑되고, `notifyOthers()` 같은 헬퍼도 같은 그룹 멤버에게만 알림을 보낸다. RLS 자체를 켜는 것은 `08-multi-group.md`의 미결 사항으로 남아있다.

## 결정된 것

- 로그인 방식: 초대코드 + 이름 선택 + 개인 PIN + httpOnly cookie 2개(`top_group`, `top_profile`).
- 그룹 생성 시 읽기 방식(`daily_one`/`plan`)과 시작 지점(책 또는 계획표 범위)을 함께 정한다.
- 다음 책: 그룹장이 지정하거나 자동 선택(안 읽은 책 중 정렬 순서 우선, 다 읽으면 재독).
- segment 기준: 한 장씩(계획표 모드는 하루에 여러 장일 수 있음).
- 구절 번호 선택 UI: 전체 책 지원.
- 앱 안 알림: 포함.
- 회차 구분: `reading_progress.session_id` 기준.
- 못 읽음 횟수와 선물 공개: 현재 회차 `session_id` 기준으로 계산, 화면에는 가장 최근 회차 것만 노출.
- 채팅 기능: 완전히 제거(`messages`/`message_reads` 테이블은 남아있지만 미사용).

## 결정 필요

- RLS를 켜서 서버 로직 버그에 대한 이중 방어를 추가할지 (`08-multi-group.md` 참고).
- 그룹장 위임/그룹 삭제/멤버 추방 UI (아직 미구현).
