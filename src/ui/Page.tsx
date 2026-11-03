import { type ReactNode, useEffect, useRef } from 'react'

import { useI18n } from '../i18n/I18nProvider.tsx'
import { IconLink } from './Button.tsx'
import { ChevronLeft } from './icons.ts'
import styles from './Page.module.css'
import { TallyMark } from './TallyMark.tsx'

// The first screen after loading keeps focus where the browser put it; every
// screen after that moves focus to its heading, so screen readers announce it.
let firstScreen = true

export function Page({
  title,
  heading,
  headingHidden,
  barTitle,
  back,
  actions,
  below,
  footer,
  className,
  children,
}: {
  /** The browser tab's title. */
  title: string
  /** The screen's h1. */
  heading: string
  /** Keep the h1 for screen readers only, when the header already shows it. */
  headingHidden?: boolean
  /** Text in the header bar; the brand shows when there's no back link. */
  barTitle?: string
  back?: { href: string; label: string }
  actions?: ReactNode
  /** Pinned under the header. */
  below?: ReactNode
  /** Fixed to the bottom of the screen, like a group's tabs. */
  footer?: ReactNode
  /** On the whole screen, for styles that depend on what the footer holds. */
  className?: string
  children: ReactNode
}) {
  const { t } = useI18n()
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    document.title = title
  }, [title])

  useEffect(() => {
    if (firstScreen) firstScreen = false
    else headingRef.current?.focus()
  }, [])

  return (
    <div className={[styles.page, className].filter(Boolean).join(' ')}>
      <header className={styles.header}>
        <div className={styles.bar}>
          {back ? (
            <>
              <IconLink href={back.href} icon={ChevronLeft} label={back.label} />
              <p className={styles.barTitle}>{barTitle ?? heading}</p>
            </>
          ) : (
            <p className={styles.brand}>
              <TallyMark className={styles.mark} />
              {t('app.name')}
              <span className={styles.preview}>{t('app.preview')}</span>
            </p>
          )}
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
        {below}
      </header>
      <main className={styles.main}>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className={headingHidden ? 'visually-hidden' : styles.heading}
        >
          {heading}
        </h1>
        {children}
      </main>
      {footer}
    </div>
  )
}

/** A titled part of a screen. */
export function Section({
  title,
  titleHidden,
  children,
  className,
}: {
  title: string
  titleHidden?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <section className={[styles.section, className].filter(Boolean).join(' ')}>
      <h2 className={titleHidden ? 'visually-hidden' : styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  )
}

export const pageStyles = styles
