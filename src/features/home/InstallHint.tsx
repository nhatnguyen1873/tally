import { useState, useSyncExternalStore } from 'react'

import { install, installWay, subscribeInstall } from '../../app/install.ts'
import { useI18n } from '../../i18n/I18nProvider.tsx'
import { Button, IconButton } from '../../ui/Button.tsx'
import { Share, X } from '../../ui/icons.ts'
import { Icon } from '../../ui/Icon.tsx'
import { pageStyles } from '../../ui/Page.tsx'
import styles from './HomeRoute.module.css'

const DISMISSED = 'tally:installHintDismissed'

function dismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED) !== null
  } catch {
    return false
  }
}

/** Install Tally: Android's prompt, or iOS's steps. Hidden once installed or dismissed. */
export function InstallHint() {
  const { t } = useI18n()
  const way = useSyncExternalStore(subscribeInstall, installWay, () => null)
  const [hidden, setHidden] = useState(dismissed)
  if (!way || hidden) return null
  return (
    <section className={`${pageStyles.card} ${styles.install}`} aria-labelledby="install-title">
      <div className={styles.installText}>
        <h2 id="install-title" className={styles.installTitle}>
          {t('install.title')}
        </h2>
        {way === 'prompt' ? (
          <p>{t('install.body')}</p>
        ) : (
          <p>
            {t('install.iosBefore')}
            <Icon icon={Share} size={18} className={styles.shareIcon} />
            {t('install.iosAfter')}
          </p>
        )}
        {way === 'prompt' && (
          <div>
            <Button variant="primary" onClick={() => void install()}>
              {t('install.button')}
            </Button>
          </div>
        )}
      </div>
      <IconButton
        icon={X}
        label={t('action.dismiss')}
        onClick={() => {
          setHidden(true)
          try {
            localStorage.setItem(DISMISSED, '1')
          } catch {
            // Storage is unavailable: it shows again next visit.
          }
        }}
      />
    </section>
  )
}
