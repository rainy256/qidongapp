import { useEffect, useState, type FormEvent } from 'react';
import { BellRing, ChevronDown, Clock, Send, Sparkles } from 'lucide-react';
import { AvatarDot, SeatRow } from '../../src/original/components/AvatarChip';
import { GameStickerArt, HeroSquadIllustration } from '../../src/original/components/GameArtwork';
import ticket from '../../src/original/components/RecommendationCard.module.css';
import type { Candidate, GameTag } from '../../src/original/domain/types';
import { rebookOptions } from '../rebook.mjs';
import {
  GAME_LABELS,
  REPLY_LABELS,
  formatTimestamp,
  memberReply,
  memberEta,
  relativeTime,
  tonightDeadline,
  type ReservationDraft,
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
  candidates: Candidate[];
  onRebook: (draft: ReservationDraft) => void;
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
  candidates,
  onRebook,
  write,
}: HomeViewProps) {
  const [tick, setTick] = useState(() => performance.now());
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [availabilityRetry, setAvailabilityRetry] = useState<string | null>(null);
  const [rebookOpen, setRebookOpen] = useState<string | null>(null);
  const [moreOptions, setMoreOptions] = useState(false);
  const [waitWarning, setWaitWarning] = useState<{id:string;reply:string} | null>(null);
  useEffect(() => {
    const timer = setInterval(() => setTick(performance.now()), 500);
    const update = () => setTick(performance.now());
    document.addEventListener('visibilitychange', update);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', update); };
  }, []);
  const now = snap.now + Math.max(0, tick - (snap.clientClock ?? tick));
  const invites = snap.invites.map(i => i.expires_at <= now ? {...i, status:'expired' as const} : i);
  const activeInvites = invites.filter(i => i.status !== 'expired');
  const expiredInvites = invites.filter(i => i.status === 'expired');
  const callable = snap.members.filter(m => (m.available_until ?? 0) > now);
  const missing = snap.members.filter(m => (m.available_until ?? 0) <= now);
  const me = snap.members.find(m => m.id === snap.me.id);
  const myUntil = me?.available_until ?? 0;
  const options = rebookOptions(candidates, snap.reservations, now);
  const unanswered = snap.members.filter(m => m.scheduleStatus === 'unanswered' || (!m.scheduleStatus && !m.schedule.length));
  const rebookEnabled = snap.features?.rebook === true;
  async function availability(choice:string) {
    if (busy || !me || me.availability_revision === undefined) return;
    const ok = await write('/api/availability', {choice, revision:me.availability_revision}, true, 'availability-'+choice);
    setAvailabilityRetry(ok ? null : choice);
    if (ok) setAvailabilityOpen(false);
  }
  function book(inv:Invite, from:number|null) {
    onRebook({game:inv.game,title:inv.title,from});
  }
  function toggleRebook(inv:Invite) {
    if (!rebookEnabled) { book(inv,null); return; }
    setRebookOpen(v => v === inv.id ? null : inv.id);
    setMoreOptions(false);
  }
  function renderRebook(inv:Invite) {
    return <div className="stackForm rebookOptions">
      <button type="button" className="btnSecondary btnFull" onClick={() => toggleRebook(inv)}>换个时间约</button>
      {rebookEnabled && rebookOpen === inv.id && <>
        {unanswered.length > 0 ? <p className="helperText">{unanswered.map(m=>m.nickname).join('、')}还没填时间</p> : options.length === 0 ? <p className="helperText">未来七天还没有共同空闲（已避开现有预约）</p> : <>
          {(moreOptions ? options : options.slice(0,1)).map(o => <div key={o.from} className="subCard stackForm">
            <strong>{relativeTime(o.from*1800000,now)} – {relativeTime(o.to*1800000,now)}，三人都有空</strong>
            <button type="button" className="btnPrimary btnFull" onClick={()=>book(inv,o.from)}>用这个时间约 {inv.title}</button>
          </div>)}
          {options.length > 1 && !moreOptions && <button type="button" className="btnGhostSm" onClick={()=>setMoreOptions(true)}>看其他时间</button>}
        </>}
        <button type="button" className="btnGhostSm" onClick={()=>book(inv,null)}>手动选时间</button>
      </>}
    </div>;
  }
  const customEmpty = game === 'custom' && !custom.trim();

  function handleLaunch(e: FormEvent) {
    e.preventDefault();
    if (busy || customEmpty) return;
    void write('/api/invites', { game, title: custom.trim() }, true, 'launch-invite');
  }

  function renderTicket(inv: Invite) {
    const myReply = memberReply(inv, snap.me.id);
    const waiting = ['5','10','30'].includes(myReply);
    const warning = waitWarning?.id === inv.id ? waitWarning : null;
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
              const eta = memberEta(inv, m.id);
              const label = eta !== null && ['5','10','30'].includes(r) ? (eta <= now ? '原预计 '+relativeTime(eta,now)+' 到，待本人确认' : '预计 '+relativeTime(eta,now)+' 到') : REPLY_LABELS[r] || r;
              return (
                <div key={m.id} className="replyMemberRow">
                  <span className="replyMemberName">
                    {m.nickname}
                    {m.id === snap.me.id ? '（我）' : ''}
                  </span>
                  <span className={`replyPill replyPill_${r}`}>{label}</span>
                </div>
              );
            })}
          </div>

          {inv.status === 'pending' && (
            <div className="ticketActionGroup">
              <div className="replyButtons" role="group" aria-label="回复车票状态">
                {(waiting ? ['ready','5','10','30','no'] : Object.keys(REPLY_LABELS).filter(x=>x!=='pending'))
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
                        onClick={() => {
                          if (['5','10','30'].includes(r) && now+Number(r)*60000>=inv.expires_at) {
                            setWaitWarning({id:inv.id,reply:r});
                            return;
                          }
                          setWaitWarning(null);
                          void write(`/api/invites/${inv.id}/reply`, {reply:r,revision:inv.revision},true,key);
                        }}
                      >
                        {busyKey === key ? '提交中…' : waiting && r==='ready' ? '我到了' : waiting && r==='5' ? '再等 5 分钟' : REPLY_LABELS[r]}
                      </button>
                    );
                  })}
              </div>

              {warning && <div className="stackForm">
                <p role="alert" className="fieldError">这张车票会先到期</p>
                <button type="button" className="btnGhostSm" disabled={busy} onClick={()=>{
                  setWaitWarning(null);
                  void write(`/api/invites/${inv.id}/reply`,{reply:warning.reply,revision:inv.revision},true,`reply-${inv.id}-${warning.reply}`);
                }}>仍然等待</button>
                {renderRebook(inv)}
                <button type="button" className="btnGhostSm" onClick={()=>setWaitWarning(null)}>取消</button>
              </div>}
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

          {!warning && rebookEnabled && (inv.status==='expired' && !snap.members.every(m=>memberReply(inv,m.id)==='ready') || inv.status==='pending' && snap.members.some(m=>memberReply(inv,m.id)==='no')) && renderRebook(inv)}
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
            const online = Boolean(m.last_seen && now - m.last_seen < 90000);
            const isMe = m.id===snap.me.id;
            const until = m.available_until ?? 0;
            const available = until > now;
            return (
              <div key={m.id} className="memberItem">
                <AvatarDot name={m.nickname} seed={m.id} isMe={m.id === snap.me.id} />
                <div className="memberIdentity">
                  <strong className="memberName">{isMe ? '我' : m.nickname}</strong>
                  <span className={`onlinePill ${online ? 'isOnline' : ''}`}><span className="statusDot" aria-hidden="true" />{online ? '近期在线' : '未近期活跃'}</span>
                </div>
                <span className={`availabilityStatus ${available ? 'isCallable' : ''}`}>{available ? '可喊到 '+relativeTime(until,now) : '未表态'}</span>
                {isMe && m.availability_revision !== undefined && <div className="availabilityActions">
                  <button type="button" className="btnGhostSm" disabled={busy} onClick={()=>setAvailabilityOpen(v=>!v)}>{available ? '延长' : '我现在可喊'}</button>
                  {available && <button type="button" className="btnGhostSm" disabled={busy} onClick={()=>void availability('end')}>提前结束</button>}
                </div>}
              </div>
            );
          })}
        </div>
        {availabilityOpen && <div className="quickChipRow">
          <button type="button" className="btnChip" disabled={busy} onClick={()=>void availability('1h')}>{myUntil>now?'延长 1 小时':'接下来 1 小时'}</button>
          <button type="button" className="btnChip" disabled={busy} onClick={()=>void availability('2h')}>{myUntil>now?'延长 2 小时':'接下来 2 小时'}</button>
          {tonightDeadline(now)>Math.max(now,myUntil) && <button type="button" className="btnChip" disabled={busy} onClick={()=>void availability('tonight')}>到今晚 23:00</button>}
        </div>}
        {availabilityRetry && <div role="alert" className="warning warningRow"><span>状态提交未确认，请重试</span><button type="button" className="btnGhostSm" disabled={busy} onClick={()=>void availability(availabilityRetry)}>重试</button></div>}
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

          {callable.length===3 ? <p className="statusBanner">三人现在都可喊，最早到 {relativeTime(Math.min(...callable.map(m=>m.available_until!)),now)}</p> : callable.length>0 ? <p className="helperText">已有 {callable.length} 人可喊，{missing.map(m=>m.id===snap.me.id?'我':m.nickname).join('、')}未表态</p> : null}
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
