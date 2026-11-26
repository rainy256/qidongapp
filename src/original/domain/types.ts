export type Slot = number; // Integer 30-min index since Unix epoch: Math.floor(utcMs / 1_800_000)

export type GameTag = 'apex' | 'gta' | 'tarkov' | 'custom';

export type Span = Readonly<{
  from: Slot;
  to: Slot;
}>;

export type Night = Span &
  Readonly<{
    id: string;
    dateKey: string; // Logical start date 'YYYY-MM-DD' in Asia/Shanghai
  }>;

export type Pick = Span &
  Readonly<{
    nightId: string;
  }>;

export type Answer =
  | Readonly<{ kind: 'available'; picks: readonly Pick[] }>
  | Readonly<{ kind: 'unavailable' }>;

export type Submission = Readonly<{
  memberId: string;
  nickname: string;
  answer: Answer;
  updatedAt: string;
}>;

export type RecommendInput = Readonly<{
  nights: readonly Night[];
  targetPlayers: number;
  durationSlots: number;
  earliestStart: Slot;
  submissions: readonly Submission[];
}>;

export type Candidate = Readonly<{
  nightId: string;
  memberIds: readonly string[]; // Continuously available across the full window, sorted stably
  firstStart: Slot; // Inclusive start slot
  lastStart: Slot; // Inclusive start slot
  availableUntil: Slot; // Exclusive end boundary where all memberIds are jointly free
  missingPlayers: number;
}>;

export type ViewerRoleState = Readonly<{
  memberId: string | null;
  canClose: boolean;
  mineRevision: number;
}>;

export type RoomSnapshot = Readonly<{
  id: string;
  title: string;
  gameTag?: GameTag;
  tzid: 'Asia/Shanghai';
  nights: readonly Night[];
  targetPlayers: number;
  durationSlots: number;
  roomRevision: number;
  closedAt: string | null;
  submissions: readonly Submission[];
  viewer: ViewerRoleState;
  syncedAt: string;
}>;

export type CreateRoomSpec = Readonly<{
  title: string;
  gameTag?: GameTag;
  nights: readonly Night[];
  targetPlayers: number;
  durationSlots: number;
}>;

export type SaveMineInput = Readonly<{
  nickname: string;
  answer: Answer;
  baseMineRevision: number;
  mutationId: string;
}>;

export type ConnectionState = 'live' | 'reconnecting' | 'offline';

export type MyRoomRole = 'owner' | 'member';

export type MyRoomSummary = Readonly<{
  id: string;
  title: string;
  gameTag?: GameTag;
  nights: readonly Night[];
  targetPlayers: number;
  durationSlots: number;
  submissionCount: number;
  closedAt: string | null;
  createdAt: string;
  role: MyRoomRole;
  lastVisitedAt?: string;
}>;
