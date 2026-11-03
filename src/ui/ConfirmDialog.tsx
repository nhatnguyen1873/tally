import { useI18n } from '../i18n/I18nProvider.tsx'
import { Button } from './Button.tsx'
import { Dialog, dialogStyles } from './Dialog.tsx'

/** Asks before something that can't be undone. */
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
  return (
    <Dialog open={open} title={title} onClose={onClose}>
      <p className={dialogStyles.body}>{body}</p>
      <div className={dialogStyles.actions}>
        <Button onClick={onClose}>{t('action.cancel')}</Button>
        <Button variant="danger" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  )
}
