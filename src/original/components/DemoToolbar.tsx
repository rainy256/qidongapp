import { useEffect, useState } from 'react';
import { mockRoomClient, type DemoControlState, type DemoRole } from '../api/mockClient';
import { DEMO_SCENARIOS } from '../mocks/scenarios';
import {
  CloseSoftIcon,
  ResetSoftIcon,
  SlidersSoftIcon,
  UserPlusSoftIcon,
} from './AppIcons';
import styles from './DemoToolbar.module.css';

type DemoToolbarProps = Readonly<{
  currentPath: string;
  activeRoomId: string | null;
  currentDurationSlots?: number;
  onNavigate: (path: string) => void;
}>;

export function DemoToolbar({
  currentPath,
  activeRoomId,
  currentDurationSlots,
  onNavigate,
}: DemoToolbarProps) {
  const [open, setOpen] = useState(false);
  const [controls, setControls] = useState<DemoControlState>(() =>
    mockRoomClient.getControlState(),
  );

  useEffect(() => {
    return mockRoomClient.subscribeControls(() => {
      setControls(mockRoomClient.getControlState());
    });
  }, []);

  const roles: { id: DemoRole; label: string }[] = [
    { id: 'guest', label: '新访客' },
    { id: 'member', label: '已填群友' },
    { id: 'owner', label: '房主' },
  ];

  return (
    <aside className={styles.container} aria-label="演示控制台">
      {open && (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>前端模板演示控制台</span>
            <button
              type="button"
              className={styles.closeBtn}
              aria-label="收起演示控制台"
              onClick={() => setOpen(false)}
            >
              <CloseSoftIcon size={16} />
            </button>
          </div>

          <div className={styles.group}>
            <span className={styles.groupLabel}>页面与场景</span>
            <div className={styles.grid}>
              <button
                type="button"
                className={`${styles.chip} ${currentPath === '/' ? styles.chipActive : ''}`}
                onClick={() => onNavigate('/')}
              >
                + 建房页 /
              </button>
              {DEMO_SCENARIOS.map((sc) => {
                const targetPath = `/r/${sc.id}`;
                return (
                  <button
                    key={sc.id}
                    type="button"
                    className={`${styles.chip} ${
                      currentPath === targetPath ? styles.chipActive : ''
                    }`}
                    onClick={() => onNavigate(targetPath)}
                    title={sc.summary}
                  >
                    {sc.label}
                  </button>
                );
              })}
            </div>
          </div>

          {activeRoomId && (
            <>
              <div className={styles.group}>
                <span className={styles.groupLabel}>访问身份</span>
                <div className={styles.row}>
                  {roles.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className={`${styles.chip} ${
                        controls.role === r.id ? styles.chipActive : ''
                      }`}
                      onClick={() => mockRoomClient.setRole(r.id, activeRoomId)}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {activeRoomId === 'demo-counterexample' && (
                <div className={styles.group}>
                  <span className={styles.groupLabel}>验证防误报算法（切换连玩时长）</span>
                  <div className={styles.row}>
                    <button
                      type="button"
                      className={`${styles.chip} ${
                        currentDurationSlots === 4 ? styles.chipActive : ''
                      }`}
                      onClick={() => mockRoomClient.setScenarioDuration(activeRoomId, 4)}
                    >
                      2 小时（差1人）
                    </button>
                    <button
                      type="button"
                      className={`${styles.chip} ${
                        currentDurationSlots === 2 ? styles.chipActive : ''
                      }`}
                      onClick={() => mockRoomClient.setScenarioDuration(activeRoomId, 2)}
                    >
                      1 小时（4人可开）
                    </button>
                  </div>
                </div>
              )}

              <div className={styles.group}>
                <span className={styles.groupLabel}>实时同步与异常状态</span>
                <div className={styles.grid}>
                  <button
                    type="button"
                    className={styles.chip}
                    onClick={() => mockRoomClient.simulatePeerSubmission(activeRoomId)}
                  >
                    <UserPlusSoftIcon size={14} tone="violet" />
                    <span>模拟群友提交</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.chip} ${controls.offline ? styles.chipWarn : ''}`}
                    onClick={() =>
                      mockRoomClient.setFault({ offline: !controls.offline }, activeRoomId)
                    }
                  >
                    {controls.offline ? '恢复联网' : '模拟离线'}
                  </button>
                  <button
                    type="button"
                    className={`${styles.chip} ${controls.denyClipboard ? styles.chipWarn : ''}`}
                    onClick={() =>
                      mockRoomClient.setFault(
                        { denyClipboard: !controls.denyClipboard },
                        activeRoomId,
                      )
                    }
                  >
                    {controls.denyClipboard ? '恢复剪贴板' : '禁止剪贴板'}
                  </button>
                  <button
                    type="button"
                    className={`${styles.chip} ${controls.failNextSave ? styles.chipWarn : ''}`}
                    onClick={() =>
                      mockRoomClient.setFault(
                        { failNextSave: !controls.failNextSave },
                        activeRoomId,
                      )
                    }
                  >
                    下次保存失败
                  </button>
                  <button
                    type="button"
                    className={`${styles.chip} ${controls.conflictNextSave ? styles.chipWarn : ''}`}
                    onClick={() =>
                      mockRoomClient.setFault(
                        { conflictNextSave: !controls.conflictNextSave },
                        activeRoomId,
                      )
                    }
                  >
                    下次保存冲突 (409)
                  </button>
                </div>
              </div>
            </>
          )}

          <div className={styles.footerRow}>
            <button
              type="button"
              className={styles.resetBtn}
              onClick={() => mockRoomClient.resetAll(activeRoomId ?? undefined)}
            >
              <ResetSoftIcon size={14} />
              <span>重置所有演示数据</span>
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        className={styles.launcher}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <SlidersSoftIcon size={16} tone="violet" />
        <span>演示切换</span>
      </button>
    </aside>
  );
}
