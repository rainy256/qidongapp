import type { FormEvent } from 'react';
import { BellRing, ChevronDown, Clock, Send, Sparkles } from 'lucide-react';
import { AvatarDot, SeatRow } from '../../src/original/components/AvatarChip';
import { GameStickerArt, HeroSquadIllustration } from '../../src/original/components/GameArtwork';
import ticket from '../../src/original/components/RecommendationCard.module.css';
import type { GameTag } from '../../src/original/domain/types';
import {
  GAME_LABELS,
  REPLY_LABELS,
  formatTimestamp,
  memberReply,
  type Invite,
  type Snapshot,
  type WriteFn,
} from '../types';

type HomeViewProps = Readonly<{
  snap: Snapshot;
  game: GameTag;
  custom: string;
  busy: boolean;
  busyKey: string | null;
  onGameChange: (g: GameTag) => void;
  onCustomChange: (v: string) => void;
  write: WriteFn;
}>;

export function HomeView({
  snap,
  game,
  custom,
  busy,
  busyKey,
  onGameChange,
  onCustomChange,
  write,
}: HomeViewProps) {
  const activeInvites = snap.invites.filter((i) => i.status !== 'expired');
  const expiredInvites = snap.invites.filter((i) => i.status === 'expired');
  const customEmpty = game === 'custom' && !custom.trim();

  function handleLaunch(e: FormEvent) {
    e.preventDefault();
    if (busy || customEmpty) return;
    void write('/api/invites', { game, title: custom.trim() }, true, 'launch-invite');
  }

  function renderTicket(inv: Invite) {
    const myReply = memberReply(inv, snap.me.id);
    const nudgeTargets = snap.members.filter(
      (m) => m.id !== snap.me.id && !['ready', 'no'].includes(memberReply(inv, m.id)),
    );

    return (
      <section
        id={`invite-${inv.id}`}
        key={inv.id}
        className={`${ticket.ticket} ${inv.status === 'assembled' ? ticket.ticketReady : ''} ${
          inv.status === 'expired' ? 'ticketExpired' : ''
        }`}
      >
        <div className={ticket.ticketTop}>
          <GameStickerArt game={inv.game} size={64} />
          <div className={ticket.ticketHeadInfo}>
            <div className={ticket.stampRow}>
              <span
                className={
                  inv.status === 'assembled'
                    ? ticket.readyBadge
                    : inv.status === 'pending'
                      ? ticket.amberBadge
                      : ticket.neutralBadge
                }
              >
                {inv.status === 'assembled'
                  ? '集结成功'
                  : inv.status === 'expired'
                    ? '已过期'
                    : '等待队友'}
              </span>
            </div>
            <h2 className={ticket.roomTitle}>{inv.title}</h2>
            <p className={`${ticket.roomMeta} tabular`}>
              {formatTimestamp(inv.created_at)} · 三人发车
            </p>
          </div>
        </div>

        <div className={ticket.perforation}>
          <span className={ticket.notchLeft} />
          <span className={ticket.dashedLine} />
          <span className={ticket.notchRight} />
        </div>

        <div className={ticket.ticketBottom}>
          <SeatRow
            targetPlayers={3}
            players={snap.members
              .filter((m) => memberReply(inv, m.id) === 'ready')
              .map((m) => ({ id: m.id, name: m.nickname, isMe: m.id === snap.me.id }))}
          />

          <div className="replyList">
            {snap.members.map((m) => {
              const r = memberReply(inv, m.id);
              return (
                <div key={m.id} className="replyMemberRow">
                  <span className="replyMemberName">
                    {m.nickname}
                    {m.id === snap.me.id ? '（我）' : ''}
                  </span>
                  <span className={`replyPill replyPill_${r}`}>{REPLY_LABELS[r] || r}</span>
                </div>
              );
            })}
          </div>

          {inv.status === 'pending' && (
            <div className="ticketActionGroup">
              <div className="replyButtons" role="group" aria-label="回复车票状态">
                {Object.keys(REPLY_LABELS)
                  .filter((x) => x !== 'pending')
                  .map((r) => {
                    const key = `reply-${inv.id}-${r}`;
                    const isSelected = myReply === r;
                    return (
                      <button
                        key={r}
                        type="button"
                        disabled={busy}
                        className={`btnChip ${isSelected ? 'isSelected' : ''} ${
                          r === 'ready' ? 'btnChipReady' : ''
                        }`}
                        onClick={() =>
                          void write(
                            `/api/invites/${inv.id}/reply`,
                            { reply: r, revision: inv.revision },
                            true,
                            key,
                          )
                        }
                      >
                        {busyKey === key ? '提交中…' : REPLY_LABELS[r]}
                      </button>
                    );
                  })}
              </div>

              {nudgeTargets.length > 0 && (
                <div className="nudgeRow">
                  {nudgeTargets.map((m) => {
                    const key = `nudge-${inv.id}-${m.id}`;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        className="btnGhostSm"
                        disabled={busy}
                        onClick={() =>
                          void write(
                            `/api/invites/${inv.id}/nudge`,
                            { recipient: m.id },
                            true,
                            key,
                          )
                        }
                      >
                        <BellRing size={14} aria-hidden="true" />
                        <span>{busyKey === key ? '催促中…' : `催促 ${m.nickname}`}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <p className="ticketFoot tabular">
            <Clock size={13} aria-hidden="true" />
            <span>有效至 {formatTimestamp(inv.expires_at)}</span>
          </p>
        </div>
      </section>
    );
  }

  return (
    <>
      {activeInvites.length > 0 && (
        <div className="stackGroup" aria-label="进行中的约局车票">
          {activeInvites.map(renderTicket)}
        </div>
      )}

      <section className="paper squadCard">
        <div className="squadTop">
          <div className="squadArt">
            <HeroSquadIllustration />
          </div>
          <div className="squadIntro">
            <h2 className="sectionHeading">开黑小队</h2>
            <p className="sectionSub">随时叫上熟悉的伙伴，一键发车。</p>
          </div>
        </div>
        <div className="members">
          {snap.members.map((m) => {
            const online = Boolean(m.last_seen && snap.now - m.last_seen < 90000);
            return (
              <div key={m.id} className="memberItem">
                <AvatarDot name={m.nickname} seed={m.id} isMe={m.id === snap.me.id} />
                <strong className="memberName">{m.nickname}</strong>
                <span className={`onlinePill ${online ? 'isOnline' : ''}`}>
                  <span className="statusDot" aria-hidden="true" />
                  {online ? '近期在线' : '未近期活跃'}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="paper">
        <div className="cardHeaderRow">
          <h2 className="sectionHeading">今晚玩什么？</h2>
          <span className="badgeSoft">
            <Sparkles size={13} aria-hidden="true" />
            即时推送
          </span>
        </div>

        <form className="stackForm" onSubmit={handleLaunch}>
          <div className="gameGrid" role="radiogroup" aria-label="选择游戏">
            {(Object.keys(GAME_LABELS) as GameTag[]).map((g) => (
              <button
                key={g}
                type="button"
                role="radio"
                aria-checked={game === g}
                className={`gameTile ${game === g ? 'isSelected' : ''}`}
                onClick={() => onGameChange(g)}
              >
                <GameStickerArt game={g} size={60} />
                <span className="gameTileLabel">{GAME_LABELS[g]}</span>
              </button>
            ))}
          </div>

          {game === 'custom' && (
            <div className="fieldGroup">
              <label className="fieldLabel" htmlFor="custom-game-name">
                自定义游戏名称
              </label>
              <input
                id="custom-game-name"
                className="fieldInput"
                placeholder="例如：绝地求生、CS2、瓦罗兰特"
                value={custom}
                maxLength={32}
                onChange={(e) => onCustomChange(e.target.value)}
              />
              {customEmpty && <p className="fieldHint">请输入自定义游戏名称后再发车。</p>}
            </div>
          )}

          <button
            type="submit"
            className="btnPrimary btnFull"
            disabled={busy || customEmpty}
          >
            <Send size={16} aria-hidden="true" />
            <span>{busyKey === 'launch-invite' ? '正在发车…' : '立即启动'}</span>
          </button>
          <p className="helperText">
            邀请会同步到消息中心，已绑定 WxPusher SPT 的队友会收到推送提醒。
          </p>
        </form>
      </section>

      {activeInvites.length === 0 && expiredInvites.length === 0 && (
        <section className="paper emptyState">
          <p className="emptyStateTitle">还没有约局车票</p>
          <p className="helperText">选一个游戏点「立即启动」，通知队友马上集合。</p>
        </section>
      )}

      {expiredInvites.length > 0 && (
        <details className="disclosureCard">
          <summary className="disclosureSummary">
            <span>历史已过期车票（{expiredInvites.length}）</span>
            <ChevronDown size={18} className="disclosureChevron" aria-hidden="true" />
          </summary>
          <div className="disclosureBody">{expiredInvites.map(renderTicket)}</div>
        </details>
      )}
    </>
  );
}
