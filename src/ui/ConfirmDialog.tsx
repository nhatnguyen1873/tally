import { useEffect, useId, useRef } from 'react'

import { useI18n } from '../i18n/I18nProvider.tsx'
import { Button } from './Button.tsx'
import styles from './ConfirmDialog.module.css'

/** Asks before something that can't be undone. The native dialog traps and restores focus. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  body: string
  confirmLabel: string
  onConfirm: () => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  }, [open])

  return (
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId} onClose={onClose}>
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
      <p className={styles.body}>{body}</p>
      <div className={styles.actions}>
        <Button onClick={onClose}>{t('action.cancel')}</Button>
        <Button variant="danger" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  )
}
