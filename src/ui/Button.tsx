import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'wouter'

import styles from './Button.module.css'
import { Icon } from './Icon.tsx'
import type { IconNode } from './icons.ts'

export type Variant = 'primary' | 'secondary' | 'quiet' | 'danger'

interface Look {
  variant?: Variant
  icon?: IconNode
  /** Fills the width of its container. */
  wide?: boolean
  small?: boolean
}

function classes({ variant = 'secondary', wide, small }: Look, extra?: string) {
  return [styles.button, styles[variant], wide && styles.wide, small && styles.small, extra]
    .filter(Boolean)
    .join(' ')
}

export function Button({
  variant,
  icon,
  wide,
  small,
  className,
  children,
  type = 'button',
  ...props
}: Look & ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button type={type} className={classes({ variant, wide, small }, className)} {...props}>
      {icon && <Icon icon={icon} />}
      <span>{children}</span>
    </button>
  )
}

export function ButtonLink({
  href,
  variant,
  icon,
  wide,
  small,
  className,
  children,
}: Look & { href: string; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={classes({ variant, wide, small }, className)}>
      {icon && <Icon icon={icon} />}
      <span>{children}</span>
    </Link>
  )
}

/** A square button that shows only an icon; `label` is what screen readers announce. */
export function IconButton({
  icon,
  label,
  className,
  type = 'button',
  ...props
}: { icon: IconNode; label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={[styles.iconButton, className].filter(Boolean).join(' ')}
      aria-label={label}
      {...props}
    >
      <Icon icon={icon} size={22} />
    </button>
  )
}

export function IconLink({ href, icon, label }: { href: string; icon: IconNode; label: string }) {
  return (
    <Link href={href} className={styles.iconButton} aria-label={label}>
      <Icon icon={icon} size={22} />
    </Link>
  )
}
