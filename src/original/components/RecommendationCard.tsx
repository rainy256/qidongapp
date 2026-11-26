import {
  ChevronSoftIcon,
  CrownBadgeIcon,
  PartyStarIcon,
  SquadUsersIcon,
  StarGlintIcon,
} from './AppIcons';
import {
  formatCandidateBadge,
  formatGroupNotice,
  formatMemberListZh,
  getRoomCompletionState,
  pickDisplayCandidates,
  recommend,
} from '../domain/recommend';
import {
  formatDuration,
  formatNightRangeHeader,
  formatNightWeekday,
  formatSlotInNight,
} from '../domain/time';
import type { Candidate, Night, RoomSnapshot, Slot } from '../domain/types';
import { SeatRow } from './AvatarChip';
import { CopyAction } from './CopyAction';
import { GameStickerArt, HeroSquadIllustration, inferGameTag } from './GameArtwork';
import styles from './RecommendationCard.module.css';

type RecommendationCardProps = Readonly<{
  snapshot: RoomSnapshot;
  earliestStart: Slot;
  inviteUrl: string;
  isOffline: boolean;
  denyClipboard: boolean;
  onJumpToEditor?: () => void;
}>;

function describeCandidateRow(
  c: Candidate,
  nights: readonly Night[],
  targetPlayers: number,
  durationSlots: number,
): string {
  const night = nights.find((n) => n.id === c.nightId);
  if (!night) return '';
  const day = formatNightWeekday(night.dateKey);
  const start = formatSlotInNight(c.firstStart, night.dateKey);
  const end = formatSlotInNight(c.availableUntil, night.dateKey);
  const windowNote =
    c.lastStart > c.firstStart
      ? `（最晚 ${formatSlotInNight(c.lastStart, night.dateKey)} 开）`
      : '';
  const status =
    c.missingPlayers === 0
      ? `${c.memberIds.length} 人有空 · ${targetPlayers} 人可开`
      : `差 ${c.missingPlayers} 人（已有 ${c.memberIds.length} 人）`;
  return `${day} ${start} 开${windowNote} · ${status} · 都能玩到 ${end}（满 ${formatDuration(durationSlots)}）`;
}

