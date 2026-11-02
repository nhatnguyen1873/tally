import type { Activity } from '../../domain/fold.ts'
import type { EntityKind } from '../../domain/ops.ts'
import { useI18n } from '../../i18n/I18nProvider.tsx'
import { Avatar } from '../../ui/Avatar.tsx'
import { Button } from '../../ui/Button.tsx'
import { Undo2 } from '../../ui/icons.ts'
import { pageStyles, Section } from '../../ui/Page.tsx'
import { useToast } from '../../ui/Toast.tsx'
import type { Group } from '../group/group.tsx'
import styles from './History.module.css'
import { describe } from './describe.ts'

/** One activity entry: who did what, what changed, when, and Restore for deletions. */
export function ActivityEntry({
  group,
  entry,
  latest,
}: {
  group: Group
  entry: Activity
  /** Whether this is the newest entry about its item; only that one offers Restore. */
  latest: boolean
}) {
  const i18n = useI18n()
  const { t, relative } = i18n
  const toast = useToast()
  const { text, details, restorable } = describe(entry, group.state, group.people, i18n)

  return (
    <div className={styles.entry}>
      <Avatar id={entry.by} name={group.people.name(entry.by)} />
      <div className={styles.body}>
        <p>{text}</p>
        {details.map((line) => (
          <p key={line} className={styles.detail}>
            {line}
          </p>
        ))}
        <p className={styles.time}>
          <time dateTime={new Date(entry.at).toISOString()}>{relative(entry.at)}</time>
        </p>
      </div>
      {restorable && latest && (
        <Button
          small
          icon={Undo2}
          onClick={() => {
            void group.store
              .write([{ entity: entry.entity, key: entry.key, set: { deleted: false } }])
              .then(() => {
                toast({ text: t('activity.restored') })
              })
          }}
        >
          {t('action.restore')}
        </Button>
      )}
    </div>
  )
}

/** The newest entry about each item, by entity and key. */
export function latestEntries(activity: readonly Activity[]): Set<string> {
  const latest = new Map<string, string>()
  for (const entry of activity) latest.set(`${entry.entity}:${entry.key}`, entry.opId)
  return new Set(latest.values())
}

/** The changes to one expense or payment, newest first. */
export function History({
  group,
  entity,
  entityKey,
}: {
  group: Group
  entity: EntityKind
  entityKey: string
}) {
  const { t } = useI18n()
  const entries = group.state.activity
    .filter((entry) => entry.entity === entity && entry.key === entityKey)
    .reverse()
  if (entries.length === 0) return null
  return (
    <Section title={t('expense.history')}>
      <ol className={`${pageStyles.card} ${pageStyles.list}`}>
        {entries.map((entry, index) => (
          <li key={entry.opId}>
            <ActivityEntry group={group} entry={entry} latest={index === 0} />
          </li>
        ))}
      </ol>
    </Section>
  )
}
