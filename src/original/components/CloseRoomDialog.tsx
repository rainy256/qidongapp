import { useEffect, useId, useRef } from 'react';
import styles from './CloseRoomDialog.module.css';

type CloseRoomDialogProps = Readonly<{
  open: boolean;
  roomTitle: string;
  isBusy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}>;

export function CloseRoomDialog({
  open,
  roomTitle,
  isBusy,
  onCancel,
  onConfirm,
}: CloseRoomDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Fallback light dismiss when browser lacks closedby="any" (e.g. Safari)
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

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={titleId}
      {...({ closedby: 'any' } as Record<string, string>)}
      onClose={handleClose}
      onCancel={(e) => {
        if (isBusy) {
          e.preventDefault();
        }
      }}
    >
      <div className={styles.content}>
        <h1 id={titleId} className={styles.title}>
          结束本次时间收集？
        </h1>
        <p className={styles.body}>
          结束「{roomTitle}」后，所有人将无法再新增或修改时间，页面会保留最终推荐结果方便转发群通知。
        </p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={handleClose}
            disabled={isBusy}
            autoFocus
          >
            先不结束
          </button>
          <button
            type="button"
            className={styles.confirmBtn}
            onClick={onConfirm}
            disabled={isBusy}
          >
            {isBusy ? '处理中…' : '确认结束收集'}
          </button>
        </div>
      </div>
    </dialog>
  );
}
