import { lazy, Suspense, useEffect, useState } from 'react'
import { Link } from 'wouter'

import { Preferences } from '../../app/Preferences.tsx'
import { useI18n } from '../../i18n/I18nProvider.tsx'
import type { GroupSummary } from '../../sync/groups.ts'
import { Button, ButtonLink } from '../../ui/Button.tsx'
import { EmptyState } from '../../ui/EmptyState.tsx'
import { Link as LinkIcon, Plus, Users } from '../../ui/icons.ts'
import { Page, pageStyles, Section } from '../../ui/Page.tsx'
import groupStyles from '../group/group.module.css'
import styles from './HomeRoute.module.css'
import { InstallHint } from './InstallHint.tsx'

// Loads when tapped, keeping it out of every screen's first load.
const JoinDialog = lazy(() =>
  import('./JoinDialog.tsx').then(({ JoinDialog }) => ({ default: JoinDialog })),
)

/**
 * The groups on this device. Their code (IndexedDB, folding, sync) loads
 * after the first render, so it isn't on the critical path for the first
 * paint. Once listed, every group catches up with the relay in the
 * background, so the balances shown are current.
 */
function useGroupSummaries(): GroupSummary[] | null {
  const [summaries, setSummaries] = useState<GroupSummary[] | null>(null)
  useEffect(() => {
    let live = true
    let stop: (() => void) | undefined
    let caughtUp = false
    void Promise.all([import('../../sync/groups.ts'), import('../../sync/manager.ts')]).then(
      ([{ getSummaries, subscribeSummaries }, { catchUp }]) => {
        if (!live) return
        stop = subscribeSummaries(() => {
          const list = getSummaries()
          setSummaries(list)
          if (list && !caughtUp) {
            caughtUp = true
            catchUp(list.map((group) => group.id))
          }
        })
      },
    )
    return () => {
      live = false
      stop?.()
    }
  }, [])
  return summaries
}

export function HomeRoute() {
  const { t } = useI18n()
  const groups = useGroupSummaries()
  const [joining, setJoining] = useState(false)

  // The hero is the same for everyone, so the build prerenders it as the first
  // paint (src/prerender.tsx). Everything below waits for the groups and
  // appears at once, so nothing on screen moves when they arrive.
  return (
    <Page title={t('app.name')} heading={t('app.name')} headingHidden>
      <section className={styles.hero}>
        <p className={styles.tagline}>{t('home.tagline')}</p>
        <div className={styles.actions}>
          <ButtonLink href="/new" variant="primary" icon={Plus}>
            {t('home.newGroup')}
          </ButtonLink>
          <Button
            icon={LinkIcon}
            onClick={() => {
              setJoining(true)
            }}
          >
            {t('home.join')}
          </Button>
        </div>
      </section>
      {joining && (
        <Suspense>
          <JoinDialog
            open
            onClose={() => {
              setJoining(false)
            }}
          />
        </Suspense>
      )}

      {groups && (
        <>
          <Section title={t('home.yourGroups')}>
            {groups.length === 0 ? (
              <EmptyState icon={Users} text={t('home.intro')} />
            ) : (
              <ul className={`${pageStyles.card} ${pageStyles.list}`}>
                {groups.map((group) => (
                  <li key={group.id}>
                    <GroupRow group={group} />
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <InstallHint />
          <Preferences />
          <p className={styles.about}>
            <Link href="/about">{t('home.about')}</Link>
          </p>
        </>
      )}
    </Page>
  )
}

function GroupRow({ group }: { group: GroupSummary }) {
  const { t, money, relative } = useI18n()
  const { myNet } = group
  const status =
    myNet === null
      ? null
      : myNet > 0
        ? { text: t('summary.owed', { amount: money(myNet, group.currency) }), tone: 'positive' }
        : myNet < 0
          ? { text: t('summary.owe', { amount: money(-myNet, group.currency) }), tone: 'negative' }
          : { text: t('summary.settled'), tone: 'muted' }
  const details = [t('home.people', { count: group.people })]
  if (group.lastChangeAt !== null) {
    details.push(t('home.lastChange', { time: relative(group.lastChangeAt) }))
  }

  return (
    <Link href={`/g/${group.id}`} className={groupStyles.row}>
      <span className={groupStyles.rowText}>
        <span className={groupStyles.rowTitle}>{group.name}</span>
        <span className={groupStyles.rowDetail}>{details.join(' · ')}</span>
      </span>
      {status && (
        <span className={`${groupStyles.rowEnd} ${groupStyles[status.tone] ?? ''}`}>
          {status.text}
        </span>
      )}
    </Link>
  )
}
