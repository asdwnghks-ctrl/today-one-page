# 03. 데이터 모델

## 한 줄 방향

**두 사람, 66권, 1,189개 segment, 그리고 오래 보존될 기록.**

이 앱의 데이터 모델은 공개 서비스처럼 확장성을 크게 열어두기보다, 둘이 오래 쓰는 데 필요한 안정성과 단순함을 우선한다. 처음부터 여러 방, 여러 커플, 복잡한 권한 모델을 만들지 않는다.

## 핵심 개념

- **profile:** 고정 사용자 두 명. 주환과 희진.
- **section:** 성서 책을 묶는 8개 분류.
- **book:** 성서 66권.
- **segment:** 함께 읽는 최소 단위. 기본은 한 장이다.
- **reading_state:** 각 segment를 각 사람이 읽었는지 나타내는 상태.
- **reading_miss:** 한국시간 오전 2시 경계가 지났을 때 아직 읽지 못한 사람을 책 회차별로 남기는 기록.
- **book_gift:** 책 회차별로 미리 적어두는 선물 약속. 책을 마칠 때 공개된다.
- **book_proposal:** 한 책을 끝낸 뒤 다음 책을 제안하고 수락하는 기록.
- **highlight:** 특정 구절에 남기는 표시와 짧은 메모.
- **comment:** 특정 segment에 묶이는 장별 코멘트.
- **reply:** highlight나 comment에 붙는 답글.
- **reaction:** highlight/comment/reply에 붙는 작은 반응.
- **message:** 둘만의 실시간 채팅 메시지.
- **message_read:** 채팅 읽음 상태.
- **notification:** 앱 안에서 확인하는 조용한 알림.

## seed 데이터

기본 성서 구조는 `seed_data.json`을 기준으로 한다.

- sections: 8개
- books: 66권
- segments: 1,189개

`segments_split.json`은 책별 읽기 묶음 초안이다. 현재 `01-overview.md`에서는 한 장을 한 segment로 정의하고 있으므로, MVP의 기본 단위는 `seed_data.json`의 1,189개 장별 segment를 따른다.

`segments_split.json`은 나중에 "오늘 같이 읽을 분량 추천"이나 "여러 장 묶어서 보기" 기능을 만들 때 참고 자료로 남긴다.

## users / profiles

회원가입은 없다. 사용자는 미리 만들어진 두 명뿐이다.

```sql
profiles
- id uuid primary key
- slug text unique not null
- display_name text not null
- role text not null
- color_key text not null
- accent_color text not null
- accent_deep text not null
- accent_soft text not null
- auth_email text
- created_at timestamptz not null
```

예상 데이터:

- `joohwan` / 주환 / 어두운 올리브 계열
- `heejin` / 희진 / 어두운 핑크 계열

현재 로그인은 공유 PIN(`APP_SHARED_PIN`)을 서버에서 확인한 뒤 `top_profile` httpOnly cookie를 설정한다. Supabase에는 두 사람의 `profiles`만 저장하고, 브라우저가 직접 Supabase Auth 세션을 들고 있지는 않다. `auth_email`은 나중에 Supabase Auth로 옮길 때를 위한 보조 필드로 남겨둘 수 있다.

## sections

성서 책을 큰 흐름으로 묶는 분류다.

```sql
sections
- id text primary key
- name text not null
- description text
- sort_order integer not null
```

예:

- `moses`: 모세의 기록
- `promised_land`: 이스라엘이 약속의 땅에 들어가다
- `kingdom`: 이스라엘의 왕정 시대
- `exile_return`: 유대인들이 유배 생활에서 돌아오다
- `songs`: 노래와 실용적인 조언이 담긴 책
- `prophets`: 예언서
- `jesus`: 예수의 생애와 봉사에 관한 기록
- `early_church`: 그리스도인 회중의 성장

## books

성서 66권을 저장한다.

```sql
books
- id text primary key
- section_id text not null references sections(id)
- name text not null
- sort_order integer not null
- chapter_count integer not null
- wol_book_number integer not null
```

`id`는 `gen`, `exo` 같은 seed key를 사용한다. 화면에는 `name`을 보여준다.

## segments

segment는 읽기와 기록의 중심 단위다. MVP에서는 성서 한 장이 segment 하나다.

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

링크 기준:

