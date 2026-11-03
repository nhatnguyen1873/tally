import {
  lazy,
  type ReactNode,
  Suspense,
  use,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'
import { Link, useParams } from 'wouter'

import type { GroupInfo, GroupState } from '../../domain/fold.ts'
import { useI18n } from '../../i18n/I18nProvider.tsx'
import type { MessageKey } from '../../i18n/en.ts'
import { groupStore, type GroupStore, type GroupView, onGroupChange } from '../../sync/groups.ts'
import { secretFromHash } from '../../sync/links.ts'
import { holdSync, type SyncStatus, syncEngine } from '../../sync/manager.ts'
import { ButtonLink, IconButton, IconLink } from '../../ui/Button.tsx'
import { Icon } from '../../ui/Icon.tsx'
import {
  ClockAlert,
  CloudAlert,
  CloudCheck,
  CloudOff,
  type IconNode,
  List,
  RefreshCw,
  RotateCcwClock,
  Scale,
  Settings,
  Share2,
} from '../../ui/icons.ts'
import { Page } from '../../ui/Page.tsx'
import { useToast } from '../../ui/Toast.tsx'
import styles from './group.module.css'
import { makePeople, type People } from './people.ts'

// Joining and sharing load on demand: most visits need neither.
const JoinScreen = lazy(() =>
  import('../join/JoinScreen.tsx').then(({ JoinScreen }) => ({ default: JoinScreen })),
)
const WhoAreYou = lazy(() =>
  import('../join/WhoAreYou.tsx').then(({ WhoAreYou }) => ({ default: WhoAreYou })),
)
export const ShareSheet = lazy(() =>
  import('../share/ShareSheet.tsx').then(({ ShareSheet }) => ({ default: ShareSheet })),
)

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

/**
 * Reads the group named in the URL, suspending until it's loaded, and keeps
 * it syncing while it's on screen. A group this device doesn't have is
 * downloaded when the address carries its key (an invite link), and a phone
 * that hasn't said who it is in the group is asked first.
 */
export function GroupGate({ children }: { children: (group: Group) => ReactNode }) {
  const { groupId } = useParams<{ groupId: string }>()
  const { t } = useI18n()
  // Read through a subscription, not by calling groupStore() during render
  // (which React Compiler would memoize): once a join saves the group, the
  // change notice brings the new promise.
  const loading = useSyncExternalStore(onGroupChange, () => groupStore(groupId))
  const store = use(loading)
  const view = useSyncExternalStore(
    store?.subscribe ?? NO_STORE.subscribe,
    store?.getSnapshot ?? NO_STORE.getSnapshot,
  )
  const people = useMemo(() => view && makePeople(view.state, view.record.me, t), [view, t])

  useEffect(() => (store ? holdSync(groupId) : undefined), [store, groupId])

  // Once the group is here, the key needn't stay in the address bar (or in
  // history); Share always gives the whole link.
  useEffect(() => {
    if (store && location.hash) {
      history.replaceState(history.state, '', location.pathname + location.search)
    }
  }, [store])

  if (!store) {
    const secret = secretFromHash(location.hash)
    if (secret) return <JoinScreen groupId={groupId} secret={secret} />
    return <GroupMissing incomplete={location.hash.length > 1} />
  }
  if (!view || view.removed || !view.state.group || !people) return <GroupMissing />
  const { me } = view.record
  const mine = me ? view.state.members.get(me) : undefined
  if (!mine || mine.deleted) {
    return <WhoAreYou store={store} info={view.state.group} people={people} removed={Boolean(me)} />
  }
  return children({
    id: groupId,
    store,
    view,
    state: view.state,
    info: view.state.group,
    people,
  })
}

/** No such group here, or a link cut short before its key. */
function GroupMissing({ incomplete = false }: { incomplete?: boolean }) {
  const { t } = useI18n()
  const title = incomplete ? t('join.incomplete.title') : t('group.missing.title')
  return (
    <Page title={title} heading={title} back={{ href: '/', label: t('app.allGroups') }}>
      <p>{incomplete ? t('join.incomplete.body') : t('group.missing.body')}</p>
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
  // Right after creating a group, its invite opens (see NewGroupRoute).
  const [sharing, setSharing] = useState(() => wantsShare())
  const status = useSyncStatus(group.id)
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
      actions={
        <>
          <SyncIndicator status={status} />
          <IconButton
            icon={Share2}
            label={t('group.share')}
            onClick={() => {
              setSharing(true)
            }}
          />
          <IconLink href={`${base}/settings`} icon={Settings} label={t('group.settings')} />
        </>
      }
      below={<ClockWarning offset={status.clockOffset} />}
      className={floating ? `${styles.tabsPage} ${styles.withFloating}` : styles.tabsPage}
      footer={
        <>
          {sharing && (
            <Suspense>
              <ShareSheet
                open
                groupId={group.id}
                secret={group.view.record.secret}
                groupName={group.info.name}
                onClose={() => {
                  setSharing(false)
                  clearShareRequest()
                }}
              />
            </Suspense>
          )}
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

/** Set by navigating with `{ state: { share: true } }`. */
function wantsShare(): boolean {
  const state: unknown = history.state
  return typeof state === 'object' && state !== null && 'share' in state && state.share === true
}

function clearShareRequest() {
  if (wantsShare()) history.replaceState({ ...(history.state as object), share: false }, '')
}

export function useSyncStatus(groupId: string): SyncStatus {
  const engine = syncEngine(groupId)
  return useSyncExternalStore(engine.subscribe, engine.getStatus)
}

const SYNC_LOOK = {
  synced: { icon: CloudCheck, detail: 'sync.detail.synced' },
  syncing: { icon: RefreshCw, detail: 'sync.detail.syncing' },
  offline: { icon: CloudOff, detail: 'sync.detail.offline' },
  unreachable: { icon: CloudAlert, detail: 'sync.detail.unreachable' },
} as const satisfies Record<SyncStatus['state'], { icon: IconNode; detail: MessageKey }>

/** The header's sync status: an icon (each state its own shape), with the words on tap. */
function SyncIndicator({ status }: { status: SyncStatus }) {
  const { t } = useI18n()
  const toast = useToast()
  const label =
    status.state === 'offline'
      ? status.pending > 0
        ? t('sync.offlineWaiting', { count: status.pending })
        : t('sync.offline')
      : t(`sync.${status.state}`)
  const look = SYNC_LOOK[status.state]
  return (
    <IconButton
      icon={look.icon}
      label={label}
      title={label}
      onClick={() => {
        toast({ text: `${label}. ${t(look.detail)}` })
      }}
    />
  )
}

/** Clocks more than five minutes off can put changes out of order (SPEC.md section 6.2). */
function ClockWarning({ offset }: { offset: number | null }) {
  const { t } = useI18n()
  if (offset === null || Math.abs(offset) <= 5 * 60_000) return null
  return (
    <p className={styles.clock}>
      <Icon icon={ClockAlert} size={18} />
      {t('clock.off', { minutes: Math.round(Math.abs(offset) / 60_000) })}
    </p>
  )
}

export const groupStyles = styles
