import type { ReactNode } from 'react'

import styles from './EmptyState.module.css'
import { Icon } from './Icon.tsx'
import type { IconNode } from './icons.ts'

export function EmptyState({
  icon,
  text,
  children,
}: {
  icon: IconNode
  text: string
  children?: ReactNode
}) {
  return (
    <div className={styles.empty}>
      <Icon icon={icon} size={32} className={styles.icon} />
      <p className={styles.text}>{text}</p>
      {children}
    </div>
  )
}