- 기본 탐색: `https://wol.jw.org/ko/wol/binav/r8/lp-ko`
- 책 페이지: `https://wol.jw.org/ko/wol/binav/r8/lp-ko/nwtsty/{book_number}`
- 장 페이지: `https://wol.jw.org/ko/wol/b/r8/lp-ko/nwtsty/{book_number}/{chapter}`

예: 전도서 1장은 `https://wol.jw.org/ko/wol/b/r8/lp-ko/nwtsty/21/1`

필요하면 나중에 다음 필드를 추가할 수 있다.

- `chapter_label`: `시편 119:64-176`처럼 특수 구간 표시가 필요할 때
- `pdf_marker_type`: PDF의 빨간 마름모/파란 동그라미 정보를 보존할 때
- `estimated_minutes`: 읽기 부담을 부드럽게 안내할 때

## reading_progress

현재 함께 읽는 책과 segment를 저장한다.

```sql
reading_progress
- id uuid primary key
- current_book_id text references books(id)
- current_segment_id text references segments(id)
- initial_book_id text references books(id)
- status text not null
- session_id uuid not null
- started_at timestamptz
- completed_at timestamptz
- updated_at timestamptz not null
```

두 사람만 쓰므로 MVP에서는 row 하나만 있어도 된다. 시작 책은 **전도서**로 둔다. `session_id`는 책 한 권을 읽는 한 회차를 나타낸다. 같은 책을 나중에 다시 읽더라도 새 `session_id`가 생기므로, 선물과 못 읽음 기록은 이전 회차와 섞이지 않는다.

상태 예:

- `choosing_book`: 다음 책을 고르는 중
- `reading`: 현재 segment를 읽는 중
- `waiting`: DB status라기보다 한 명만 읽음 체크했을 때 화면에서 파생되는 상태
- 책 완료 시에는 `completed_at`을 채우고, 다음 책이 없으면 `status`를 `choosing_book`으로 둔다.

## book_proposals

다음 책을 함께 고르는 흐름이다. 한 사람이 제안하고 다른 사람이 수락하더라도, 현재 책을 읽는 중이면 즉시 `reading_progress`를 바꾸지 않는다. 수락된 제안은 예약 상태로 남아 있다가 현재 책 마지막 장을 둘 다 읽고 다음 한국시간 오전 2시 경계가 지나면 새 책 1장으로 시작된다.

단, 이미 현재 책이 끝나서 `reading_progress.status = 'choosing_book'`인 상태라면 수락과 동시에 새 책 1장이 열린다.

```sql
book_proposals
- id uuid primary key
- proposed_book_id text not null references books(id)
- proposed_by uuid not null references profiles(id)
- accepted_by uuid references profiles(id)
- status text not null
- note text
- created_at timestamptz not null
- accepted_at timestamptz
- cancelled_at timestamptz
```

상태 예:

- `pending`: 수락 대기 중
- `accepted`: 수락되어 다음 책으로 예약됨
- `started`: 실제로 새 책 1장으로 시작됨
- `cancelled`: 제안 취소됨

규칙:

- `pending` 제안은 한 번에 하나만 둔다.
- `accepted` 제안도 한 번에 하나만 둔다. 이미 다음 책이 정해져 있으면 새 제안/수락을 막는다.
- 제안한 사람은 자기 제안을 수락할 수 없다.
- 현재 책을 읽는 중이면 상대가 수락해도 현재 segment는 유지된다.
- 마지막 장까지 완료된 뒤 다음 2시 경계에서 선물을 공개하고, 예약된 책의 1장으로 넘어가며 새 `session_id`를 만든다.
- 이미 함께 읽은 책도 다시 제안할 수 있다. 과거 기록은 유지되고, 회차 구분은 `reading_progress.session_id`를 기준으로 한다.

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
- 한쪽만 읽으면 상대를 기다리는 상태가 된다.
- 두 사람 모두 `checked_at`이 생겨도 즉시 다음 segment로 바뀌지 않는다.
- 최신 읽음 체크가 지난 한국시간 오전 2시 경계보다 이전이면, 다음 상태 조회 때 다음 segment를 활성화한다.
- 읽음 취소 기능은 MVP에서 제외한다. 운영 중 필요하면 나중에 추가한다.

## reading_misses

