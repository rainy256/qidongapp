import type {
  ConnectionState,
  CreateRoomSpec,
  MyRoomSummary,
  RoomSnapshot,
  SaveMineInput,
} from '../domain/types';

export class RepositoryError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'RepositoryError';
    this.code = code;
  }
}

export class RevisionConflictError extends RepositoryError {
  constructor(message = '你在其他设备或窗口已经更新过填写，请先刷新查看最新内容。') {
    super('REVISION_CONFLICT', message);
    this.name = 'RevisionConflictError';
  }
}

export class RoomClosedError extends RepositoryError {
  constructor(message = '房主已结束本次收集，当前仅可查看结果。') {
    super('ROOM_CLOSED', message);
    this.name = 'RoomClosedError';
  }
}

export class NotFoundError extends RepositoryError {
  constructor(message = '找不到这个约局房间，可能链接有误或已过期。') {
    super('NOT_FOUND', message);
    this.name = 'NotFoundError';
  }
}

export class ForbiddenError extends RepositoryError {
  constructor(message = '只有房主可以结束收集。') {
    super('FORBIDDEN', message);
    this.name = 'ForbiddenError';
  }
}

export class NetworkError extends RepositoryError {
  constructor(message = '网络连接似乎断开了，你的草稿仍保留在本地，请稍后重试。') {
    super('NETWORK_ERROR', message);
    this.name = 'NetworkError';
  }
}

export type SubscribeHandlers = Readonly<{
  onSnapshot: (snapshot: RoomSnapshot) => void;
  onConnection: (state: ConnectionState) => void;
  onNotFound?: () => void;
}>;

export interface RoomRepository {
  createRoom(spec: CreateRoomSpec, mutationId: string): Promise<RoomSnapshot>;
  getRoom(id: string, signal?: AbortSignal): Promise<RoomSnapshot>;
  saveMine(id: string, input: SaveMineInput): Promise<RoomSnapshot>;
  closeRoom(id: string, mutationId: string): Promise<RoomSnapshot>;
  deleteRoom(id: string): Promise<void>;
  listMyRooms(signal?: AbortSignal): Promise<readonly MyRoomSummary[]>;
  subscribe(id: string, afterRevision: number, handlers: SubscribeHandlers): () => void;
}
