import { useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import { inferGameTag } from '../domain/recommend';
import { formatDuration, formatNightRangeHeader } from '../domain/time';
import type { MyRoomSummary } from '../domain/types';
import {
  AlertSoftIcon,
  CheckSoftIcon,
  ChevronSoftIcon,
  CopyReportIcon,
  TicketSparkIcon,
  TrashSoftIcon,
} from './AppIcons';
import { GameStickerArt } from './GameArtwork';
import styles from './MyRoomsSection.module.css';

type MyRoomsSectionProps = Readonly<{
  rooms: readonly MyRoomSummary[];
  onOpenRoom: (roomId: string) => void;
  onDeleteRoom: (room: MyRoomSummary) => Promise<void>;
  denyClipboard?: boolean;
}>;

const DEFAULT_VISIBLE_COUNT = 3;

function legacyCopyText(text: string): boolean {
  const previousFocus = document.activeElement as HTMLElement | null;
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.cssText = 'position:fixed;inset-block-start:0;opacity:0;pointer-events:none;';
  document.body.append(field);
  field.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
    previousFocus?.focus({ preventScroll: true });
  }
}

export function MyRoomsSection({
  rooms,
  onOpenRoom,
  onDeleteRoom,
  denyClipboard = false,
}: MyRoomsSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pendingRoom, setPendingRoom] = useState<MyRoomSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (pendingRoom && !dialog.open) {
      dialog.showModal();
    } else if (!pendingRoom && dialog.open) {
      dialog.close();
    }
  }, [pendingRoom]);

  // Fallback light dismiss when browser lacks closedby="any" (e.g. Safari/WeChat)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if ('closedBy' in HTMLDialogElement.prototype) return;

    let pressedOutside = false;
    const isOutside = (e: PointerEvent) => {
      const rect = dialog.getBoundingClientRect();
      return (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      );
    };

    const onDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const onUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e) && !isDeleting) {
        dialog.close();
      }
      pressedOutside = false;
    };

    dialog.addEventListener('pointerdown', onDown);
    dialog.addEventListener('pointerup', onUp);
    return () => {
      dialog.removeEventListener('pointerdown', onDown);
      dialog.removeEventListener('pointerup', onUp);
    };
  }, [isDeleting]);

  const closeDialog = () => {
    if (isDeleting) return;
    const dialog = dialogRef.current;
    if (dialog) {
      dialog.returnValue = '';
    }
    setDeleteError(null);
    setPendingRoom(null);
  };

  const confirmDelete = async () => {
    if (!pendingRoom || isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await onDeleteRoom(pendingRoom);
      const dialog = dialogRef.current;
      if (dialog?.open) {
        dialog.returnValue = '';
        dialog.close();
      }
      setPendingRoom(null);
    } catch (err) {
      setDeleteError((err as Error).message || '删除失败，请稍后重试。');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCopyInvite = async (e: MouseEvent, roomId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const url =
      typeof window !== 'undefined'
        ? `${window.location.origin}/r/${encodeURIComponent(roomId)}`
        : `/r/${encodeURIComponent(roomId)}`;

    let ok = false;
    if (!denyClipboard && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        ok = true;
      } catch {
        ok = legacyCopyText(url);
      }
    } else if (!denyClipboard) {
      ok = legacyCopyText(url);
    }

    if (ok) {
      if (copyTimerRef.current !== null) {
        clearTimeout(copyTimerRef.current);
      }
      setCopiedId(roomId);
      copyTimerRef.current = window.setTimeout(() => {
        setCopiedId((curr) => (curr === roomId ? null : curr));
      }, 1800);
    }
  };

  if (rooms.length === 0) {
    return null;
  }

  const visibleRooms = expanded ? rooms : rooms.slice(0, DEFAULT_VISIBLE_COUNT);
  const hasMore = rooms.length > DEFAULT_VISIBLE_COUNT;

  return (
    <>
      <section className={styles.card} aria-label="我的车队">
        <div className={styles.header}>
          <div className={styles.titleRow}>
            <TicketSparkIcon size={16} tone="violet" />
            <h2 className={styles.title}>我的车队</h2>
            <span className={`${styles.countBadge} tabular`}>{rooms.length} 场</span>
          </div>
          <span className={styles.caption}>当前浏览器自动找回</span>
        </div>

        <ul className={styles.list}>
          {visibleRooms.map((room) => {
            const gameTag = inferGameTag(room.title, room.gameTag);
            const href = `/r/${encodeURIComponent(room.id)}`;
            const statusLabel = room.closedAt
              ? '已定场'
              : room.submissionCount > 0
                ? `${room.submissionCount}/${room.targetPlayers} 人`
                : '待上车';
            const isCopied = copiedId === room.id;

            return (
              <li key={room.id} className={styles.row}>
                <a
                  href={href}
                  className={styles.rowLink}
                  onClick={(e) => {
                    e.preventDefault();
                    onOpenRoom(room.id);
                  }}
                >
                  <GameStickerArt game={gameTag} size={44} />
                  <span className={styles.rowBody}>
                    <span className={styles.rowTitleLine}>
                      <span className={styles.rowTitle}>{room.title}</span>
                    </span>
                    <span className={styles.rowMetaLine}>
                      <span
                        className={
                          room.role === 'owner' ? styles.roleOwner : styles.roleMember
                        }
                      >
                        {room.role === 'owner' ? '我发起' : '我参与'}
                      </span>
                      <span className={`${styles.statusPill} tabular`}>{statusLabel}</span>
                      <span className={`${styles.dateText} tabular`}>
                        {formatNightRangeHeader(room.nights)} · 至少 {formatDuration(room.durationSlots)}
                      </span>
                    </span>
                  </span>
                </a>

                <div className={styles.rowActions}>
                  <button
                    type="button"
                    className={styles.copyBtn}
                    data-copied={isCopied ? '' : undefined}
                    aria-label={`复制「${room.title}」车票链接`}
                    onClick={(e) => void handleCopyInvite(e, room.id)}
                  >
                    {isCopied ? (
                      <>
                        <CheckSoftIcon size={14} tone="violet" />
                        <span>已复制</span>
                      </>
                    ) : (
                      <CopyReportIcon size={15} tone="violet" />
                    )}
                  </button>

                  <button
                    type="button"
                    className={styles.deleteBtn}
                    aria-label={
                      room.role === 'owner'
                        ? `删除「${room.title}」车队`
                        : `从列表移除「${room.title}」`
                    }
                    title={room.role === 'owner' ? '删除车队' : '从列表移除'}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDeleteError(null);
                      setPendingRoom(room);
                    }}
                  >
                    <TrashSoftIcon size={15} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        {hasMore && (
          <button
            type="button"
            className={styles.toggleBtn}
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            <span>{expanded ? '收起部分车队' : `展开全部（共 ${rooms.length} 场）`}</span>
            <ChevronSoftIcon
              size={14}
              className={expanded ? styles.chevronOpen : styles.chevron}
            />
          </button>
        )}
      </section>

      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby={titleId}
        {...({ closedby: 'any' } as Record<string, string>)}
        onClose={closeDialog}
        onCancel={(e) => {
          if (isDeleting) {
            e.preventDefault();
          }
        }}
      >
        {pendingRoom && (
          <div className={styles.dialogContent}>
            <h2 id={titleId} className={styles.dialogTitle}>
              {pendingRoom.role === 'owner' ? '彻底删除这个车队？' : '从「我的车队」移除？'}
            </h2>
            <p className={styles.dialogBody}>
              {pendingRoom.role === 'owner'
                ? `删除「${pendingRoom.title}」后，房间和所有已填时间将从服务器永久清除，之前分享进群的链接也会失效。`
                : `仅从当前浏览器的列表中移除「${pendingRoom.title}」，不会影响原房间和群友已填的时间。`}
            </p>
            {deleteError && (
              <p className={styles.dialogError} role="alert">
                <AlertSoftIcon size={15} />
                <span>{deleteError}</span>
              </p>
            )}
            <div className={styles.dialogActions}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={closeDialog}
                disabled={isDeleting}
                autoFocus
              >
                先留着
              </button>
              <button
                type="button"
                className={styles.confirmBtn}
                onClick={() => void confirmDelete()}
                disabled={isDeleting}
              >
                {pendingRoom.role === 'owner'
                  ? isDeleting
                    ? '正在删除…'
                    : '确认删除'
                  : isDeleting
                    ? '正在移除…'
                    : '确认移除'}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