하루 경계가 지났는데 현재 segment를 읽지 않은 사람을 기록한다. 경계는 한국시간 오전 2시다.

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

규칙:

- 한 경계마다 사람/segment별로 한 번만 기록한다.
- `session_id`로 현재 책 회차의 못 읽음 횟수를 계산한다.
- 과거 회차의 기록은 남기되, 현재 책의 선물 계산에는 현재 `session_id`만 사용한다.
- `reading_misses.session_id`가 없는 초기 DB 상태를 고려해 앱에는 임시 fallback이 들어가 있지만, 현재 원격 DB에는 migration이 적용되어 있어야 한다.

## book_gifts

책 한 권을 읽는 동안 각자가 적어두는 선물 약속이다. 상대에게는 "선물을 적어두었는지" 정도만 보이고, 내용은 책을 마칠 때 공개된다.

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

- 한 `session_id`에서 사람당 하나의 선물 약속을 둔다.
- 책 마지막 장을 둘 다 읽고 다음 2시 경계가 지나면, 못 읽음 횟수가 가장 많은 사람의 선물을 공개한다.
- 동률이거나 둘 다 0회면 둘 다 공개될 수 있다.
- 공개된 선물은 과거 회차 기록으로 남는다.

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

예:

- `창세기 1:27`
- `시편 119:64-68`

정확한 구절 검증은 처음에는 강하게 하지 않는다. 사용자가 직접 입력하는 텍스트로 받고, 나중에 자동완성이나 구절 선택 UI를 붙인다.

## comments

segment에 묶이는 깊은 기록이다. 채팅과 다르게 흐름보다 보존과 재방문이 중요하다.

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

규칙:

- 과거 segment에도 새 코멘트를 달 수 있다.
- 코멘트에는 읽음 표시나 접속 상태를 붙이지 않는다.
- 수정/삭제는 MVP에서 본인 글만 허용한다.

## replies

highlight와 comment 모두에 답글을 달 수 있게 하나의 테이블로 둔다.

```sql
replies
- id uuid primary key
- parent_type text not null
- parent_id uuid not null
- profile_id uuid not null references profiles(id)
- body text not null
- created_at timestamptz not null
- updated_at timestamptz not null
- deleted_at timestamptz
```

`parent_type` 값:

- `highlight`
- `comment`

Postgres에서 다형 참조를 엄격하게 foreign key로 걸기 어렵기 때문에, MVP에서는 앱 로직과 RLS로 보호한다. 복잡해지면 `highlight_replies`, `comment_replies`로 나눌 수 있다.

## reactions

작은 공감 표시다. MVP에서는 하나의 기본 반응만 있어도 충분하다.

```sql
reactions
- id uuid primary key
- target_type text not null
- target_id uuid not null
- profile_id uuid not null references profiles(id)
- emoji text not null
- created_at timestamptz not null
- unique(target_type, target_id, profile_id, emoji)
```

대상:

- `highlight`
- `comment`
- `reply`

MVP 기본 emoji는 `heart` 하나로 시작한다. 실제 DB에는 이모지 문자보다 `heart` 같은 key를 저장하는 편이 안정적이다.

## verse_counts

구절 번호 선택 UI를 위해 책/장별 절 수를 저장한다.

```sql
verse_counts
- id uuid primary key
- book_id text not null references books(id)
- chapter integer not null
- verse_count integer not null
- unique(book_id, chapter)
```

MVP에서는 시작 책인 전도서를 우선 정확히 넣고, 나머지 책은 seed를 보강하면서 확장한다. 절 수 데이터가 없는 장은 직접 입력 fallback을 제공한다.

## messages

둘만의 실시간 채팅 메시지다.

```sql
messages
- id uuid primary key
- sender_id uuid not null references profiles(id)
- body text not null
- created_at timestamptz not null
- edited_at timestamptz
- deleted_at timestamptz
```

두 사람만 쓰므로 처음에는 `room_id`를 두지 않는다. 나중에 주제별 방이나 아카이브가 필요해지면 `chat_rooms`, `chat_members`를 추가한다.

## message_reads

읽음 표시는 메신저에만 적용한다.

```sql
message_reads
- id uuid primary key
- message_id uuid not null references messages(id)
- profile_id uuid not null references profiles(id)
- read_at timestamptz not null
- unique(message_id, profile_id)
```

