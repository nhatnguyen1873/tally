import { type SubmitEvent, Suspense, useMemo, useState } from 'react'
import { useLocation } from 'wouter'

import type { Member } from '../../domain/fold.ts'
import { randomId } from '../../domain/ids.ts'
import { displayNames, isInvolved } from '../../domain/members.ts'
import { CATEGORIES, LIMITS } from '../../domain/model.ts'
import { currencyFromCode } from '../../domain/money.ts'
import { Preferences } from '../../app/Preferences.tsx'
import { todayIso } from '../../i18n/format.ts'
import { useI18n } from '../../i18n/I18nProvider.tsx'
import { removeGroup } from '../../sync/groups.ts'
import { stopSync } from '../../sync/manager.ts'
import { Avatar } from '../../ui/Avatar.tsx'
import { Button, IconButton } from '../../ui/Button.tsx'
import { ConfirmDialog } from '../../ui/ConfirmDialog.tsx'
import { SelectField, TextField } from '../../ui/Field.tsx'
import { Download, Share2, Trash, Undo2, UserPlus } from '../../ui/icons.ts'
import { Page, pageStyles, Section } from '../../ui/Page.tsx'
import { useToast } from '../../ui/Toast.tsx'
import { currencyOptions } from '../group/currencies.ts'
import { type Group, GroupGate, groupStyles, ShareSheet, useSyncStatus } from '../group/group.tsx'
import { cleanText } from '../group/people.ts'
import { downloadText, fileNameFor } from './download.ts'
import styles from './SettingsRoute.module.css'

export default function SettingsRoute() {
  return <GroupGate>{(group) => <SettingsScreen group={group} />}</GroupGate>
}

/** Whether another member already uses this name, ignoring case. */
function nameTaken(group: Group, name: string, except?: string): boolean {
  const wanted = cleanText(name).toLowerCase()
  return group.people.all.some(
    (member) => member.id !== except && member.name.toLowerCase() === wanted,
  )
}

function SettingsScreen({ group }: { group: Group }) {
  const { t, currencyName } = useI18n()
  const [, navigate] = useLocation()
  const { people, info, state, store } = group
  const [name, setName] = useState(info.name)
  const [confirming, setConfirming] = useState(false)
  const [sharing, setSharing] = useState(false)
  const { pending } = useSyncStatus(group.id)
  const toast = useToast()
  // Changing the currency would reinterpret every recorded amount.
  const locked = state.expenses.size > 0 || state.payments.size > 0
  const options = useMemo(
    () =>
      currencyOptions((code) => t('newGroup.currencyOption', { code, name: currencyName(code) })),
    [t, currencyName],
  )
  const nameError = cleanText(name) ? null : t('error.groupName')

  async function saveName(event: SubmitEvent) {
    event.preventDefault()
    if (nameError || cleanText(name) === info.name) return
    await store.write([{ entity: 'group', key: group.id, set: { name: cleanText(name) } }])
    toast({ text: t('settings.saved') })
  }

  async function exportCsv() {
    const { groupCsv } = await import('../../domain/csv.ts')
    const csv = groupCsv(state, displayNames(state.members), {
      date: t('csv.date'),
      type: t('csv.type'),
      title: t('csv.title'),
      category: t('csv.category'),
      amount: t('csv.amount'),
      currency: t('csv.currency'),
      from: t('csv.from'),
      to: t('csv.to'),
      expense: t('csv.expense'),
      payment: t('csv.payment'),
      categories: Object.fromEntries(
        CATEGORIES.map((category) => [category, t(`category.${category}`)]),
      ) as Record<(typeof CATEGORIES)[number], string>,
    })
    // The byte-order mark makes Excel read the file as UTF-8, so Vietnamese shows correctly.
    downloadText(
      `${fileNameFor(info.name)}-${todayIso()}.csv`,
      `\uFEFF${csv}`,
      'text/csv;charset=utf-8',
    )
  }

  return (
    <Page
      title={t('group.pageTitle', { page: t('settings.title'), group: info.name })}
      heading={t('settings.title')}
      back={{ href: `/g/${group.id}`, label: t('app.back') }}
    >
      <Section title={t('settings.group')}>
        <form className={styles.inline} noValidate onSubmit={(event) => void saveName(event)}>
          <TextField
            label={t('settings.groupName')}
            value={name}
            onValue={setName}
            maxLength={LIMITS.groupName}
            autoComplete="off"
            error={nameError}
          />
          <Button type="submit" disabled={Boolean(nameError) || cleanText(name) === info.name}>
            {t('action.save')}
          </Button>
        </form>
        <SelectField
          label={t('settings.currency')}
          value={info.currency.code}
          options={options}
          disabled={locked}
          hint={locked ? t('settings.currencyLocked') : undefined}
          onValue={(code) => {
            const currency = currencyFromCode(code)
            if (currency) void store.write([{ entity: 'group', key: group.id, set: { currency } }])
          }}
        />
      </Section>

      <Section title={t('settings.people')}>
        <ul className={`${pageStyles.card} ${pageStyles.list}`}>
          {people.all.map((member) => (
            <li key={member.id}>
              <MemberRow group={group} member={member} />
            </li>
          ))}
        </ul>
        <AddPerson group={group} />
      </Section>

      <Section title={t('settings.you')}>
        <SelectField
          label={t('settings.youAre')}
          value={people.me ?? ''}
          options={people.active.map((member) => ({
            value: member.id,
            label: people.name(member.id),
          }))}
          hint={t('settings.youHint')}
          onValue={(me) => void store.update({ me })}
        />
      </Section>

      <Section title={t('settings.invite')}>
        <p className={groupStyles.muted}>{t('settings.inviteHint')}</p>
        <div>
          <Button
            icon={Share2}
            onClick={() => {
              setSharing(true)
            }}
          >
            {t('group.share')}
          </Button>
        </div>
      </Section>

      <Section title={t('settings.export')}>
        <p className={groupStyles.muted}>{t('settings.exportHint')}</p>
        <div>
          <Button icon={Download} onClick={() => void exportCsv()}>
            {t('settings.download')}
          </Button>
        </div>
      </Section>

      <Preferences />

      <Section title={t('settings.removeGroup')}>
        <p className={groupStyles.muted}>{t('settings.removeHint')}</p>
        <div>
          <Button
            variant="danger"
            icon={Trash}
            onClick={() => {
              setConfirming(true)
            }}
          >
            {t('settings.removeButton')}
          </Button>
        </div>
      </Section>

      <ConfirmDialog
        open={confirming}
        title={t('settings.removeConfirm', { name: info.name })}
        body={
          pending > 0 ? t('settings.pending', { count: pending }) : t('settings.removeConfirmBody')
        }
        confirmLabel={t('settings.removeButton')}
        onConfirm={() => {
          stopSync(group.id)
          void removeGroup(group.id).then(() => {
            navigate('/', { replace: true })
          })
        }}
        onClose={() => {
          setConfirming(false)
        }}
      />
      {sharing && (
        <Suspense>
          <ShareSheet
            open
            groupId={group.id}
            secret={group.view.record.secret}
            groupName={info.name}
            onClose={() => {
              setSharing(false)
            }}
          />
        </Suspense>
      )}
    </Page>
  )
}

