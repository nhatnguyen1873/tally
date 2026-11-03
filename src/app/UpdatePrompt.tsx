import { useSyncExternalStore } from 'react'

import { useI18n } from '../i18n/I18nProvider.tsx'
import { toastStyles } from '../ui/Toast.tsx'
import { applyUpdate, isUpdateReady, subscribeUpdate } from './updates.ts'

/** "New version ready · Reload": stays until tapped (SPEC.md section 7). */
export function UpdatePrompt() {
  const { t } = useI18n()
  const ready = useSyncExternalStore(subscribeUpdate, isUpdateReady, () => false)
  if (!ready) return null
  return (
    <div className={toastStyles.toast}>
      <span className={toastStyles.text}>{t('update.ready')}</span>
      <button type="button" className={toastStyles.action} onClick={applyUpdate}>
        {t('update.reload')}
      </button>
    </div>
  )
}
