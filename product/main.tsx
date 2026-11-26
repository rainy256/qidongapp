import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@capacitor/app';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Bell, Calendar, Home, RefreshCw, User } from 'lucide-react';
import { AvatarDot } from '../src/original/components/AvatarChip';
import { HeroSquadIllustration } from '../src/original/components/GameArtwork';
import { mergeSpans, recommend } from '../src/original/domain/recommend';
import {
  formatNightWeekday,
  formatSlotInNight,
  slotToShanghaiParts,
} from '../src/original/domain/time';
import type { Answer, GameTag, Night, RoomSnapshot, Submission } from '../src/original/domain/types';
import '../src/original/styles/tokens.css';
import '../src/original/styles/global.css';
import './product.css';
import { AccountPanel } from './account';
import { HomeView } from './components/HomeView';
import { MessagesView } from './components/MessagesView';
import { ScheduleEditor } from './components/ScheduleEditor';
import { PushSettings, ReservationPanel, VersionSettings, WeeklyTemplate } from './features';
import { createRefreshGate } from './refresh-gate.mjs';
import {
  ApiError,
  apiRequest,
  formatErrorMessage,
  type Page,
  type Snapshot,
  type WriteFn,
} from './types';

const apiBase = (import.meta.env.VITE_APP_API || 'https://qidong.apexdaishi.xyz/app-api').replace(/\/$/, '');

const SecureSession = registerPlugin<{
  get(): Promise<{ token?: string }>;
  set(input: { token: string }): Promise<void>;
  clear(): Promise<void>;
}>('SecureSession');

const NAV_TABS: { id: Page; label: string }[] = [
  { id: 'home', label: '首页' },
  { id: 'schedule', label: '日程' },
  { id: 'messages', label: '消息' },
  { id: 'me', label: '我的' },
];

