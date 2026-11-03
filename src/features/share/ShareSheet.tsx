import { useI18n } from '../../i18n/I18nProvider.tsx'
import { inviteLink } from '../../sync/links.ts'
import { Button } from '../../ui/Button.tsx'
import { Dialog, dialogStyles } from '../../ui/Dialog.tsx'
import { Copy, Share2 } from '../../ui/icons.ts'
import { useToast } from '../../ui/Toast.tsx'
import { QrCode } from './QrCode.tsx'
import styles from './ShareSheet.module.css'

/** The invite: a QR code, Copy link, and Share where the browser has it. */
export function ShareSheet({
  open,
  groupId,
  secret,
  groupName,
  onClose,
}: {
  open: boolean
  groupId: string
  secret: string
  groupName: string
  onClose: () => void
}) {
  const { t } = useI18n()
  const toast = useToast()
  const link = inviteLink(location.origin, { groupId, secret })
  const canShare = typeof navigator.share === 'function'

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      toast({ text: t('share.copied') })
    } catch {
      // No clipboard access: select the link, to copy by hand.
      const input = document.getElementById(`invite-${groupId}`)
      if (input instanceof HTMLInputElement) {
        input.focus()
        input.select()
      }
    }
  }

  async function share() {
    try {
      await navigator.share({ title: t('share.shareText', { group: groupName }), url: link })
    } catch {
      // Cancelled, or not allowed here: the other ways are on screen.
    }
  }

  return (
    <Dialog open={open} title={t('share.title')} closeLabel={t('action.close')} onClose={onClose}>
      <p className={dialogStyles.body}>{t('share.body')}</p>
      <div className={styles.sheet}>
        <QrCode text={link} label={t('share.qr')} />
        <label className="visually-hidden" htmlFor={`invite-${groupId}`}>
          {t('share.link')}
        </label>
        <input id={`invite-${groupId}`} className={styles.link} value={link} readOnly />
        <p className={styles.warning}>{t('share.warning')}</p>
      </div>
      <div className={styles.buttons}>
        {canShare && (
          <Button variant="primary" icon={Share2} wide onClick={() => void share()}>
            {t('share.share')}
          </Button>
        )}
        <Button
          variant={canShare ? 'secondary' : 'primary'}
          icon={Copy}
          wide
          onClick={() => void copy()}
        >
          {t('share.copy')}
        </Button>
      </div>
    </Dialog>
  )
}
