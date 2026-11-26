import { useEffect, useId, useRef, useState } from 'react';
import { CheckSoftIcon, CopyReportIcon } from './AppIcons';
import styles from './CopyAction.module.css';

type CopyActionProps = Readonly<{
  text: string;
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  denyClipboard?: boolean;
  className?: string;
}>;

let lastAnnouncement = '';

function legacyCopy(text: string): boolean {
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

export function CopyAction({
  text,
  label,
  variant = 'secondary',
  denyClipboard = false,
  className = '',
}: CopyActionProps) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [showManualBox, setShowManualBox] = useState(false);
  const timerRef = useRef<number | null>(null);
  const manualRef = useRef<HTMLTextAreaElement | null>(null);
  const manualId = useId();

  useEffect(() => {
    setShowManualBox(false);
  }, [text]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const announce = (ok: boolean) => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    let msg = ok ? '已复制' : '复制受限，请长按下方文本';
    if (msg === lastAnnouncement) {
      msg += '\u00A0';
    }
    lastAnnouncement = msg;

    setState(ok ? 'copied' : 'failed');
    setStatusMessage('');
    requestAnimationFrame(() => {
      setStatusMessage(msg);
    });

    timerRef.current = window.setTimeout(() => {
      setState('idle');
      setStatusMessage('');
    }, 2000);
  };

  const handleCopy = async () => {
    if (!text.trim()) return;

    if (denyClipboard) {
      setShowManualBox(true);
      announce(false);
      requestAnimationFrame(() => manualRef.current?.select());
      return;
    }

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable');
      }
      await navigator.clipboard.writeText(text);
      setShowManualBox(false);
      announce(true);
    } catch {
      if (legacyCopy(text)) {
        setShowManualBox(false);
        announce(true);
      } else {
        setShowManualBox(true);
        announce(false);
        requestAnimationFrame(() => manualRef.current?.select());
      }
    }
  };

  return (
    <div className={`${styles.wrapper} ${className}`}>
      <div className={styles.triggerRow}>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className={`${styles.button} ${styles[variant]}`}
          data-copied={state === 'copied' ? '' : undefined}
          data-failed={state === 'failed' ? '' : undefined}
        >
          {state === 'copied' ? (
            <CheckSoftIcon size={16} tone={variant === 'primary' ? 'auto' : 'violet'} />
          ) : (
            <CopyReportIcon size={16} tone={variant === 'primary' ? 'auto' : 'violet'} />
          )}
          <span>{state === 'copied' ? '已复制' : label}</span>
        </button>

        {/* Live region placed outside <button> per modern-web-guidance copy-button rule */}
        <span
          className={styles.statusTip}
          role="status"
          data-visible={statusMessage ? 'true' : 'false'}
          data-error={state === 'failed' ? 'true' : 'false'}
        >
          {statusMessage}
        </span>
      </div>

      {showManualBox && (
        <div className={styles.manualBox}>
          <label htmlFor={manualId} className={styles.manualLabel}>
            当前浏览器限制一键写入剪贴板，请长按或全选复制：
          </label>
          <textarea
            id={manualId}
            ref={manualRef}
            className={styles.manualTextarea}
            value={text}
            readOnly
            rows={5}
            onFocus={(e) => e.currentTarget.select()}
          />
          <div className={styles.manualActions}>
            <button
              type="button"
              className={styles.selectAllBtn}
              onClick={() => manualRef.current?.select()}
            >
              全选内容
            </button>
            <button
              type="button"
              className={styles.dismissBtn}
              onClick={() => setShowManualBox(false)}
            >
              收起
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
