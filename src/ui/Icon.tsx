import { createElement } from 'react'

import type { IconNode } from './icons.ts'

/** Draws an icon. Decorative (hidden from screen readers) unless it has a label. */
export function Icon({
  icon,
  size = 20,
  label,
  className,
}: {
  icon: IconNode
  size?: number
  label?: string
  className?: string
}) {
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true }
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      {...a11y}
    >
      {icon.map(([tag, attrs], index) => createElement(tag, { key: index, ...attrs }))}
    </svg>
  )
}
