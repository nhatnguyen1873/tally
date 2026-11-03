import { useEffect, useState } from 'react'

import styles from './ShareSheet.module.css'

/** One SVG path for the dark modules, a horizontal run at a time. */
function toPath(modules: readonly (readonly boolean[])[]): string {
  let path = ''
  modules.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue
      let run = 1
      while (row[x + run]) run++
      path += `M${x} ${y}h${run}v1h-${run}z`
      x += run - 1
    }
  })
  return path
}

/**
 * A QR code of `text`. The encoder loads only when a code is shown. Always
 * dark on light, whatever the theme, so every camera can read it.
 */
export function QrCode({ text, label }: { text: string; label: string }) {
  const [code, setCode] = useState<{ text: string; size: number; path: string } | null>(null)

  useEffect(() => {
    let live = true
    void import('uqr').then(({ encode }) => {
      if (!live) return
      // A four-module quiet zone, as the standard asks for.
      const { data, size } = encode(text, { ecc: 'M', border: 4 })
      setCode({ text, size, path: toPath(data) })
    })
    return () => {
      live = false
    }
  }, [text])

  if (code?.text !== text) return <div className={styles.qr} aria-hidden="true" />
  return (
    <svg
      className={styles.qr}
      viewBox={`0 0 ${code.size} ${code.size}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect width={code.size} height={code.size} fill="#fff" />
      <path d={code.path} fill="#000" />
    </svg>
  )
}
