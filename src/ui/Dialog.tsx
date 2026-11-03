import { type ReactNode, useEffect, useId, useRef } from 'react'

import { IconButton } from './Button.tsx'
import styles from './Dialog.module.css'
import { X } from './icons.ts'

/**
 * A modal dialog on the native <dialog>, which traps focus, closes on Escape
 * and returns focus to where it was.
 */
export function Dialog({
  open,
  title,
  closeLabel,
  onClose,
  children,
}: {
  open: boolean
  title: string
  /** Adds a close button in the corner, for dialogs without a Cancel. */
  closeLabel?: string
  onClose: () => void
  children: ReactNode
}) {
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
      <div className={styles.header}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {closeLabel && (
          <IconButton icon={X} label={closeLabel} className={styles.close} onClick={onClose} />
        )}
      </div>
      {open && children}
    </dialog>
  )
}

export const dialogStyles = styles
