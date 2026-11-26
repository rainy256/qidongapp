import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { AlertSoftIcon, StarGlintIcon } from './AppIcons';
import { MascotBadge } from './MascotBadge';
import styles from './NicknameDialog.module.css';

type NicknameDialogProps = Readonly<{
  open: boolean;
  initialNickname: string;
  isSaving: boolean;
  actionSummary: string;
  onCancel: () => void;
  onConfirm: (nickname: string) => void;
}>;

export function NicknameDialog({
  open,
  initialNickname,
  isSaving,
  actionSummary,
  onCancel,
  onConfirm,
}: NicknameDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const titleId = useId();
  const inputId = useId();
  const [value, setValue] = useState(initialNickname);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValue(initialNickname);
      setError(null);
    }
  }, [initialNickname, open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Fallback light dismiss when browser lacks closedby="any"
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
      if (pressedOutside && isOutside(e)) {
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
  }, []);

  const handleClose = () => {
    const dialog = dialogRef.current;
    if (dialog) {
      dialog.returnValue = '';
    }
    onCancel();
  };

  const trySubmit = () => {
    if (isSaving) return;
    const clean = value.trim();
    if (!clean) {
      setError('先填一下群里怎么叫你吧～');
      inputRef.current?.focus();
      return;
    }
    onConfirm(clean);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    trySubmit();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.nativeEvent.isComposing || e.keyCode === 229) {
        return;
      }
      trySubmit();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={titleId}
      {...({ closedby: 'any' } as Record<string, string>)}
      onClose={handleClose}
      onCancel={(e) => {
        if (isSaving) e.preventDefault();
      }}
    >
      <form className={styles.sheet} onSubmit={handleSubmit}>
        <div className={styles.grabber} aria-hidden="true" />

        <div className={styles.headerRow}>
          <MascotBadge mood="happy" size={50} />
          <div className={styles.headerText}>
            <h1 id={titleId} className={styles.title}>
              上车报个名～
            </h1>
            <p className={styles.summary}>{actionSummary}</p>
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor={inputId} className={styles.label}>
            群里怎么称呼你
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            maxLength={20}
            autoFocus
            placeholder="例如：阿九、小橘"
            className={styles.input}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            onKeyDown={handleKeyDown}
          />
          <p className={styles.hint}>不用注册账号，填完用当前浏览器随时能改时间。</p>
        </div>

        {error && (
          <p className={styles.error} role="alert">
            <AlertSoftIcon size={15} />
            <span>{error}</span>
          </p>
        )}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={handleClose}
            disabled={isSaving}
          >
            再改改
          </button>
          <button type="submit" className={styles.confirmBtn} disabled={isSaving}>
            <StarGlintIcon size={16} tone="auto" />
            <span>{isSaving ? '正在上车…' : '确认上车！'}</span>
          </button>
        </div>
      </form>
    </dialog>
  );
}
