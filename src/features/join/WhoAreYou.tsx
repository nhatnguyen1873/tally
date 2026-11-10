import { type SubmitEvent, useState } from 'react'

import type { GroupInfo } from '../../domain/fold.ts'
import { LIMITS } from '../../domain/model.ts'
import { useI18n } from '../../i18n/I18nProvider.tsx'
import type { GroupStore } from '../../sync/groups.ts'
import { Avatar } from '../../ui/Avatar.tsx'
import { Button } from '../../ui/Button.tsx'
import { TextField } from '../../ui/Field.tsx'
import { Page, pageStyles, Section } from '../../ui/Page.tsx'
import { cleanText, type People } from '../group/people.ts'
import styles from './join.module.css'

/**
 * Each phone says which member it is, once per group: after joining, and
 * again if its member was removed. The choice stays on this phone.
 */
export function WhoAreYou({
  store,
  info,
  people,
  removed,
}: {
  store: GroupStore
  info: GroupInfo
  people: People
  removed: boolean
}) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [tried, setTried] = useState(false)
  const taken = people.all.some(
    (member) => member.name.toLowerCase() === cleanText(name).toLowerCase(),
  )
  const full = people.active.length >= LIMITS.members
  const error = full
    ? t('error.groupFull', { max: LIMITS.members })
    : !cleanText(name)
      ? t('error.yourName')
      : taken
        ? t('error.nameTaken')
        : null

  async function join(event: SubmitEvent) {
    event.preventDefault()
    setTried(true)
    if (error) return
    await store.joinAs(cleanText(name))
  }

  return (
    <Page
      title={t('group.pageTitle', { page: t('who.title'), group: info.name })}
      heading={t('who.title')}
      back={{ href: '/', label: t('app.allGroups') }}
    >
      <p>{removed ? t('who.removed') : t('who.body')}</p>

      <Section title={t('who.people', { group: info.name })}>
        <ul className={`${pageStyles.card} ${pageStyles.list}`}>
          {people.active.map((member) => (
            <li key={member.id}>
              <button
                type="button"
                className={styles.choice}
                onClick={() => void store.update({ me: member.id })}
              >
                <Avatar id={member.id} name={people.name(member.id)} />
                <span>{people.name(member.id)}</span>
              </button>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t('who.notListed')}>
        <form className={styles.form} noValidate onSubmit={(event) => void join(event)}>
          <TextField
            label={t('newGroup.yourName')}
            value={name}
            onValue={setName}
            maxLength={LIMITS.memberName}
            autoComplete="name"
            error={tried ? error : null}
          />
          <div>
            <Button type="submit" variant="primary">
              {t('who.join')}
            </Button>
          </div>
        </form>
      </Section>
    </Page>
  )
}
