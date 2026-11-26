import {
  CloseSoftIcon,
  LockSoftIcon,
  PlusPillIcon,
  RefreshSoftIcon,
  TicketSparkIcon,
  WifiOffSoftIcon,
} from '../components/AppIcons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { pendingMutation, readPending, writePending, type PendingMutation } from '../api/mutation';
import {
  recordRoomSnapshot,
  removeLocalMyRoom,
  type StorageScope,
} from '../api/recentRooms';
import {
  NetworkError,
  RepositoryError,
  NotFoundError,
  RevisionConflictError,
  RoomClosedError,
  type RoomRepository,
} from '../api/repository';
import { CloseRoomDialog } from '../components/CloseRoomDialog';
import { CopyAction } from '../components/CopyAction';
import { NightEditor } from '../components/NightEditor';
import { RecommendationCard } from '../components/RecommendationCard';
import { RosterDisclosure } from '../components/RosterDisclosure';
import { buildRoomShareMeta } from '../domain/recommend';
import { formatSyncClock } from '../domain/time';
import type { Answer, ConnectionState, RoomSnapshot } from '../domain/types';
import styles from './RoomPage.module.css';

type RoomPageProps = Readonly<{
  roomId: string;
  justCreated: boolean;
  repository: RoomRepository;
  storageScope: StorageScope;
  denyClipboard: boolean;
  onNavigate: (path: string) => void;
  onRoomLoaded: (snapshot: RoomSnapshot | null) => void;
}>;

