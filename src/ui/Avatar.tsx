import type { CSSProperties } from 'react'

import { hash32 } from '../domain/util.ts'
import styles from './Avatar.module.css'

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => String.fromCodePoint(word.codePointAt(0) ?? 63))
    .join('')
    .toUpperCase()
}

/** Initials on a color picked from the member ID, so a person keeps their color. */
export function Avatar({ id, name }: { id: string; name: string }) {
  const style = { '--hue': hash32(id) % 360 } as CSSProperties
  return (
    <span className={styles.avatar} style={style} aria-hidden="true">
      {initials(name)}
    </span>
  )
}
