import { type SubmitEvent, useState } from 'react'
import { useLocation } from 'wouter'

import { useI18n } from '../../i18n/I18nProvider.tsx'
import { parseInvite } from '../../sync/links.ts'
import { Button } from '../../ui/Button.tsx'
import { Dialog, dialogStyles } from '../../ui/Dialog.tsx'
import { TextField } from '../../ui/Field.tsx'

/**
 * Pasting an invite link, for when tapping it opened somewhere else: an
 * in-app browser, or Safari instead of the installed app.
 */
export function JoinDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n()
  const [, navigate] = useLocation()
  const [text, setText] = useState('')
  const [tried, setTried] = useState(false)
  const invite = parseInvite(text)

  function join(event: SubmitEvent) {
    event.preventDefault()
    setTried(true)
    if (!invite) return
    onClose()
    navigate(`/g/${invite.groupId}#${invite.secret}`)
  }

  return (
    <Dialog open={open} title={t('home.joinTitle')} onClose={onClose}>
      <form noValidate onSubmit={join}>
        <div className={dialogStyles.body}>
          <TextField
            label={t('home.joinField')}
            hint={t('home.joinHint')}
            value={text}
            onValue={setText}
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            error={tried && !invite ? t('error.invite') : null}
          />
        </div>
        <div className={dialogStyles.actions}>
          <Button onClick={onClose}>{t('action.cancel')}</Button>
          <Button type="submit" variant="primary">
            {t('home.joinButton')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