export function RoomPage({
  roomId,
  justCreated,
  repository,
  storageScope,
  denyClipboard,
  onNavigate,
  onRoomLoaded,
}: RoomPageProps) {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('live');

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<{ message: string; isConflict: boolean } | null>(null);
  const [showCreatedBanner, setShowCreatedBanner] = useState(justCreated);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const loadRef = useRef<AbortController | null>(null);
  const saving = useRef(false);
  const closing = useRef(false);
  const pendingSave = useRef<PendingMutation | null>(readPending('save:'+roomId));
  const pendingClose = useRef<PendingMutation | null>(readPending('close:'+roomId));
  const accept = useCallback((incoming: RoomSnapshot) => {
    setSnapshot(prev => prev && prev.id === incoming.id && prev.roomRevision > incoming.roomRevision ? prev : incoming);
    recordRoomSnapshot(storageScope, incoming);
  }, [storageScope]);
  const markMissing = useCallback(() => {
    loadRef.current?.abort();
    removeLocalMyRoom(storageScope, roomId);
    setNotFound(true);
    setLoading(false);
    setSnapshot(null);
  }, [roomId, storageScope]);

  useEffect(() => {
    onRoomLoaded(snapshot);
  }, [onRoomLoaded, snapshot]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (snapshot) {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      document.title = buildRoomShareMeta(snapshot, origin).title;
    } else if (notFound) {
      document.title = '找不到这张开黑车票 · 约局车票';
    }
    return () => {
      document.title = '约局 · 找个大家都能开的时间';
    };
  }, [notFound, snapshot]);

  const loadRoom = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    setLoadError(null);
    loadRef.current?.abort();
    const ac = new AbortController();
    loadRef.current = ac;
    try {
      const snap = await repository.getRoom(roomId, ac.signal);
      if (ac.signal.aborted || loadRef.current !== ac) return;
      accept(snap);
      setConnectionState('live');
    } catch (err) {
      if (ac.signal.aborted || loadRef.current !== ac || (err as Error).name === 'AbortError') return;
      if (err instanceof NotFoundError) {
        markMissing();
      } else {
        setLoadError((err as Error).message || '加载失败，请重试。');
      }
    } finally {
      if (loadRef.current === ac) {
        setLoading(false);
        loadRef.current = null;
      }
    }
  }, [repository, roomId, accept, markMissing]);

  useEffect(() => {
    setShowCreatedBanner(justCreated);
    setSaveError(null);
    void loadRoom();
    return () => loadRef.current?.abort();
  }, [justCreated, loadRoom]);

  useEffect(() => {
    if (!snapshot || snapshot.id !== roomId) return;
    const unsub = repository.subscribe(roomId, snapshot.roomRevision, {
      onSnapshot: (incoming) => {
        setSnapshot((prev) => {
          if (!prev || prev.id !== roomId) return incoming;
          const viewerChanged =
            incoming.viewer.memberId !== prev.viewer.memberId ||
            incoming.viewer.canClose !== prev.viewer.canClose ||
            incoming.viewer.mineRevision !== prev.viewer.mineRevision;
          if (incoming.roomRevision < prev.roomRevision) {
            return prev;
          }
          if (incoming.roomRevision === prev.roomRevision && !viewerChanged) {
            return prev;
          }
          return incoming;
        });
      },
      onConnection: (state) => {
        setConnectionState(state);
      },
      onNotFound: markMissing,
    });
    return unsub;
  }, [repository, roomId, snapshot?.id, markMissing]);

  const inviteUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/r/${roomId}`
      : `https://yueju.example/r/${roomId}`;

  const handleSaveMine = async (nickname: string, answer: Answer): Promise<boolean> => {
    if (!snapshot || saving.current) return false;
    saving.current = true;
    setIsSaving(true);
    setSaveError(null);
    const scope = 'save:'+roomId;
    try {
      pendingSave.current = pendingMutation(pendingSave.current, {nickname,answer}, snapshot.viewer.mineRevision);
      writePending(scope,pendingSave.current);
      const updated = await repository.saveMine(roomId, {
        nickname,
        answer,
        baseMineRevision: pendingSave.current.baseRevision,
        mutationId: pendingSave.current.key,
      });
      pendingSave.current = null;
      writePending(scope,null);
      recordRoomSnapshot(storageScope, updated, updated.viewer.canClose ? 'owner' : 'member');
      accept(updated);
      return true;
    } catch (err) {
      if (err instanceof RepositoryError && !(err instanceof NetworkError) && err.code !== 'SESSION_REQUIRED') {
        pendingSave.current = null;
        writePending(scope,null);
      }
      if (err instanceof RevisionConflictError) {
        setSaveError({ message: err.message, isConflict: true });
      } else if (err instanceof RoomClosedError) {
        setSaveError({ message: err.message, isConflict: false });
        void loadRoom();
      } else {
        setSaveError({
          message: (err as Error).message || '保存失败，草稿仍保留在本地，请重试。',
          isConflict: false,
        });
      }
      return false;
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  };

  const handleConfirmClose = async () => {
    if (!snapshot || closing.current) return;
    closing.current = true;
    setIsClosing(true);
    const scope = 'close:'+roomId;
    try {
      pendingClose.current = pendingMutation(pendingClose.current, {roomId});
      writePending(scope,pendingClose.current);
      const updated = await repository.closeRoom(roomId, pendingClose.current.key);
      pendingClose.current = null;
      writePending(scope,null);
      accept(updated);
      setCloseDialogOpen(false);
    } catch (err) {
      if (err instanceof RepositoryError && !(err instanceof NetworkError) && err.code !== 'SESSION_REQUIRED') {
        pendingClose.current = null;
        writePending(scope,null);
      }
      setSaveError({
        message: (err as Error).message || '关闭收集失败，请重试。',
        isConflict: false,
      });
      setCloseDialogOpen(false);
    } finally {
      closing.current = false;
      setIsClosing(false);
    }
  };

  const scrollToEditor = () => {
    document.getElementById('time-picker')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (loading && !snapshot) {
    return (
      <div className={styles.page}>
        <div className={styles.mobileStage}>
          <div className={styles.skeletonCard} />
          <div className={styles.skeletonCardTall} />
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyStateShell}>
          <h1 className={styles.notFoundTitle}>找不到这张开黑车票</h1>
          <p className={styles.notFoundDesc}>可能链接复制不完整，或者小房间已经过期啦。</p>
          <button type="button" className={styles.backHomeBtn} onClick={() => onNavigate('/')}>
            去发一张新车票
          </button>
        </div>
      </div>
    );
  }

  if (!snapshot && loadError) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyStateShell}>
          <h1 className={styles.notFoundTitle}>暂时打不开房间</h1>
          <p className={styles.notFoundDesc}>{loadError}</p>
          <button type="button" className={styles.backHomeBtn} onClick={() => void loadRoom()}>
            重新加载
          </button>
        </div>
      </div>
    );
  }

  if (!snapshot) return null;

  const isClosed = snapshot.closedAt !== null;
  const earliestStart = snapshot.nights[0]?.from ?? 0;

  return (
    <div className={styles.page}>
      <div className={styles.mobileStage}>
        {/* Compact Mobile Top Utility Strip */}
        <header className={styles.topUtility}>
          <a
            href="/"
            className={styles.brandWord}
            title="回到首页查看我的车队"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('/');
            }}
          >
            <span className={styles.brandMark} aria-hidden="true">
              <TicketSparkIcon size={15} tone="violet" />
            </span>
            <span>约局车票</span>
          </a>

          <a
            href="/"
            className={styles.newRoomLink}
            onClick={(e) => {
              e.preventDefault();
              onNavigate('/');
            }}
          >
            <PlusPillIcon size={15} tone="violet" />
            <span>发起新车队</span>
          </a>
        </header>

        {showCreatedBanner && (
          <div className={styles.createdTip} role="status">
            <div className={styles.createdTipBody}>
              <p className={styles.createdTipTitle}>车票建好啦～</p>
              <p className={styles.createdTipText}>
                把链接丢进群里即可直接填时间，下次用当前浏览器打开仍可管理。
              </p>
              <CopyAction
                text={inviteUrl}
                label="复制邀请链接"
                variant="secondary"
                denyClipboard={denyClipboard}
              />
            </div>
            <button
              type="button"
              className={styles.dismissTipBtn}
              aria-label="关闭提示"
              onClick={() => setShowCreatedBanner(false)}
            >
              <CloseSoftIcon size={16} />
            </button>
          </div>
        )}

        {snapshot.viewer.canClose && !isClosed && (
          <div className={styles.ownerBar}>
            <span className={styles.ownerNote}>房主管理 · 链接可直接群发</span>
            <div className={styles.ownerActions}>
              <CopyAction
                text={inviteUrl}
                label="复制链接"
                variant="ghost"
                denyClipboard={denyClipboard}
              />
              <button
                type="button"
                className={styles.closeRoomBtn}
                onClick={() => setCloseDialogOpen(true)}
              >
                <LockSoftIcon size={13} tone="rose" />
                <span>结束收集</span>
              </button>
            </div>
          </div>
        )}

        {connectionState !== 'live' && (
          <div className={styles.offlineBanner} role="status">
            <WifiOffSoftIcon size={16} tone="honey" className={styles.offlineIcon} />
            <span className="tabular">
              {connectionState === 'offline'
                ? `离线状态 · 显示 ${formatSyncClock(snapshot.syncedAt)} 同步的结果`
                : '同步重连中…'}
            </span>
            <button type="button" className={styles.retrySyncBtn} onClick={() => void loadRoom()}>
              <RefreshSoftIcon size={13} tone="honey" />
              <span>刷新</span>
            </button>
          </div>
        )}

        <main className={styles.stack}>
          <RecommendationCard
            snapshot={snapshot}
            earliestStart={earliestStart}
            inviteUrl={inviteUrl}
            isOffline={connectionState === 'offline'}
            denyClipboard={denyClipboard}
            onJumpToEditor={scrollToEditor}
          />

          <NightEditor
            snapshot={snapshot}
            earliestStart={earliestStart}
            isSaving={isSaving}
            saveError={saveError}
            onSave={handleSaveMine}
            onRefreshLatest={() => {
              setSaveError(null);
              void loadRoom();
            }}
            onClearError={() => setSaveError(null)}
          />

          <RosterDisclosure
            submissions={snapshot.submissions}
            nights={snapshot.nights}
            viewerMemberId={snapshot.viewer.memberId}
          />
        </main>
      </div>

      <CloseRoomDialog
        open={closeDialogOpen}
        roomTitle={snapshot.title}
        isBusy={isClosing}
        onCancel={() => setCloseDialogOpen(false)}
        onConfirm={() => void handleConfirmClose()}
      />
    </div>
  );
}