function AppMain() {
  const [token, setToken] = useState<string | null>(null);
  const [bootRetry, setBootRetry] = useState(0);
  const [bootFailed, setBootFailed] = useState(false);
  const [initial, setInitial] = useState(true);
  const [activation, setActivation] = useState('');
  const [activationMember, setActivationMember] = useState('m1');
  const [error, setError] = useState('');
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [page, setPage] = useState<Page>('home');
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [game, setGame] = useState<GameTag>('apex');
  const [custom, setCustom] = useState('');
  const [nickname, setNickname] = useState('');
  const [nickNotice, setNickNotice] = useState('');
  const [focusInvite, setFocusInvite] = useState<string | null>(null);
  const [focusReservation, setFocusReservation] = useState<string | null>(null);
  const [reservationNotice, setReservationNotice] = useState('');
  const [saveError, setSaveError] = useState<{ message: string; isConflict: boolean } | null>(null);

  const requestSerial = useRef(0); // session generation, not polling generation
  const refreshGate = useRef(createRefreshGate());
  const session = useRef<string | null>(null);
  const pending = useRef<{ key: string; id: string } | null>(null);
  const actionLock = useRef(false);
  const lastServerNickname = useRef<string>('');

  useEffect(() => {
    let gone = false;
    (async () => {
      try {
        if (Capacitor.isNativePlatform()) {
          const r = await SecureSession.get();
          if (!gone && r.token) {
            session.current = r.token;
            setToken(r.token);
          }
        }
      } catch {
        if (!gone) {
          setBootFailed(true);
          setError('安全存储无法读取，请联系管理员。');
        }
      } finally {
        if (!gone) setInitial(false);
      }
    })();
    return () => {
      gone = true;
    };
  }, [bootRetry]);

  const refresh = useCallback(async (afterCurrent = false): Promise<boolean> => {
    const t = session.current;
    if (!t) return false;
    const id = requestSerial.current;
    return refreshGate.current.run(id, async () => {
    if (id !== requestSerial.current || session.current !== t) return false;
    try {
      const data = await apiRequest<Snapshot>(apiBase, '/api/state', t);
      if (id !== requestSerial.current || session.current !== t) return false;
      setSnap(data);
      setError('');
      return true;
    } catch (e) {
      if (id !== requestSerial.current || session.current !== t) return false;
      if (e instanceof ApiError && e.status === 401) {
        requestSerial.current++;
        session.current = null;
        setToken(null);
        setSnap(null);
        setNickname('');
        lastServerNickname.current = '';
        if (Capacitor.isNativePlatform()) {
          void SecureSession.clear().catch(() => {});
        }
        setError('登录状态已失效，请使用个人口令重新登录。');
        return false;
      }
      setError(formatErrorMessage(e));
      return false;
    }
    }, afterCurrent);
  }, []);

  const receive = useCallback(
    (raw: string) => {
      try {
        const u = new URL(raw);
        if (u.protocol === 'qidongapp:' && u.hostname === 'game' && !u.search && !u.hash) {
          if (/^\/[0-9a-f-]{36}$/.test(u.pathname)) {
            setFocusReservation(null);
            setReservationNotice('');
            setFocusInvite(u.pathname.slice(1));
            setPage('home');
            void refresh();
          } else if (['/schedule', '/messages', '/me'].includes(u.pathname)) {
            setFocusInvite(null);
            setFocusReservation(null);
            setReservationNotice('');
            setPage(u.pathname.slice(1) as Page);
            void refresh();
          }
        }
      } catch {
        // Ignore invalid launch URLs
      }
    },
    [refresh],
  );

  useEffect(() => {
    const v = () => {
      setActive(!document.hidden);
      if (!document.hidden) void refresh();
    };
    document.addEventListener('visibilitychange', v);
    v();

    const a = App.addListener('appStateChange', (e) => {
      setActive(e.isActive);
      if (e.isActive) void refresh();
    });
    const b = App.addListener('appUrlOpen', (e) => receive(e.url));
    App.getLaunchUrl()
      .then((x) => {
        if (x?.url) receive(x.url);
      })
      .catch(() => {});
    return () => {
      void a.then((x) => x.remove());
      void b.then((x) => x.remove());
      document.removeEventListener('visibilitychange', v);
    };
  }, [receive, refresh]);

  const waiting = snap?.invites.some((i) => i.status === 'pending') ?? false;
  useEffect(() => {
    if (!token || !active) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      await refresh();
      if (!stopped) timer = setTimeout(poll, waiting ? 3000 : 6000);
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [token, active, waiting, refresh]);

  // Sync nickname only when server nickname genuinely changes (allows user to clear input cleanly)
  useEffect(() => {
    const serverNick = snap?.me.nickname ?? '';
    if (serverNick && serverNick !== lastServerNickname.current) {
      lastServerNickname.current = serverNick;
      setNickname(serverNick);
    }
  }, [snap?.me.nickname]);


  // Reset only on actual tab switches, not when a completed jump clears its target.
  useEffect(() => {
    if (!focusInvite && !focusReservation) window.scrollTo({ top: 0, behavior: 'auto' });
  }, [page]);

  useEffect(() => {
    if (!snap || !focusInvite || page !== 'home') return;
    const el = document.getElementById(`invite-${focusInvite}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    else window.scrollTo({ top: 0, behavior: 'auto' });
    setFocusInvite(null);
  }, [focusInvite, page, snap]);

  useEffect(() => {
    if (!snap || !focusReservation || page !== 'schedule') return;
    const target = document.getElementById(`reservation-${focusReservation}`);
    if (target) {
      target.focus({ preventScroll: true });
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      setReservationNotice('这条预约已结束或不在当前列表中。');
      document.getElementById('reservations')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setFocusReservation(null);
  }, [focusReservation, page, snap]);

  async function activate(e: FormEvent) {
    e.preventDefault();
    if (actionLock.current || !activation.trim()) return;
    actionLock.current = true;
    setBusy(true);
    setBusyKey('login');
    setError('');
    try {
      const r = await apiRequest<{ token?: string }>(
        apiBase,
        '/api/login',
        null,
        { password: activation.trim(), memberId: activationMember },
      );
      const next = r.token;
      if (!next) throw Error('no_session');
      if (Capacitor.isNativePlatform()) {
        await SecureSession.set({ token: next });
      }
      requestSerial.current++;
      session.current = next;
      setToken(next);
      setActivation('');
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'invalid_login'
          ? '身份或口令不正确；已激活的旧设备需先在「我的」设置长期口令。'
          : formatErrorMessage(err),
      );
    } finally {
      actionLock.current = false;
      setBusy(false);
      setBusyKey(null);
    }
  }

  const write: WriteFn = useCallback(
    async (path, input, versioned = false, actionKey) => {
      if (actionLock.current || !session.current) return false;
      actionLock.current = true;
      setBusy(true);
      setBusyKey(actionKey ?? path);
      setError('');
      const key = path + JSON.stringify(input);
      if (!pending.current || pending.current.key !== key) {
        pending.current = { key, id: crypto.randomUUID() };
      }
      try {
        await apiRequest(apiBase, path, session.current, {
          ...input,
          ...(versioned ? { mutation: pending.current.id } : {}),
        });
        pending.current = null;
        await refresh(true);
        return true;
      } catch (e) {
        setError(formatErrorMessage(e));
        if (e instanceof ApiError && e.status < 500) {
          pending.current = null;
          if (e.status === 409) {
            if (path === '/api/schedule') setSaveError({message:'你的日程已在另一设备更新，请重新拉取。',isConflict:true});
            await refresh(true);
          }
        }
        return false;
      } finally {
        actionLock.current = false;
        setBusy(false);
        setBusyKey(null);
      }
    },
    [refresh],
  );

  const scheduleSnap = useMemo<RoomSnapshot | null>(() => {
    if (!snap) return null;
    const first = Math.floor((snap.now + 2 * 3600000) / 86400000) * 48 - 4;
    const nights: Night[] = Array.from({ length: 7 }, (_, i) => {
      const from = first + i * 48;
      const dateKey = slotToShanghaiParts(from).dateKey;
      return { id: dateKey, dateKey, from, to: from + 48 };
    });
    return {
      id: `fixed-schedule-${nights[0].id}`,
      title: '未来七天空闲',
      gameTag: game,
      tzid: 'Asia/Shanghai',
      nights,
      targetPlayers: 3,
      durationSlots: 2,
      roomRevision: snap.members.reduce((n, m) => n + m.schedule_revision, 0),
      closedAt: null,
      submissions: snap.members.flatMap<Submission>((m) => {
        const picks = m.schedule.flatMap((p) =>
          nights
            .map((n) => ({
              nightId: n.id,
              from: Math.max(p.from, n.from),
              to: Math.min(p.to, n.to),
            }))
            .filter((p2) => p2.to > p2.from),
        );
        // An empty schedule alone is not a negative response. Keep elapsed picks for editing.
        if (!picks.length && m.scheduleStatus !== 'unavailable') return [];
        return [{
          memberId: m.id,
          nickname: m.nickname,
          answer: picks.length ? { kind: 'available', picks } : { kind: 'unavailable' },
          updatedAt: new Date(snap.now).toISOString(),
        }];
      }),
      viewer: {
        memberId: snap.me.id,
        canClose: false,
        mineRevision: snap.members.find((m) => m.id === snap.me.id)!.schedule_revision,
      },
      syncedAt: new Date(snap.now).toISOString(),
    };
  }, [snap, game]);

  const candidates = useMemo(
    () =>
      scheduleSnap && snap
        ? recommend({
            nights: scheduleSnap.nights,
            targetPlayers: 3,
            durationSlots: 2,
            earliestStart: Math.ceil(snap.now / 1800000),
            submissions: scheduleSnap.submissions,
          }).filter((x) => x.missingPlayers === 0)
        : [],
    [scheduleSnap, snap],
  );

  async function saveSchedule(answer: Answer, revision: number, unavailable: boolean) {
    if (!scheduleSnap) return false;
    const picks = answer.kind === 'available' ? mergeSpans(answer.picks) : [];
    if (revision !== scheduleSnap.viewer.mineRevision) {
      setSaveError({
        message: '你的时间已在其他设备更新，请先拉取最新日程再编辑。',
        isConflict: true,
      });
      return false;
    }
    const ok = await write('/api/schedule', { picks, revision, unavailable }, true, 'save-schedule');
    setSaveError(current => ok ? null : current?.isConflict ? current : { message: '保存未确认，请检查顶部提示并重试。', isConflict: false });
    return ok;
  }

  async function handleSaveNickname(e: FormEvent) {
    e.preventDefault();
    const trimmed = nickname.trim();
    if (busy || !trimmed) return;
    setNickNotice('');
    const ok = await write('/api/profile', { nickname: trimmed }, false, 'save-nickname');
    if (ok) setNickNotice('昵称已更新');
  }

  if (initial) {
    return (
      <main className="appShell">
        <section className="paper emptyState">
          <p className="emptyStateTitle">正在读取安全身份…</p>
        </section>
      </main>
    );
  }

  if (bootFailed) {
    return (
      <main className="appShell">
        <section className="paper">
          <h1 className="brandTitle">启动！</h1>
          <p role="alert" className="warning">
            {error}
          </p>
          <button
            type="button"
            className="btnPrimary"
            onClick={() => {
              setBootFailed(false);
              setInitial(true);
              setBootRetry((n) => n + 1);
            }}
          >
            重新连接
          </button>
        </section>
      </main>
    );
  }

  if (!token) {
    return (
      <main className="appShell">
        <section className="paper loginCard">
          <div className="loginHero">
            <HeroSquadIllustration />
            <div>
              <h1 className="brandTitle">启动！</h1>
              <p className="helperText">三人固定开黑小队</p>
            </div>
          </div>

          <p className="helperText">
            选择你的固定身份，输入个人登录口令。首次登录可使用管理员发放的原激活码。
          </p>

          <form className="stackForm" onSubmit={(e) => void activate(e)}>
            <div className="activationMembers" role="group" aria-label="选择身份">
              {[
                ['m1', '成员一'],
                ['m2', '成员二'],
                ['m3', '成员三'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`memberSelectBtn ${activationMember === id ? 'isSelected' : ''}`}
                  aria-pressed={activationMember === id}
                  disabled={busy}
                  onClick={() => {
                    setActivationMember(id);
                    setActivation('');
                    setError('');
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="fieldGroup">
              <label className="fieldLabel" htmlFor="activation-code">
                个人登录口令
              </label>
              <input
                id="activation-code"
                className="fieldInput"
                type="password"
                autoComplete="current-password"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="输入个人口令或首次激活码"
                value={activation}
                onChange={(e) => setActivation(e.target.value)}
              />
            </div>

            <button
              type="submit"
              className="btnPrimary btnFull"
              disabled={busy || !activation.trim()}
            >
              {busyKey === 'login' ? '正在登录…' : '登录'}
            </button>
          </form>

          <p className="helperText">
            同一个身份可在多个设备登录。已激活的旧用户请先在「我的」设置长期口令。
          </p>

          {error && (
            <p role="alert" className="warning">
              {error}
            </p>
          )}
        </section>
      </main>
    );
  }

  const unreadMessages = Boolean(
    snap?.messages.some((m) => !m.read_at) || snap?.reservationMessages.some((m) => !m.read_at),
  );

  function renderNavIcon(id: Page) {
    if (id === 'home') return <Home size={20} aria-hidden="true" />;
    if (id === 'schedule') return <Calendar size={20} aria-hidden="true" />;
    if (id === 'messages') return <Bell size={20} aria-hidden="true" />;
    return <User size={20} aria-hidden="true" />;
  }

  return (
    <main className="appShell">
      <header className="appHeader">
        <div className="appHeaderBrand">
          <h1 className="brandTitleSm">启动！</h1>
          <span className="headerPill">固定三人 · {snap?.me.nickname || '同步中'}</span>
        </div>
        <button
          type="button"
          className="btnIconGhost"
          aria-label="刷新数据"
          onClick={() => void refresh()}
        >
          <RefreshCw size={16} aria-hidden="true" />
        </button>
      </header>

      {error && (
        <div role="alert" className="warning warningRow">
          <span>{error}</span>
          <button type="button" className="btnGhostSm" onClick={() => void refresh()}>
            重试
          </button>
        </div>
      )}

      {!snap ? (
        <section className="paper emptyState">
          <p className="emptyStateTitle">正在同步小队数据…</p>
          <button type="button" className="btnSecondary" onClick={() => void refresh()}>
            手动刷新
          </button>
        </section>
      ) : (
        <>
          {page === 'home' && (
            <HomeView
              snap={snap}
              game={game}
              custom={custom}
              busy={busy}
              busyKey={busyKey}
              onGameChange={setGame}
              onCustomChange={setCustom}
              write={write}
            />
          )}

          {page === 'schedule' && scheduleSnap && (
            <>
              <section className="paper">
                <div className="cardHeaderRow">
                  <h2 className="sectionHeading">三人共同空闲</h2>
                  <span className="badgeSoft">北京时间</span>
                </div>
                {candidates.length ? (
                  <div className="commonSlotList">
                    {candidates.slice(0, 5).map((c, i) => {
                      const n = scheduleSnap.nights.find((x) => x.id === c.nightId)!;
                      return (
                        <div key={i} className="commonSlotChip tabular">
                          <strong>{formatNightWeekday(n.dateKey)}</strong>
                          <span>
                            {formatSlotInNight(c.firstStart, n.dateKey)} –{' '}
                            {formatSlotInNight(c.availableUntil, n.dateKey)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="helperText">还没有三人连续至少 1 小时的共同空闲。</p>
                )}
                <div className="memberConfirmRow" aria-label="成员日程状态">
                  {snap.members.map((m) => {
                    const available = m.schedule.some((p) => p.to > Math.ceil(snap.now / 1800000));
                    const label = available ? '已填空闲' : m.scheduleStatus === 'unavailable' ? '已确认没空' : '未确认空闲';
                    return <span key={m.id} className={`confirmPill ${available ? 'isConfirmed' : ''}`}>{m.nickname} · {label}</span>;
                  })}
                </div>
                <p className="helperText">每日周期为 06:00 至次日 06:00。</p>
              </section>

              <ScheduleEditor
                snapshot={scheduleSnap}
                explicitlyUnavailable={snap.members.find((m) => m.id === snap.me.id)?.scheduleStatus === 'unavailable'}
                earliestStart={Math.ceil(snap.now / 1800000)}
                isSaving={busy && busyKey === 'save-schedule'}
                saveError={saveError}
                onSave={saveSchedule}
                onRefreshLatest={refresh}
                onClearError={() => setSaveError(null)}
              />

              <WeeklyTemplate
                key={snap.me.id}
                member={snap.members.find((m) => m.id === snap.me.id)!}
                now={snap.now}
                busy={busy}
                write={write}
              />

              <ReservationPanel
                now={snap.now}
                me={snap.me.id}
                members={snap.members}
                reservations={snap.reservations}
                notice={reservationNotice}
                game={game}
                custom={custom}
                candidates={candidates}
                busy={busy}
                write={write}
              />
            </>
          )}

          {page === 'messages' && (
            <MessagesView
              snap={snap}
              write={write}
              onJumpInvite={(inviteId) => {
                setFocusReservation(null);
                setReservationNotice('');
                setFocusInvite(inviteId);
                setPage('home');
              }}
              onJumpReservation={(reservationId) => {
                setFocusInvite(null);
                setReservationNotice('');
                setFocusReservation(reservationId);
                setPage('schedule');
              }}
            />
          )}

          {page === 'me' && (
            <>
              <section className="paper">
                <div className="profileHead">
                  <AvatarDot name={snap.me.nickname} seed={snap.me.id} isMe />
                  <div>
                    <h2 className="sectionHeading">{snap.me.nickname}</h2>
                    <p className="helperText">
                      固定成员：{snap.me.id} · Android 客户端
                    </p>
                  </div>
                </div>

                <form className="stackForm" onSubmit={(e) => void handleSaveNickname(e)}>
                  <div className="fieldGroup">
                    <label className="fieldLabel" htmlFor="profile-nickname">
                      显示昵称
                    </label>
                    <div className="inlineInputRow">
                      <input
                        id="profile-nickname"
                        className="fieldInput"
                        value={nickname}
                        maxLength={24}
                        placeholder="输入你的昵称"
                        onChange={(e) => {
                          setNickname(e.target.value);
                          setNickNotice('');
                        }}
                      />
                      <button
                        type="submit"
                        className="btnPrimary"
                        disabled={busy || !nickname.trim() || nickname.trim() === snap.me.nickname}
                      >
                        {busyKey === 'save-nickname' ? '保存中…' : '保存'}
                      </button>
                    </div>
                    {!nickname.trim() && <p className="fieldError">昵称不能为空。</p>}
                    {nickNotice && (
                      <p role="status" className="statusBanner">
                        {nickNotice}
                      </p>
                    )}
                  </div>
                </form>
              </section>

              <AccountPanel
                key={snap.me.id}
                token={token}
                apiBase={apiBase}
                onSession={async (next) => {
                  if (Capacitor.isNativePlatform()) {
                    if (next) await SecureSession.set({ token: next });
                    else await SecureSession.clear();
                  }
                  requestSerial.current++;
                  session.current = next;
                  setToken(next);
                  if (!next) {
                    setSnap(null);
                    setNickname('');
                    lastServerNickname.current = '';
                    setFocusInvite(null);
                    setFocusReservation(null);
                    setReservationNotice('');
                    setPage('home');
                    setError('');
                  } else {
                    void refresh();
                  }
                }}
              />

              <PushSettings token={token} apiBase={apiBase} />
              <VersionSettings token={token} apiBase={apiBase} />
            </>
          )}
        </>
      )}

      <nav className="bottomNav" aria-label="主导航">
        {NAV_TABS.map((tab) => {
          const isCurrent = page === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              className="bottomNavBtn"
              aria-current={isCurrent ? 'page' : undefined}
              onClick={() => {
                setFocusInvite(null);
                setFocusReservation(null);
                setReservationNotice('');
                setPage(tab.id);
              }}
            >
              <span className="bottomNavIcon">
                {renderNavIcon(tab.id)}
                {tab.id === 'messages' && unreadMessages && (
                  <span className="navBadgeDot" aria-label="有未读消息" />
                )}
              </span>
              <span className="bottomNavLabel">{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<AppMain />);