MVP부터 `message_reads` 테이블을 사용한다. 사용자가 둘뿐이라도 "누가 읽었는지"를 명확히 남기는 쪽이 이후 기능 확장에 안전하다.

## notifications

앱 안에서 확인하는 조용한 알림이다. 앱 밖 푸시 알림은 MVP에서 제외한다.

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

- `message`: 새 채팅 메시지
- `comment`: 새 코멘트
- `reply`: 새 답글
- `book_proposal`: 다음 책 제안
- `book_accepted`: 다음 책 수락
- `reading_checked`: 상대의 읽음 체크

규칙:

- 본인이 만든 행동에는 본인 알림을 만들지 않는다.
- 상태 조회에서는 읽지 않은 알림만 가져온다.
- 읽지 않은 알림 수를 하단 탭 또는 헤더에 작게 표시한다.
- 알림을 누르면 관련 채팅, segment, 책 제안 화면으로 이동한다.
- 채팅 탭에 들어가면 `message` 알림과 상대 메시지 읽음 상태를 자동으로 처리한다.
- 코멘트/기록성 화면에 들어가면 `comment`, `reply` 알림을 자동으로 읽음 처리한다.
- 삭제된 채팅 메시지에 연결된 알림은 삭제하거나 목록에서 숨긴다.

## presence

접속 상태는 DB에 영구 저장하지 않는다.

Supabase Realtime Presence channel에서 현재 채팅 화면을 보고 있는 사용자를 추적한다.

- 접속 중이면 채팅 헤더에 작은 점 또는 "함께 있는 중" 표시
- 접속 중이 아니면 강한 오프라인 문구를 보여주지 않음
- 마지막 접속 시간은 MVP 제외
- 타이핑 중 표시는 MVP 제외

## 기록 화면을 위한 조회

기록 화면은 성경 책 목록에서 시작한다. 책을 고르면 장 목록이 나오고, 각 장 옆에 읽음 상태를 표시한다. 장을 누르면 그 장을 언제 읽었는지, 어떤 코멘트/하이라이트/답글/반응이 있었는지 보여준다.

초기 조회 대상:

- 책 목록과 책별 읽음 요약
- 책 안의 segment 목록과 읽음 상태
- segment별 읽은 날짜
- segment별 코멘트
- segment별 하이라이트
- segment별 답글과 반응

추후 조회 대상:

- "작년 오늘" 같은 날짜 기반 회고
- 특정 책의 모든 기록
- 특정 사람이 쓴 기록
- 채팅 메시지 검색

## 삭제 정책

기록이 오래 남는 앱이므로 기본은 soft delete다.

- `deleted_at`을 채우고 목록에서 숨긴다.
- 운영자가 필요하면 Supabase Dashboard에서 완전 삭제할 수 있다.
- 채팅 메시지도 가능하면 soft delete로 시작한다.

## RLS 원칙

공개 앱이 아니더라도 RLS는 켜둔다.

기본 원칙:

- 로그인한 두 사람만 모든 앱 데이터를 읽을 수 있다.
- 본인 글만 생성/수정/삭제할 수 있다.
- seed 데이터는 읽기 전용이다.
- `profiles`는 두 사람 모두 읽을 수 있지만, 수정은 운영자만 한다.
- `messages`, `message_reads`는 두 사람만 접근한다.
- `notifications`는 본인 알림만 읽고 수정할 수 있다.

## 결정된 것

- 로그인 방식: 이름 선택 + 공유 PIN 확인 + httpOnly cookie.
- 시작 책: 전도서.
- 다음 책 선택: 한 사람이 제안하고 다른 사람이 수락.
- 메시지 읽음 상태: `message_reads` 테이블 사용.
- segment 기준: 한 장씩.
- 구절 번호 선택 UI: MVP에 포함.
- 앱 안 알림: MVP에 포함.
- 책 회차 구분: `reading_progress.session_id` 기준.
- 다음 책 전환: 수락 즉시 전환이 아니라 현재 책 마지막 장 완료 후 다음 2시 경계에서 시작.
- 못 읽음 횟수와 선물 공개: 현재 책 `session_id` 기준으로 계산.

## 결정 필요

- 구절 입력 방식: 자유 입력으로 시작할지, 장 안에서 구절 번호를 고르는 UI까지 MVP에 넣을지.
