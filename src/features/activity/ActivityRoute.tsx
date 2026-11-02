import { useEffect } from 'react'

import { useI18n } from '../../i18n/I18nProvider.tsx'
import { EmptyState } from '../../ui/EmptyState.tsx'
import { RotateCcwClock } from '../../ui/icons.ts'
import { pageStyles } from '../../ui/Page.tsx'
import { type Group, GroupGate, GroupTabsPage } from '../group/group.tsx'
import { ActivityEntry, latestEntries } from './History.tsx'

export default function ActivityRoute() {
  return <GroupGate>{(group) => <ActivityScreen group={group} />}</GroupGate>
}

function ActivityScreen({ group }: { group: Group }) {
  const { t } = useI18n()
  const { activity } = group.state
  const latest = activity.at(-1)?.hlc ?? null
  const newest = latestEntries(activity)

  // Looking at the feed marks everything in it as seen.
  useEffect(() => {
    if (latest && latest !== group.view.record.readUpTo)
      void group.store.update({ readUpTo: latest })
  }, [latest, group.store, group.view.record.readUpTo])

  return (
    <GroupTabsPage group={group} tab="activity" heading={t('activity.heading')}>
      {activity.length === 0 ? (
        <EmptyState icon={RotateCcwClock} text={t('activity.empty')} />
      ) : (
        <ol className={`${pageStyles.card} ${pageStyles.list}`}>
          {[...activity].reverse().map((entry) => (
            <li key={entry.opId}>
              <ActivityEntry group={group} entry={entry} latest={newest.has(entry.opId)} />
            </li>
          ))}
        </ol>
      )}
    </GroupTabsPage>
  )
}