function MemberRow({ group, member }: { group: Group; member: Member }) {
  const { t } = useI18n()
  const toast = useToast()
  const [name, setName] = useState(member.name)
  const { people, store } = group
  const involved = isInvolved(group.state, member.id)
  const display = people.name(member.id)
  const error = !cleanText(name)
    ? t('error.name')
    : nameTaken(group, name, member.id)
      ? t('error.nameTaken')
      : null
  const edited = cleanText(name) !== member.name

  async function rename(event: SubmitEvent) {
    event.preventDefault()
    if (error || !edited) return
    await store.write([{ entity: 'member', key: member.id, set: { name: cleanText(name) } }])
    toast({ text: t('settings.saved') })
  }

  async function setRemoved(deleted: boolean) {
    await store.write([{ entity: 'member', key: member.id, set: { deleted } }])
    if (deleted) {
      toast({
        text: t('settings.personRemoved', { name: display }),
        action: { label: t('action.undo'), run: () => void setRemoved(false) },
      })
    }
  }

  return (
    <div className={styles.member}>
      <Avatar id={member.id} name={display} />
      <form className={styles.memberForm} noValidate onSubmit={(event) => void rename(event)}>
        <TextField
          label={t('settings.nameFor', { name: display })}
          labelHidden
          value={name}
          onValue={setName}
          maxLength={LIMITS.memberName}
          autoComplete="off"
          error={edited ? error : null}
          hint={
            member.deleted
              ? t('settings.removed')
              : member.id === people.me
                ? t('person.youSuffix', { name: display })
                : involved
                  ? t('settings.cantRemove')
                  : undefined
          }
        />
        {edited && (
          <Button type="submit" small disabled={Boolean(error)}>
            {t('action.save')}
          </Button>
        )}
      </form>
      {member.deleted ? (
        <IconButton
          icon={Undo2}
          label={t('settings.restorePerson', { name: display })}
          onClick={() => void setRemoved(false)}
        />
      ) : (
        !involved &&
        member.id !== people.me && (
          <IconButton
            icon={Trash}
            label={t('settings.removePerson', { name: display })}
            onClick={() => void setRemoved(true)}
          />
        )
      )}
    </div>
  )
}

function AddPerson({ group }: { group: Group }) {
  const { t } = useI18n()
  const toast = useToast()
  const [name, setName] = useState('')
  const [tried, setTried] = useState(false)
  const error = !cleanText(name)
    ? t('error.name')
    : nameTaken(group, name)
      ? t('error.nameTaken')
      : null

  async function add(event: SubmitEvent) {
    event.preventDefault()
    setTried(true)
    if (error) return
    await group.store.write([{ entity: 'member', key: randomId(), set: { name: cleanText(name) } }])
    toast({ text: t('settings.personAdded', { name: cleanText(name) }) })
    setName('')
    setTried(false)
  }

  return (
    <form className={styles.inline} noValidate onSubmit={(event) => void add(event)}>
      <TextField
        label={t('settings.addPerson')}
        value={name}
        onValue={setName}
        maxLength={LIMITS.memberName}
        autoComplete="off"
        error={tried ? error : null}
      />
      <Button type="submit" icon={UserPlus}>
        {t('action.add')}
      </Button>
    </form>
  )
}
