import { type ReactNode, use, useMemo, useSyncExternalStore } from 'react'
import { Link, useParams } from 'wouter'

import type { GroupInfo, GroupState } from '../../domain/fold.ts'
import { useI18n } from '../../i18n/I18nProvider.tsx'
import { groupStore, type GroupStore, type GroupView } from '../../sync/groups.ts'
import { ButtonLink, IconLink } from '../../ui/Button.tsx'
import { Icon } from '../../ui/Icon.tsx'
import { type IconNode, List, RotateCcwClock, Scale, Settings } from '../../ui/icons.ts'
import { Page } from '../../ui/Page.tsx'
import styles from './group.module.css'
import { makePeople, type People } from './people.ts'

export interface Group {
  readonly id: string
  readonly store: GroupStore
  readonly view: GroupView
  readonly state: GroupState
  readonly info: GroupInfo
  readonly people: People
}

const NO_STORE = {
  subscribe: () => () => undefined,
  getSnapshot: () => null,
}

/** Reads the group named in the URL, suspending until it's loaded. */
export function GroupGate({ children }: { children: (group: Group) => ReactNode }) {
  const { groupId } = useParams<{ groupId: string }>()
  const { t } = useI18n()
  const store = use(groupStore(groupId))
  const view = useSyncExternalStore(
    store?.subscribe ?? NO_STORE.subscribe,
    store?.getSnapshot ?? NO_STORE.getSnapshot,
  )
  const people = useMemo(() => view && makePeople(view.state, view.record.me, t), [view, t])

  if (!store || !view || view.removed || !view.state.group || !people) return <GroupMissing />
  return children({
    id: groupId,
    store,
    view,
    state: view.state,
    info: view.state.group,
    people,
  })
}

function GroupMissing() {
  const { t } = useI18n()
  return (
    <Page
      title={t('group.missing.title')}
      heading={t('group.missing.title')}
      back={{ href: '/', label: t('app.allGroups') }}
    >
      <p>{t('group.missing.body')}</p>
      <ButtonLink href="/" variant="primary">
        {t('app.goHome')}
      </ButtonLink>
    </Page>
  )
}

export type GroupTab = 'expenses' | 'balances' | 'activity'

/** Whether another device changed something this one hasn't looked at yet. */
function hasUnread({ state, view }: Group): boolean {
  const seen = view.record.readUpTo ?? ''
  return state.activity.some((entry) => entry.actor !== view.record.actor && entry.hlc > seen)
}

/** A screen with the group's header, settings link and bottom tabs. */
export function GroupTabsPage({
  group,
  tab,
  heading,
  floating,
  children,
}: {
  group: Group
  tab: GroupTab
  heading: string
  floating?: ReactNode
  children: ReactNode
}) {
  const { t } = useI18n()
  const base = `/g/${group.id}`
  const unread = tab !== 'activity' && hasUnread(group)
  const tabs: { key: GroupTab; href: string; label: string; name?: string; icon: IconNode }[] = [
    { key: 'expenses', href: base, label: t('group.tab.expenses'), icon: List },
    { key: 'balances', href: `${base}/balances`, label: t('group.tab.balances'), icon: Scale },
    {
      key: 'activity',
      href: `${base}/activity`,
      label: t('group.tab.activity'),
      ...(unread && { name: t('group.tab.activityUnread') }),
      icon: RotateCcwClock,
    },
  ]
  return (
    <Page
      title={t('group.pageTitle', { page: heading, group: group.info.name })}
      heading={heading}
      headingHidden
      barTitle={group.info.name}
      back={{ href: '/', label: t('app.allGroups') }}
      actions={<IconLink href={`${base}/settings`} icon={Settings} label={t('group.settings')} />}
      className={floating ? `${styles.tabsPage} ${styles.withFloating}` : styles.tabsPage}
      footer={
        <>
          {floating}
          <nav className={styles.tabs} aria-label={t('group.tabs')}>
            <ul className={styles.tabList}>
              {tabs.map((item) => (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    className={styles.tab}
                    aria-current={item.key === tab ? 'page' : undefined}
                    aria-label={item.name}
                  >
                    <Icon icon={item.icon} size={22} />
                    <span>{item.label}</span>
                    {item.name && <span className={styles.dot} />}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </>
      }
    >
      {children}
    </Page>
  )
}

export const groupStyles = styles
