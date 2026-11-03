import { useState } from 'react'

import { useI18n } from '../i18n/I18nProvider.tsx'
import { IconButton } from '../ui/Button.tsx'
import { X } from '../ui/icons.ts'
import { toastStyles } from '../ui/Toast.tsx'
import { inAppBrowser } from './install.ts'
import styles from './InAppBrowserHint.module.css'

const DISMISSED = 'tally:inAppHintDismissed'

function dismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISSED) !== null
  } catch {
    return false
  }
}

/**
 * Inside an app's built-in browser: open the page in a real browser, where
 * Tally's data lasts and it can be installed. Shown until dismissed, once
 * per visit.
 */
export function InAppBrowserHint() {
  const { t } = useI18n()
  const [shown, setShown] = useState(() => inAppBrowser() && !dismissed())
  if (!shown) return null
  return (
    <div className={`${toastStyles.toast} ${styles.hint}`}>
      <p className={toastStyles.text}>
        {t('inApp.text')} <strong>{t('inApp.how')}</strong>
      </p>
      <IconButton
        icon={X}
        label={t('action.dismiss')}
        className={toastStyles.dismiss}
        onClick={() => {
          setShown(false)
          try {
            sessionStorage.setItem(DISMISSED, '1')
          } catch {
            // Storage is unavailable: it shows again next visit.
          }
        }}
      />
    </div>
  )
}
