import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Bell, CalendarCheck2, Check, ChevronDown, Download, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { formatNightShort, formatSlotInNight, slotToShanghaiParts } from '../src/original/domain/time';
import type { Candidate, GameTag } from '../src/original/domain/types';
import { ConfirmDialog } from './components/ConfirmDialog';
import {
  apiRequest,
  GAME_LABELS,
  formatSlotStamp,
  type Reservation,
  type ReservationDraft,
  type WeekSpan,
  type WriteFn,
} from './types';

type PushState = {
  bound: boolean;
  keyConfigured: boolean;
  quietStart: number | null;
  quietEnd: number | null;
  test: { id: string; status: string } | null;
};

const formatMinute = (n: number | null) =>
  n === null ? '' : `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

const parseMinute = (s: string) =>
  s ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3)) : null;

const PUSH_STATUS_LABELS: Record<string, string> = {
  queued: '已排队，尚未发送',
  sending: '发送中…',
  accepted: 'WxPusher 已受理，尚未确认手机收到',
  confirmed: '你已确认收到',
  unknown: '发送结果未知',
  rejected: '发送被拒绝',
  expired: '已过期',
  muted: '免打扰时段内未发送',
  unbound: '未绑定',
};

const SPT_REGEX = /^SPT_[A-Za-z0-9_-]{16,128}$/;

export function PushSettings({ token, apiBase }: { token: string; apiBase: string }) {
  const [state, setState] = useState<PushState | null>(null);
  const [spt, setSpt] = useState('');
  const [quietStart, setStart] = useState('');
  const [quietEnd, setEnd] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeTone, setNoticeTone] = useState<'info' | 'error'>('info');
  const [busy, setBusy] = useState(false);
  const [unbindDialogOpen, setUnbindDialogOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    apiRequest<PushState>(apiBase, '/api/push', token)
      .then((s: PushState) => {
        if (alive) {
          setState(s);
          setStart(formatMinute(s.quietStart));
          setEnd(formatMinute(s.quietEnd));
        }
      })
      .catch(() => {
        if (alive) {
          setNoticeTone('error');
          setNotice('读取推送设置失败');
        }
      });
    return () => {
      alive = false;
    };
  }, [token, apiBase]);

  useEffect(() => {
    if (busy || !state?.test || !['queued', 'sending'].includes(state.test.status)) return;
    const ctl = new AbortController();
    let timer = setTimeout(poll, 3000);
    async function poll() {
      try {
        if (!document.hidden) {
          const latest = await apiRequest<PushState>(apiBase, '/api/push', token, undefined, ctl.signal);
          if (!ctl.signal.aborted) setState(latest);
        }
      } catch { /* Retry a pending delivery on the next poll. */ }
      if (!ctl.signal.aborted) timer = setTimeout(poll, 3000);
    }
    return () => { ctl.abort(); clearTimeout(timer); };
  }, [state?.test?.id, state?.test?.status, token, apiBase, busy]);

  async function action(path: string, body: object, success: string) {
    if (busy) return;
    setBusy(true);
    setNotice('');
    try {
      const result = await apiRequest<{bound?: boolean; id?: string}>(apiBase, path, token, body);
      setState(old => {
        if (!old) return old;
        if (typeof result.bound === 'boolean') return {...old, bound: result.bound};
        if (result.id && path === '/api/push/test') return {...old, test: {id: result.id, status: 'queued'}};
        if (old.test && path === '/api/push/confirm') return {...old, test: {...old.test, status: 'confirmed'}};
        return old;
      });
      setNoticeTone('info');
      setNotice(success);
      if (path.endsWith('/bind')) setSpt('');
    } catch (e) {
      setNoticeTone('error');
      setNotice(
        e instanceof Error && e.message === 'push_key_not_configured'
          ? '管理员尚未配置加密密钥'
          : e instanceof Error && e.message === 'rate_limited'
            ? '一分钟内仅允许一次测试'
            : '操作未确认，请检查网络或配置',
      );
    } finally {
      setBusy(false);
    }
  }

  const trimmedSpt = spt.trim();
  const sptValid = SPT_REGEX.test(trimmedSpt);
  const quietSame = Boolean(quietStart && quietEnd && quietStart === quietEnd);

  function handleBindSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || !state?.keyConfigured || !sptValid) return;
    void action('/api/push/bind', { spt: trimmedSpt }, '绑定已保存');
  }

  return (
    <section className="paper">
      <div className="cardHeaderRow">
        <h2 className="sectionHeading">WxPusher 通知</h2>
        {state && (
          <span className={state.bound ? 'badgeSuccess' : 'badgeSoft'}>
            <Bell size={13} aria-hidden="true" />
            {state.bound ? '已绑定' : '未绑定'}
          </span>
        )}
      </div>

      <p className="helperText">
        {state
          ? state.bound
            ? '推送凭证已加密保存（出于安全原因不回显）。'
            : '绑定个人 WxPusher SPT 后，队友发车、催促或预约前 10 分钟会收到提醒。'
          : '正在读取推送配置…'}
      </p>

      {state && !state.keyConfigured && (
        <p className="warning">正式服务尚未配置加密密钥，暂不能绑定。</p>
      )}

      <form className="stackForm" onSubmit={handleBindSubmit}>
        <div className="fieldGroup">
          <label className="fieldLabel" htmlFor="push-spt-input">
            个人 SPT 凭证
          </label>
          <input
            id="push-spt-input"
            className="fieldInput"
            type="password"
            autoComplete="off"
            placeholder="粘贴以 SPT_ 开头的个人凭证"
            value={spt}
            onChange={(e) => setSpt(e.target.value)}
          />
          {trimmedSpt.length > 0 && !sptValid && (
            <p className="fieldError">SPT 格式不正确：需以 SPT_ 开头，后接 16–128 位字母/数字/下划线。</p>
          )}
        </div>

        <div className="actionRow">
          <button
            type="submit"
            className="btnPrimary"
            disabled={busy || !state?.keyConfigured || !sptValid}
          >
            {state?.bound ? '更换 SPT' : '绑定 SPT'}
          </button>
          <button
            type="button"
            className="btnSecondary"
            disabled={busy || !state?.bound}
            onClick={() => void action('/api/push/test', {}, '测试任务已排队，等待接口受理')}
          >
            发送测试通知
          </button>
          {state?.bound && (
            <button
              type="button"
              className="btnDangerOutline"
              disabled={busy}
              onClick={() => setUnbindDialogOpen(true)}
            >
              解除绑定
            </button>
          )}
        </div>
      </form>

      {state?.test && (
        <div className="subCard">
          <p className="subCardTitle">最近一次测试推送</p>
          <p className="helperText">{PUSH_STATUS_LABELS[state.test.status] || state.test.status}</p>
          {state.test.status === 'accepted' && (
            <button
              type="button"
              className="btnPrimary"
              disabled={busy}
              onClick={() => void action('/api/push/confirm', { id: state.test!.id }, '已记录实际收到')}
            >
              <Check size={15} aria-hidden="true" />
              <span>我确认手机已收到</span>
            </button>
          )}
        </div>
      )}

      <div className="sectionDivider" />

      <div className="stackForm">
        <h3 className="subHeading">免打扰时段（北京时间）</h3>
        <div className="twoColGrid">
          <label className="fieldGroup">
            <span className="fieldLabel">开始时间</span>
            <input
              className="fieldInput tabular"
              type="time"
              value={quietStart}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label className="fieldGroup">
            <span className="fieldLabel">结束时间</span>
            <input
              className="fieldInput tabular"
              type="time"
              value={quietEnd}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>
        {quietSame && <p className="fieldError">免打扰开始时间与结束时间不能相同。</p>}
        <div className="actionRow">
          <button
            type="button"
            className="btnSecondary"
            disabled={busy || !quietStart || !quietEnd || quietSame}
            onClick={() =>
              void action(
                '/api/push/preferences',
                { quietStart: parseMinute(quietStart), quietEnd: parseMinute(quietEnd) },
                '免打扰已保存',
              )
            }
          >
            保存免打扰
          </button>
          <button
            type="button"
            className="btnGhost"
            disabled={busy}
            onClick={() => {
              setStart('');
              setEnd('');
              void action(
                '/api/push/preferences',
                { quietStart: null, quietEnd: null },
                '免打扰已关闭',
              );
            }}
          >
            关闭免打扰
          </button>
        </div>
      </div>

      {notice && (
        <p role="status" className={noticeTone === 'error' ? 'fieldError' : 'statusBanner'}>
          {notice}
        </p>
      )}

      <ConfirmDialog
        open={unbindDialogOpen}
        title="解除 WxPusher 通知绑定？"
        body="解除后你将不再收到发车、催促及预约提醒推送，后续可随时重新绑定 SPT。"
        confirmLabel="确认解除绑定"
        busy={busy}
        onCancel={() => setUnbindDialogOpen(false)}
        onConfirm={() => {
          setUnbindDialogOpen(false);
          void action('/api/push/unbind', {}, '已解除绑定');
        }}
      />
    </section>
  );
}

type ReservationProps = {
  draft: ReservationDraft | null;
  onDraftConsumed: () => void;
  now: number;
  clientClock?: number;
  me: string;
  members: { id: string; nickname: string }[];
  reservations: Reservation[];
  notice: string;
  game: GameTag;
  custom: string;
  candidates: Candidate[];
  busy: boolean;
  write: WriteFn;
};

export function ReservationPanel({
  draft,
  onDraftConsumed,
  now: serverNow,
  clientClock,
  me,
  members,
  reservations,
  notice,
  game,
  custom,
  candidates,
  busy,
  write,
}: ReservationProps) {
  const [from, setFrom] = useState<number | null>(null);
  const [duration, setDuration] = useState(2);
  const [edit, setEdit] = useState<Reservation | null>(null);
  const [selectedGame, setGame] = useState<GameTag>(game);
  const [title, setTitle] = useState(custom);
  const [cancelTarget, setCancelTarget] = useState<Reservation | null>(null);
  const [conflictNotice, setConflictNotice] = useState(false);
  useEffect(() => {
    if (!draft) return;
    setEdit(null);
    setGame(draft.game);
    setTitle(draft.title);
    setFrom(draft.from);
    setDuration(2);
    setConflictNotice(false);
    onDraftConsumed();
  }, [draft, onDraftConsumed]);

  const [, setSlotTick] = useState(0);
  const currentTime = () => serverNow + (clientClock === undefined ? 0 : Math.max(0, performance.now() - clientClock));
  const now = currentTime();
  const start = Math.floor(now / 1800000) + 1;
  useEffect(() => {
    if (clientClock === undefined) return;
    const tick = () => setSlotTick(value => value + 1);
    const delay = start * 1800000 - (serverNow + Math.max(0, performance.now() - clientClock));
    const timer = setTimeout(tick, Math.max(1, Math.ceil(delay)));
    document.addEventListener('visibilitychange', tick);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', tick); };
  }, [start, serverNow, clientClock]);
  const firstDayStart = Math.floor((now + 7200000) / 86400000) * 48 - 4;
  const end = firstDayStart + 336;

  // Group available slots into 7 logical days (06:00–next day 06:00)
  const dayGroups = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const dayFrom = firstDayStart + i * 48;
      const dayTo = dayFrom + 48;
      const dateKey = slotToShanghaiParts(dayFrom).dateKey;
      const validSlots: number[] = [];
      for (let s = Math.max(start, dayFrom); s < Math.min(end, dayTo); s++) {
        validSlots.push(s);
      }
      return { dateKey, dayFrom, dayTo, slots: validSlots };
    }).filter((d) => d.slots.length > 0);
  }, [firstDayStart, start, end]);

  const effectiveFrom = from ?? start;
  const staleStart = from !== null && (from < start || from >= end);

  const selectedDay =
    dayGroups.find((d) => effectiveFrom >= d.dayFrom && effectiveFrom < d.dayTo) ?? dayGroups[0];

  const customMissing = !edit && selectedGame === 'custom' && !title.trim();
  const exceedsRange = effectiveFrom + duration > end;
  const conflict = reservations.find(r => r.id !== edit?.id && r.state !== 'cancelled' && r.from_slot < effectiveFrom + duration && r.to_slot > effectiveFrom);
  const nextFreeStart = staleStart ? dayGroups.flatMap(day => day.slots).find(slot =>
    slot + duration <= end && !reservations.some(r => r.id !== edit?.id && r.state !== 'cancelled'
      && r.from_slot < slot + duration && r.to_slot > slot)) : undefined;
  const valid = !staleStart && !exceedsRange && !customMissing && !conflict;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    if (effectiveFrom * 1800000 <= currentTime()) {
      setSlotTick(value => value + 1);
      return;
    }
    const ok = edit
      ? await write(
          `/api/reservations/${edit.id}/change`,
          { revision: edit.revision, from: effectiveFrom, to: effectiveFrom + duration },
          false,
          `res-edit-${edit.id}`,
        )
      : await write(
          '/api/reservations',
          { game: selectedGame, title: title.trim(), from: effectiveFrom, to: effectiveFrom + duration },
          true,
          'res-create',
        );
    if (ok) { setEdit(null); setConflictNotice(false); }
    else setConflictNotice(true);
  }

  return (
    <section id="reservations" className="paper">
      <div className="cardHeaderRow">
        <h2 className="sectionHeading">提前预约</h2>
        <span className="badgeSoft">
          <CalendarCheck2 size={13} aria-hidden="true" />
          提前10分钟提醒
        </span>
      </div>
      <p className="helperText">三人均须确认，未取消的预约时间不可重叠。</p>
      {notice && <p role="status" className="helperText">{notice}</p>}

      {candidates.length > 0 && (
        <div className="quickChipRow">
          {candidates.slice(0, 3).map((c) => (
            <button
              key={`${c.nightId}:${c.firstStart}`}
              type="button"
              className="btnChipAccent tabular"
              onClick={() => {
                setFrom(c.firstStart);
                setDuration(Math.min(8, Math.max(1, c.availableUntil - c.firstStart)));
              }}
            >
              填入共同空闲：{formatSlotStamp(c.firstStart)}
            </button>
          ))}
        </div>
      )}

      <form id="reservation-form" className="subCard stackForm" onSubmit={(e) => void submit(e)}>
        <div className="cardHeaderRow">
          <h3 className="subHeading">{edit ? `变更预约 · ${edit.title}` : '发起新预约'}</h3>
          {edit && (
            <button type="button" className="btnGhostSm" onClick={() => setEdit(null)}>
              取消编辑
            </button>
          )}
        </div>

        {!edit && (
          <div className="fieldGroup">
            <label className="fieldLabel" htmlFor="res-game-select">
              游戏
            </label>
            <select
              id="res-game-select"
              className="fieldSelect"
              value={selectedGame}
              onChange={(e) => setGame(e.target.value as GameTag)}
            >
              {Object.entries(GAME_LABELS).map(([g, label]) => (
                <option key={g} value={g}>
                  {label}
                </option>
              ))}
            </select>
            {selectedGame === 'custom' && (
              <>
                <input
                  aria-label="自定义游戏"
                  className="fieldInput"
                  placeholder="输入游戏名称"
                  maxLength={32}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                {customMissing && <p className="fieldHint">请输入自定义游戏名称。</p>}
              </>
            )}
          </div>
        )}

        <div className="fieldGroup">
          <span className="fieldLabel">选择日期</span>
          <div className="pillTabs" role="tablist" aria-label="预约日期">
            {dayGroups.map((d) => {
              const active = selectedDay?.dateKey === d.dateKey;
              return (
                <button
                  key={d.dateKey}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`pillTab tabular ${active ? 'isSelected' : ''}`}
                  onClick={() => setFrom(d.slots[0])}
                >
                  {formatNightShort(d.dateKey)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="twoColGrid">
          <label className="fieldGroup">
            <span className="fieldLabel">开始时间</span>
            <select
              className="fieldSelect tabular"
              value={effectiveFrom}
              onChange={(e) => setFrom(Number(e.target.value))}
            >
              {staleStart && <option value={effectiveFrom} disabled>{formatSlotStamp(effectiveFrom)}（已失效）</option>}
              {(selectedDay?.slots ?? []).map((s) => (
                <option key={s} value={s}>
                  {formatSlotInNight(s, selectedDay.dateKey)}
                </option>
              ))}
            </select>
          </label>

          <label className="fieldGroup">
            <span className="fieldLabel">预计时长</span>
            <select
              className="fieldSelect tabular"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            >
              {Array.from({ length: 16 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {(i + 1) / 2} 小时
                </option>
              ))}
            </select>
          </label>
        </div>

        {from === null && <p className="fieldHint">默认从下一个半小时开始，可自行选择时间。</p>}
        {staleStart && <div role="status" className="stackForm">
          <p className="fieldError">原选时间 {formatSlotStamp(effectiveFrom)} 已失效，请重新选择。</p>
          {nextFreeStart !== undefined && <button type="button" className="btnGhostSm" onClick={() => setFrom(nextFreeStart)}>
            改选 {formatSlotStamp(nextFreeStart)}
          </button>}
        </div>}
        {!staleStart && conflict && <div className="stackForm"><p role="alert" className="fieldError">这个时间已有预约</p><button type="button" className="btnGhostSm" onClick={() => { const el=document.getElementById('reservation-'+conflict.id); el?.focus({preventScroll:true}); el?.scrollIntoView({behavior:'smooth',block:'start'}); }}>查看该预约</button></div>}
        {conflictNotice && !conflict && <p role="status" className="helperText">提交未成功，请检查顶部提示，或改选其他时段后重试。</p>}
        {exceedsRange && <p className="fieldError">结束时间超出了未来 7 天范围，请缩短时长或提前开始时间。</p>}

        <button type="submit" className="btnPrimary btnFull" disabled={busy || !valid}>
          {edit ? '提交改期（需三人重新确认）' : '发起预约'}
        </button>
      </form>

      {reservations.length > 0 && (
        <div className="stackGroup">
          {reservations.map((r) => {
            const myConfirmed = Boolean(me === 'm1' ? r.r1 : me === 'm2' ? r.r2 : r.r3);
            const canAct = r.state !== 'cancelled' && r.from_slot * 1800000 > now;
            return (
              <div id={`reservation-${r.id}`} className="subCard reservationCard" key={r.id} tabIndex={-1}>
                <div className="cardHeaderRow">
                  <strong className="subCardTitle">{r.title}</strong>
                  <span
                    className={
                      r.state === 'confirmed'
                        ? 'badgeSuccess'
                        : r.state === 'cancelled'
                          ? 'badgeMuted'
                          : 'badgeAmber'
                    }
                  >
                    {r.state === 'confirmed'
                      ? '三人已确认'
                      : r.state === 'cancelled'
                        ? '已取消'
                        : '待确认'}
                  </span>
                </div>
                <p className="subCardTime tabular">
                  {formatSlotStamp(r.from_slot)} – {formatSlotStamp(r.to_slot)}
                </p>
                <div className="memberConfirmRow">
                  {members.map((m) => {
                    const ok = Boolean(m.id === 'm1' ? r.r1 : m.id === 'm2' ? r.r2 : r.r3);
                    return (
                      <span key={m.id} className={`confirmPill ${ok ? 'isConfirmed' : ''}`}>
                        {m.nickname} · {ok ? '已确认' : '待确认'}
                      </span>
                    );
                  })}
                </div>
                {canAct && (
                  <div className="actionRow">
                    {r.state === 'pending' && !myConfirmed && (
                      <button
                        type="button"
                        className="btnPrimary"
                        disabled={busy}
                        onClick={() =>
                          void write(
                            `/api/reservations/${r.id}/confirm`,
                            { revision: r.revision },
                            false,
                            `res-confirm-${r.id}`,
                          )
                        }
                      >
                        确认参加
                      </button>
                    )}
                    <button
                      type="button"
                      className="btnSecondary"
                      disabled={busy}
                      onClick={() => {
                        setEdit(r);
                        setFrom(r.from_slot);
                        setDuration(r.to_slot - r.from_slot);
                      }}
                    >
                      改期
                    </button>
                    <button
                      type="button"
                      className="btnDangerOutline"
                      disabled={busy}
                      onClick={() => setCancelTarget(r)}
                    >
                      取消预约
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="取消此次预约？"
        body={
          cancelTarget
            ? `取消「${cancelTarget.title}」（${formatSlotStamp(cancelTarget.from_slot)}）后会通知全部三位成员。`
            : ''
        }
        confirmLabel="确认取消预约"
        busy={busy}
        onCancel={() => setCancelTarget(null)}
        onConfirm={() => {
          const target = cancelTarget;
          setCancelTarget(null);
          if (target) {
            void write(
              `/api/reservations/${target.id}/cancel`,
              { revision: target.revision },
              false,
              `res-cancel-${target.id}`,
            );
          }
        }}
      />
    </section>
  );
}

const DAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const ORDERED_DAYS = [1, 2, 3, 4, 5, 6, 0];

function formatTemplateClock(slot: number) {
  const h = 6 + Math.floor(slot / 2);
  return `${h >= 24 ? '次日 ' : ''}${String(h % 24).padStart(2, '0')}:${slot % 2 ? '30' : '00'}`;
}

export function WeeklyTemplate({
  member,
  now,
  busy,
  write,
}: {
  member: { schedule_revision: number; template?: WeekSpan[]; overrideDays?: number[] };
  now: number;
  busy: boolean;
  write: WriteFn;
}) {
  const [draft, setDraft] = useState<WeekSpan[]>(member.template || []);
  const [dirty, setDirty] = useState(false);
  const [base, setBase] = useState(member.schedule_revision);
  const [activeDay, setActiveDay] = useState<number>(1);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!dirty) {
      setDraft(member.template || []);
      setBase(member.schedule_revision);
    }
  }, [member.schedule_revision, member.template, dirty]);

  const editSpan = (i: number, key: 'from' | 'to', value: number) => {
    setDirty(true);
    setNotice('');
    setDraft((old) => old.map((x, j) => (i === j ? { ...x, [key]: value } : x)));
  };

  const conflict = dirty && base !== member.schedule_revision;
  const hasInvalidSpan = draft.some((x) => x.to <= x.from);

  async function save() {
    if (conflict || hasInvalidSpan || busy) return;
    const ok = await write('/api/schedule/template', { revision: base, template: draft }, true, 'save-weekly');
    if (ok) {
      setDirty(false);
      setNotice('周模板已保存；已有单日临时修改保持不变。');
    }
  }

  const start = Math.floor((now + 7200000) / 86400000) * 48 - 4;
  const activeOverrides = (member.overrideDays || []).filter(
    (day) => day >= start && day < start + 336,
  );

  const activeDaySpans = draft
    .map((span, idx) => ({ span, idx }))
    .filter((item) => item.span.day === activeDay);

  return (
    <section className="paper">
      <div className="cardHeaderRow">
        <h2 className="sectionHeading">每周空闲模板</h2>
        <span className="badgeSoft tabular">已设 {draft.length} 段</span>
      </div>
      <p className="helperText">按周自动填充未来七天；单日临时修改优先于模板。</p>

      {conflict && <p className="warning">模板版本已在其他设备更新，请先放弃本地草稿再重新编辑。</p>}

      <details className="disclosureInner">
        <summary className="disclosureSummaryInner">
          <span>展开编辑每周模板</span>
          <ChevronDown size={17} className="disclosureChevron" aria-hidden="true" />
        </summary>

        <div className="stackForm disclosureContentInner">
          <div className="pillTabs" role="tablist" aria-label="选择星期">
            {ORDERED_DAYS.map((day) => {
              const count = draft.filter((x) => x.day === day).length;
              return (
                <button
                  key={day}
                  type="button"
                  role="tab"
                  aria-selected={activeDay === day}
                  className={`pillTab ${activeDay === day ? 'isSelected' : ''}`}
                  onClick={() => setActiveDay(day)}
                >
                  <span>{DAY_LABELS[day]}</span>
                  {count > 0 && <span className="pillDot" aria-hidden="true" />}
                </button>
              );
            })}
          </div>

          <div className="subCard stackForm">
            <div className="cardHeaderRow">
              <strong className="subCardTitle">{DAY_LABELS[activeDay]}固定空闲</strong>
              <button
                type="button"
                className="btnGhostSm"
                disabled={draft.length >= 56}
                onClick={() => {
                  setDirty(true);
                  setNotice('');
                  setDraft((a) => [...a, { day: activeDay, from: 28, to: 32 }]);
                }}
              >
                <Plus size={14} aria-hidden="true" />
                <span>添加时段</span>
              </button>
            </div>

            {activeDaySpans.length === 0 ? (
              <p className="helperText">{DAY_LABELS[activeDay]}暂未配置固定空闲时段。</p>
            ) : (
              activeDaySpans.map(({ span, idx }) => (
                <div key={idx} className="templateSpanRow">
                  <select
                    aria-label={`${DAY_LABELS[activeDay]}开始时间`}
                    className="fieldSelect tabular"
                    value={span.from}
                    onChange={(e) => editSpan(idx, 'from', Number(e.target.value))}
                  >
                    {Array.from({ length: 48 }, (_, n) => (
                      <option key={n} value={n}>
                        {formatTemplateClock(n)}
                      </option>
                    ))}
                  </select>
                  <span className="rangeDash" aria-hidden="true">
                    至
                  </span>
                  <select
                    aria-label={`${DAY_LABELS[activeDay]}结束时间`}
                    className="fieldSelect tabular"
                    value={span.to}
                    onChange={(e) => editSpan(idx, 'to', Number(e.target.value))}
                  >
                    {Array.from({ length: 48 }, (_, n) => (
                      <option key={n + 1} value={n + 1}>
                        {formatTemplateClock(n + 1)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btnIconDanger"
                    aria-label="删除该时段"
                    onClick={() => {
                      setDirty(true);
                      setDraft((a) => a.filter((_, j) => j !== idx));
                    }}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>
              ))
            )}
          </div>

          {hasInvalidSpan && <p className="fieldError">存在结束时间早于或等于开始时间的时段，请先修正。</p>}

          <div className="actionRow">
            <button
              type="button"
              className="btnPrimary"
              disabled={busy || !dirty || conflict || hasInvalidSpan}
              onClick={() => void save()}
            >
              保存周模板
            </button>
            {dirty && (
              <button
                type="button"
                className="btnGhost"
                onClick={() => {
                  setDraft(member.template || []);
                  setDirty(false);
                  setBase(member.schedule_revision);
                  setNotice('');
                }}
              >
                放弃草稿
              </button>
            )}
          </div>
        </div>
      </details>

      {activeOverrides.length > 0 && (
        <div className="overrideGroup">
          <p className="fieldLabel">单日临时修改（点击恢复周模板）</p>
          <div className="quickChipRow">
            {activeOverrides.map((day) => (
              <button
                key={day}
                type="button"
                className="btnChip tabular"
                disabled={busy}
                onClick={() =>
                  void write(
                    '/api/schedule/reset-day',
                    { day, revision: member.schedule_revision },
                    true,
                    `reset-day-${day}`,
                  )
                }
              >
                {formatSlotStamp(day).split(' ')[0]} 恢复模板
              </button>
            ))}
          </div>
        </div>
      )}

      {notice && (
        <p role="status" className="statusBanner">
          {notice}
        </p>
      )}
    </section>
  );
}

export function VersionSettings({ token, apiBase }: { token: string; apiBase: string }) {
  const current = import.meta.env.VITE_APP_VERSION || '0.1.0';
  const [notice, setNotice] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  async function check() {
    setBusy(true);
    setUrl('');
    setNotice('');
    try {
      const d = await apiRequest<{available: boolean; versionCode: number; version: string; url?: string}>(
        apiBase, '/api/version', token,
      );
      const parts = current.split('.').map(Number);
      const code = parts[0] * 1000000 + parts[1] * 1000 + parts[2];
      if (!d.available) {
        setNotice('尚无正式签名发布版。');
      } else if (
        d.versionCode > code &&
        typeof d.url === 'string' &&
        d.url.startsWith('https://github.com/rainy256/qidongapp/releases/download/')
      ) {
        setNotice(`发现新版本 ${d.version}`);
        setUrl(d.url);
      } else {
        setNotice('当前已是最新版本。');
      }
    } catch {
      setNotice('检查失败，请稍后重试。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="paper">
      <div className="cardHeaderRow">
        <h2 className="sectionHeading">版本更新</h2>
        <span className="badgeSoft tabular">v{current}</span>
      </div>
      <div className="actionRow">
        <button type="button" className="btnSecondary" disabled={busy} onClick={() => void check()}>
          <RefreshCw size={15} aria-hidden="true" />
          <span>{busy ? '检查中…' : '检查更新'}</span>
        </button>
        {url && (
          <a className="btnPrimary linkBtn" href={url} target="_blank" rel="noreferrer">
            <Download size={15} aria-hidden="true" />
            <span>下载正式签名 APK</span>
          </a>
        )}
      </div>
      {notice && (
        <p role="status" className="statusBanner">
          {notice}
        </p>
      )}
    </section>
  );
}
