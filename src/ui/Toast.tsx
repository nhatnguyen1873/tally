import { createContext, type ReactNode, use, useEffect, useState } from 'react'

import { useI18n } from '../i18n/I18nProvider.tsx'
import { IconButton } from './Button.tsx'
import { X } from './icons.ts'
import styles from './Toast.module.css'

export interface Toast {
  readonly text: string
  readonly action?: { readonly label: string; readonly run: () => void }
}

const ToastContext = createContext<(toast: Toast) => void>(() => undefined)

/**
 * One message at a time at the bottom of the screen, read out politely by
 * screen readers. Messages with an action (Undo) stay longer; what they undo
 * can also be restored from the Activity tab.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const [current, setCurrent] = useState<(Toast & { id: number }) | null>(null)

  useEffect(() => {
    if (!current) return
    const timer = setTimeout(
      () => {
        setCurrent(null)
      },
      current.action ? 8000 : 4000,
    )
    return () => {
      clearTimeout(timer)
    }
  }, [current])

  return (
    <ToastContext
      value={(toast) => {
        setCurrent({ ...toast, id: Date.now() })
      }}
    >
      {children}
      <div className={styles.region} role="status">
        {current && (
          <div key={current.id} className={styles.toast}>
            <span className={styles.text}>{current.text}</span>
            {current.action && (
              <button
                type="button"
                className={styles.action}
                onClick={() => {
                  current.action?.run()
                  setCurrent(null)
                }}
              >
                {current.action.label}
              </button>
            )}
            <IconButton
              icon={X}
              label={t('action.dismiss')}
              className={styles.dismiss}
              onClick={() => {
                setCurrent(null)
              }}
            />
          </div>
        )}
      </div>
    </ToastContext>
  )
}

export function useToast(): (toast: Toast) => void {
  return use(ToastContext)
}
