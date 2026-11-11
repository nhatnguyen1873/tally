import { useEffect, useState } from 'react'

import { useI18n } from '../../i18n/I18nProvider.tsx'
import type { JoinOutcome } from '../../sync/join.ts'
import { Button, ButtonLink } from '../../ui/Button.tsx'
import { Page } from '../../ui/Page.tsx'
import styles from './join.module.css'

type Failure = Exclude<JoinOutcome, 'joined'>

const COPY = {
  offline: { title: 'join.offline.title', body: 'join.offline.body', retry: true },
  not_found: { title: 'join.notFound.title', body: 'join.notFound.body', retry: true },
  unauthorized: { title: 'join.badLink.title', body: 'join.badLink.body', retry: false },
  unreachable: { title: 'join.unreachable.title', body: 'join.unreachable.body', retry: true },
} as const satisfies Record<Failure, unknown>

/**
 * Opening an invite link for a group this device doesn't have yet: download
 * it. Once it's saved, GroupGate hears of it and shows the group.
 */
export function JoinScreen({ groupId, secret }: { groupId: string; secret: string }) {
  const { t } = useI18n()
  const [failure, setFailure] = useState<Failure | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    // Downloading needs the sync engine and its encryption. Like a group
    // screen, this screen shows first and loads them just after
    // (SPEC.md section 10), keeping an invite link's first load in budget.
    void import('../../sync/join.ts')
      .then(({ joinGroup }) => joinGroup(groupId, secret))
      .catch((): JoinOutcome => (navigator.onLine ? 'unreachable' : 'offline'))
      .then((outcome) => {
        if (live && outcome !== 'joined') setFailure(outcome)
      })
    return () => {
      live = false
    }
  }, [groupId, secret, attempt])

  // Coming back online is a good moment to try again.
  useEffect(() => {
    if (failure !== 'offline') return
    const retry = () => {
      setFailure(null)
      setAttempt((count) => count + 1)
    }
    window.addEventListener('online', retry)
    return () => {
      window.removeEventListener('online', retry)
    }
  }, [failure])

  if (!failure) {
    return (
      <Page title={t('join.downloading')} heading={t('join.downloading')}>
        <div className={styles.loading} aria-busy="true" />
      </Page>
    )
  }
  const copy = COPY[failure]
  return (
    <Page
      title={t(copy.title)}
      heading={t(copy.title)}
      back={{ href: '/', label: t('app.allGroups') }}
    >
      <p>{t(copy.body)}</p>
      <div className={styles.actions}>
        {copy.retry && (
          <Button
            variant="primary"
            onClick={() => {
              setFailure(null)
              setAttempt((count) => count + 1)
            }}
          >
            {t('action.retry')}
          </Button>
        )}
        <ButtonLink href="/">{t('app.goHome')}</ButtonLink>
      </div>
    </Page>
  )
}