export function RecommendationCard({
  snapshot,
  earliestStart,
  inviteUrl,
  isOffline,
  denyClipboard,
  onJumpToEditor,
}: RecommendationCardProps) {
  const candidates = recommend({
    nights: snapshot.nights,
    targetPlayers: snapshot.targetPlayers,
    durationSlots: snapshot.durationSlots,
    earliestStart,
    submissions: snapshot.submissions,
  });

  const { primary, alternatives } = pickDisplayCandidates(candidates);
  const isClosed = snapshot.closedAt !== null;
  const completionState = getRoomCompletionState(snapshot.closedAt, primary);
  const closureLabel =
    completionState === 'settled'
      ? '已定场'
      : completionState === 'closed-incomplete'
        ? '收集结束 · 未凑齐'
        : null;
  const gameTag = inferGameTag(snapshot.title, snapshot.gameTag);
  const ruleLine = `${formatNightRangeHeader(snapshot.nights)} · ${snapshot.targetPlayers} 人发车 · 至少 ${formatDuration(snapshot.durationSlots)}`;

  const isEmpty = snapshot.submissions.length === 0;
  const isReady = primary?.missingPlayers === 0;
  const isAlmostOne = primary?.missingPlayers === 1;

  const badgeText = isEmpty
    ? '车票已出'
    : !primary
      ? '暂未重合'
      : formatCandidateBadge(primary, snapshot.targetPlayers);

  const cardMoodClass = isReady
    ? styles.ticketReady
    : isAlmostOne
      ? styles.ticketAlmost
      : '';

  const nameMap = new Map(snapshot.submissions.map((s) => [s.memberId, s.nickname]));
  const names = primary ? primary.memberIds.map((id) => nameMap.get(id) ?? id) : [];
  const seatPlayers = primary
    ? primary.memberIds.map((id) => ({
        id,
        name: nameMap.get(id) ?? id,
        isMe: id === snapshot.viewer.memberId,
      }))
    : [];

  const night = primary ? snapshot.nights.find((n) => n.id === primary.nightId) : undefined;
  const dayLabel = night ? formatNightWeekday(night.dateKey) : '';
  const startLabel = primary && night ? formatSlotInNight(primary.firstStart, night.dateKey) : '';
  const lastStartLabel =
    primary && night ? formatSlotInNight(primary.lastStart, night.dateKey) : '';
  const endLabel =
    primary && night ? formatSlotInNight(primary.availableUntil, night.dateKey) : '';
  const noticeText = formatGroupNotice(snapshot, primary, inviteUrl, isOffline, alternatives);

  return (
    <section className={`${styles.ticket} ${cardMoodClass}`} aria-label="发车推荐票面">
      {/* Upper Ticket Section: Game Sticker + Title + Status Stamp */}
      <div className={styles.ticketTop}>
        <GameStickerArt game={gameTag} size={74} />

        <div className={styles.ticketHeadInfo}>
          <div className={styles.stampRow}>
            <span
              className={
                isReady
                  ? styles.readyBadge
                  : isAlmostOne
                    ? styles.amberBadge
                    : styles.neutralBadge
              }
            >
              {isReady ? (
                <PartyStarIcon size={14} tone="auto" />
              ) : isAlmostOne ? (
                <StarGlintIcon size={14} tone="honey" />
              ) : (
                <SquadUsersIcon size={14} tone="violet" />
              )}
              <span className="tabular">{badgeText}</span>
            </span>

            {closureLabel && (
              <span className={styles.closedTag}>
                {completionState === 'settled' ? (
                  <CrownBadgeIcon size={13} tone="rose" />
                ) : (
                  <StarGlintIcon size={13} tone="honey" />
                )}
                <span>{closureLabel}</span>
              </span>
            )}
          </div>

          <h1 className={styles.roomTitle}>{snapshot.title}</h1>
          <p className={`${styles.roomMeta} tabular`}>{ruleLine}</p>
        </div>
      </div>

      {/* Perforated Boarding-Pass Seam */}
      <div className={styles.perforation} aria-hidden="true">
        <span className={styles.notchLeft} />
        <span className={styles.dashedLine} />
        <span className={styles.notchRight} />
      </div>

      {/* Lower Ticket Section: Departure Time + Visual Boarding Seats */}
      <div className={styles.ticketBottom}>
        {isEmpty ? (
          <>
            <div className={styles.emptyBody}>
              <HeroSquadIllustration />
              <div className={styles.emptyCopy}>
                <p className={styles.emptyPrimary}>
                  {isClosed ? '本次收集已结束，暂无可用时间记录。' : '车票刚印好，等你第一个上车选时间～'}
                </p>
                <p className={styles.emptyHint}>
                  {isClosed
                    ? '这张车票已关闭，当前没有可推荐的发车时段。'
                    : '下面点一下「整晚有空」或自选时段就能立马开局。'}
                </p>
              </div>
            </div>
            <div className={styles.actions}>
              <CopyAction
                text={noticeText}
                label={isClosed ? '复制收集结果' : '复制邀请战报'}
                variant="secondary"
                denyClipboard={denyClipboard}
              />
            </div>
          </>
        ) : !primary ? (
          <div className={styles.noOverlapBody}>
            <h2 className={styles.subHero}>
              已有 <span className="tabular">{snapshot.submissions.length}</span> 人交卷，
              {isClosed ? '收集结束时仍未凑出' : '暂未凑出'}{' '}
              <span className="tabular">{formatDuration(snapshot.durationSlots)}</span> 重合时段
            </h2>
            <p className={styles.reasonLine}>
              {isClosed
                ? '本次收集已结束，未能凑齐满足人数和时长要求的重合时段。'
                : '再等等其他群友，或放宽单次游玩时长试试～'}
            </p>
            <div className={styles.actions}>
              <CopyAction
                text={noticeText}
                label="复制群聊战报"
                variant={isClosed ? 'primary' : 'secondary'}
                denyClipboard={denyClipboard}
              />
            </div>
          </div>
        ) : (
          <>
            <div className={styles.departureBlock}>
              <span className={styles.departureEyebrow}>
                {primary.missingPlayers === 0
                  ? '推荐发车时间'
                  : isClosed
                    ? '收集结束时的最佳重合'
                    : '目前最接近凑齐'}
              </span>
              {primary.missingPlayers >= 2 ? (
                <h2 className={`${styles.subHero} tabular`}>
                  {isClosed ? '收集结束时最多' : '目前最多'} {names.length} 人能一起玩满{' '}
                  {formatDuration(snapshot.durationSlots)}
                </h2>
              ) : (
                <h2 className={`${styles.heroTime} tabular`}>
                  {dayLabel} {startLabel} 开
                </h2>
              )}
            </div>

            <SeatRow
              players={seatPlayers}
              targetPlayers={snapshot.targetPlayers}
              onClickEmptySeat={!isClosed ? onJumpToEditor : undefined}
            />

            <div className={styles.copyLines}>
              <p className={`${styles.reasonLine} tabular`}>
                {primary.missingPlayers >= 2
                  ? `最佳窗口：${dayLabel} ${startLabel}–${endLabel}（${formatMemberListZh(names)}）`
                  : `${formatMemberListZh(names)}都能玩到 ${endLabel}。`}
              </p>
              {primary.lastStart > primary.firstStart && primary.missingPlayers < 2 && (
                <p className={`${styles.windowLine} tabular`}>
                  最晚 {lastStartLabel} 开也来得及，都能玩满{' '}
                  {formatDuration(snapshot.durationSlots)}。
                </p>
              )}
            </div>

            <div className={styles.actions}>
              <CopyAction
                text={noticeText}
                label="复制群聊战报"
                variant={isClosed ? 'primary' : 'secondary'}
                denyClipboard={denyClipboard}
              />
            </div>

            {alternatives.length > 0 && (
              <details className={styles.altDetails}>
                <summary className={styles.altSummary}>
                  <span>其他备选时段（{alternatives.length}）</span>
                  <ChevronSoftIcon size={15} className={styles.altChevron} />
                </summary>
                <ul className={styles.altList}>
                  {alternatives.map((alt) => (
                    <li
                      key={`${alt.nightId}-${alt.firstStart}-${alt.memberIds.join(',')}`}
                      className={`${styles.altItem} tabular`}
                    >
                      {describeCandidateRow(
                        alt,
                        snapshot.nights,
                        snapshot.targetPlayers,
                        snapshot.durationSlots,
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </div>
    </section>
  );
}
