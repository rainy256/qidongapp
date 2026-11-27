import { useEffect, useState, type FormEvent } from 'react';
import { ChevronDown, LogOut, RefreshCw, ShieldCheck, Smartphone } from 'lucide-react';
import { ConfirmDialog } from './components/ConfirmDialog';
import { apiRequest } from './types';

type Device = {
  id: string;
  kind: 'android' | 'legacy';
  created_at: number;
  expires_at: number | null;
};

type Account = {
  passwordConfigured: boolean;
  currentSession: string;
  sessions: Device[];
};

export function AccountPanel({
  token,
  apiBase,
  onSession,
}: {
  token: string;
  apiBase: string;
  onSession: (token: string | null) => Promise<void>;
}) {
  const [state, setState] = useState<Account | null>(null);
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeTone, setNoticeTone] = useState<'info' | 'error'>('info');
  const [busy, setBusy] = useState(false);
  const [confirmPasswordChange, setConfirmPasswordChange] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<Device | null>(null);

  async function load() {
    setState(await apiRequest<Account>(apiBase, '/api/account', token));
  }

  useEffect(() => {
    let alive = true;
    apiRequest<Account>(apiBase, '/api/account', token)
      .then((x) => {
        if (alive) setState(x);
      })
      .catch(() => {
        if (alive) {
          setNoticeTone('error');
          setNotice('无法读取账号设置，请刷新重试。');
        }
      });
    return () => {
      alive = false;
    };
  }, [token, apiBase]);

  const lenOk = password.length >= 16 && password.length <= 128;
  const trimOk = password.trim() === password;
  const matchOk = password === confirm;
  const currentOk = !state?.passwordConfigured || Boolean(current);
  const valid = lenOk && trimOk && matchOk && currentOk;

  const passwordHint = (() => {
    if (!password && !confirm && !current) return '';
    if (state?.passwordConfigured && !current) return '请先输入当前口令。';
    if (password && !trimOk) return '新口令首尾不能包含空格。';
    if (password && !lenOk) return `新口令至少需要 16 个字符（当前 ${password.length} 位）。`;
    if (confirm && !matchOk) return '两次输入的新口令不一致。';
    return '';
  })();

  async function executeSave() {
    if (!state || !valid || busy) return;
    setBusy(true);
    setNotice('');
    try {
      const r = await apiRequest<{token?: string}>(apiBase, '/api/account/password', token, { password, currentPassword: current });
      const next = r.token;
      if (!next) throw Error('missing_session');
      await onSession(next);
      setCurrent('');
      setPassword('');
      setConfirm('');
      setNoticeTone('info');
      setNotice('个人口令已保存，其他旧会话已失效。');
    } catch (e) {
      setNoticeTone('error');
      setNotice(
        e instanceof Error && e.message === 'invalid_password'
          ? '当前口令不正确或新口令不符合要求。'
          : e instanceof Error && e.message === 'rate_limited'
            ? '操作过多，请稍后重试。'
            : '保存未确认。如已修改成功，可用新口令重新登录。',
      );
    } finally {
      setBusy(false);
    }
  }

  function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    if (!state || !valid || busy) return;
    if (state.passwordConfigured) {
      setConfirmPasswordChange(true);
    } else {
      void executeSave();
    }
  }

  async function executeRevoke(target: Device) {
    if (busy || !state) return;
    setBusy(true);
    setNotice('');
    try {
      await apiRequest(apiBase, '/api/account/revoke', token, { id: target.id });
      if (target.id === state.currentSession) {
        await onSession(null);
      } else {
        setState(old => old && {...old, sessions: old.sessions.filter(device => device.id !== target.id)});
        setNoticeTone('info');
        setNotice('旧设备已注销。');
      }
    } catch {
      setNoticeTone('error');
      setNotice('注销未确认，请重试。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="paper">
      <div className="cardHeaderRow">
        <h2 className="sectionHeading">账号与设备</h2>
        {state && (
          <span className={state.passwordConfigured ? 'badgeSuccess' : 'badgeAmber'}>
            <ShieldCheck size={13} aria-hidden="true" />
            {state.passwordConfigured ? '已设口令' : '待设口令'}
          </span>
        )}
      </div>

      {!state ? (
        <p className="helperText">正在读取账号设置…</p>
      ) : (
        <>
          <p className="helperText">
            {state.passwordConfigured
              ? '已设置长期登录口令，可在多台设备登录同一身份。'
              : '请先设置个人长期口令，再更换手机或浏览器。'}
          </p>

          <details className="disclosureInner" open={!state.passwordConfigured}>
            <summary className="disclosureSummaryInner">
              <span>{state.passwordConfigured ? '修改个人口令' : '设置个人口令'}</span>
              <ChevronDown size={17} className="disclosureChevron" aria-hidden="true" />
            </summary>

            <form className="stackForm disclosureContentInner" onSubmit={handlePasswordSubmit}>
              {state.passwordConfigured && (
                <label className="fieldGroup">
                  <span className="fieldLabel">当前口令</span>
                  <input
                    className="fieldInput"
                    type="password"
                    autoComplete="current-password"
                    value={current}
                    onChange={(e) => setCurrent(e.target.value)}
                  />
                </label>
              )}

              <label className="fieldGroup">
                <span className="fieldLabel">新口令（至少 16 位，建议随机生成或长短语）</span>
                <input
                  className="fieldInput"
                  type="password"
                  autoComplete="new-password"
                  maxLength={128}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>

              <label className="fieldGroup">
                <span className="fieldLabel">确认新口令</span>
                <input
                  className="fieldInput"
                  type="password"
                  autoComplete="new-password"
                  maxLength={128}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </label>

              {passwordHint && <p className="fieldError">{passwordHint}</p>}

              <button type="submit" className="btnPrimary btnFull" disabled={busy || !valid}>
                {busy ? '保存中…' : '保存长期口令'}
              </button>
            </form>
          </details>

          <div className="sectionDivider" />

          <div className="cardHeaderRow">
            <h3 className="subHeading">已登录设备（{state.sessions.length}）</h3>
            <button
              type="button"
              className="btnGhostSm"
              disabled={busy}
              onClick={() =>
                void load().catch(() => {
                  setNoticeTone('error');
                  setNotice('刷新失败');
                })
              }
            >
              <RefreshCw size={14} aria-hidden="true" />
              <span>刷新</span>
            </button>
          </div>

          <div className="stackGroup">
            {state.sessions.map((d) => {
              const isCurrent = d.id === state.currentSession;
              return (
                <div className="subCard deviceRow" key={d.id}>
                  <div className="deviceInfo">
                    <div className="deviceTitleRow">
                      <Smartphone size={15} aria-hidden="true" />
                      <strong className="subCardTitle">
                        {d.kind === 'android' ? 'Android APK' : '旧版会话'}
                      </strong>
                      {isCurrent && <span className="badgeAccent">当前设备</span>}
                    </div>
                    <p className="helperText tabular">
                      登录于 {new Date(d.created_at).toLocaleString('zh-CN')}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btnDangerOutline"
                    disabled={busy || !state.passwordConfigured}
                    onClick={() => setRevokeTarget(d)}
                  >
                    <LogOut size={14} aria-hidden="true" />
                    <span>{isCurrent ? '退出登录' : '注销设备'}</span>
                  </button>
                </div>
              );
            })}
          </div>
          {!state.passwordConfigured && (
            <p className="fieldHint">设置长期口令后，即可管理或退出已登录设备。</p>
          )}
        </>
      )}

      {notice && (
        <p role="status" className={noticeTone === 'error' ? 'fieldError' : 'statusBanner'}>
          {notice}
        </p>
      )}

      <ConfirmDialog
        open={confirmPasswordChange}
        title="修改长期口令？"
        body="修改口令后，除当前设备外的其他已登录设备都会立即注销，需要用新口令重新登录。"
        confirmLabel="确认修改"
        busy={busy}
        onCancel={() => setConfirmPasswordChange(false)}
        onConfirm={() => {
          setConfirmPasswordChange(false);
          void executeSave();
        }}
      />

      <ConfirmDialog
        open={Boolean(revokeTarget)}
        title={revokeTarget?.id === state?.currentSession ? '退出当前登录？' : '注销该设备？'}
        body={
          revokeTarget?.id === state?.currentSession
            ? '退出后需要重新输入个人口令登录。'
            : '注销后该设备需要重新输入个人口令才能使用。'
        }
        confirmLabel={revokeTarget?.id === state?.currentSession ? '确认退出' : '确认注销'}
        busy={busy}
        onCancel={() => setRevokeTarget(null)}
        onConfirm={() => {
          const target = revokeTarget;
          setRevokeTarget(null);
          if (target) void executeRevoke(target);
        }}
      />
    </section>
  );
}
