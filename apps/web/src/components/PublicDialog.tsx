import { useLayoutEffect, useRef, type ReactNode } from 'react';

import { MODAL_OVERLAY_CLASS, MODAL_PANEL_CLASS, cn } from './ui';

export function PublicDialog({
  label,
  onClose,
  panelClassName,
  children,
}: {
  label: string;
  onClose: () => void;
  panelClassName: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const dialog = ref.current!;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <dialog
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className={cn(
        MODAL_OVERLAY_CLASS,
        'm-0 h-dvh max-h-none w-screen max-w-none border-0 text-ink backdrop:bg-transparent [&:not([open])]:hidden',
      )}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={cn(MODAL_PANEL_CLASS, panelClassName)}>{children}</div>
    </dialog>
  );
}
