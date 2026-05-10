export type Profile = {
  id: string;
  slug: string;
  display_name: string;
  color_key: string;
  accent_color: string;
  accent_deep: string;
  accent_soft: string;
};

export type Section = {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
};

export type Book = {
  id: string;
  section_id: string;
  name: string;
  sort_order: number;
  chapter_count: number;
  wol_book_number: number;
};

export type Segment = {
  id: string;
  book_id: string;
  book_name: string;
  section_id: string;
  chapter: number;
  display: string;
  sort_order: number;
  global_order: number;
  mark: string | null;
  jw_url: string | null;
};

export type ReadingProgress = {
  id: string;
  current_book_id: string;
  current_segment_id: string;
  initial_book_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  updated_at: string;
  session_id: string;
};

export type ReadingMiss = {
  id: string;
  segment_id: string;
  profile_id: string;
  book_id: string;
  missed_boundary: string;
};

export type BookGift = {
  id: string;
  session_id: string;
  profile_id: string;
  gift_description: string;
  is_revealed: boolean;
  revealed_at: string | null;
};

export type ReadingState = {
  id: string;
  segment_id: string;
  profile_id: string;
  checked_at: string | null;
};

export type Highlight = {
  id: string;
  segment_id: string;
  profile_id: string;
  verse_ref: string;
  start_verse: number | null;
  end_verse: number | null;
  note: string | null;
  color: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type SegmentComment = {
  id: string;
  segment_id: string;
  profile_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type Reply = {
  id: string;
  parent_type: "comment" | "highlight";
  parent_id: string;
  profile_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type Reaction = {
  id: string;
  target_type: "comment" | "highlight" | "reply";
  target_id: string;
  profile_id: string;
  emoji: string;
};

export type Message = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

export type MessageRead = {
  id: string;
  message_id: string;
  profile_id: string;
  read_at: string;
};

export type Notification = {
  id: string;
  profile_id: string;
  type: string;
  title: string;
  body: string | null;
  target_type: string | null;
  target_id: string | null;
  read_at: string | null;
  created_at: string;
};

export type BookProposal = {
  id: string;
  proposed_book_id: string;
  proposed_by: string;
  accepted_by: string | null;
  status: string;
  note: string | null;
  created_at: string;
  accepted_at: string | null;
};

export type VerseCount = {
  book_id: string;
  chapter: number;
  verse_count: number;
};

export type AppState = {
  me: Profile | null;
  profiles: Profile[];
  sections: Section[];
  books: Book[];
  segments: Segment[];
  progress: ReadingProgress | null;
  readingStates: ReadingState[];
  highlights: Highlight[];
  comments: SegmentComment[];
  replies: Reply[];
  reactions: Reaction[];
  messages: Message[];
  messageReads: MessageRead[];
  notifications: Notification[];
  proposals: BookProposal[];
  verseCounts: VerseCount[];
  missCounts: Record<string, number>;
  myGift: BookGift | null;
  partnerHasGift: boolean;
  revealedGifts: BookGift[];
};
