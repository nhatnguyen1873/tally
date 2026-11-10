import { type SubmitEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'wouter'

import { LIMITS } from '../../domain/model.ts'
import { currencyFromCode } from '../../domain/money.ts'
import { useI18n } from '../../i18n/I18nProvider.tsx'
import { createGroup } from '../../sync/groups.ts'
import { Button, IconButton } from '../../ui/Button.tsx'
import { fieldStyles, SelectField, TextField } from '../../ui/Field.tsx'
import { UserPlus, X } from '../../ui/icons.ts'
import { Page, pageStyles } from '../../ui/Page.tsx'
import { currencyOptions, defaultCurrency } from '../group/currencies.ts'
import { cleanText } from '../group/people.ts'
import styles from './NewGroupRoute.module.css'

interface Person {
  readonly key: number
  readonly name: string
}

export default function NewGroupRoute() {
  const { t, language, currencyName } = useI18n()
  const [, navigate] = useLocation()
  const form = useRef<HTMLFormElement>(null)
  const nextKey = useRef(1)
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState(() => defaultCurrency(language, navigator.languages))
  const [myName, setMyName] = useState('')
  const [others, setOthers] = useState<Person[]>([{ key: 0, name: '' }])
  const [attempts, setAttempts] = useState(0)
  const [saving, setSaving] = useState(false)

  const options = useMemo(
    () =>
      currencyOptions((code) => t('newGroup.currencyOption', { code, name: currencyName(code) })),
    [t, currencyName],
  )

  const people = others.map((person) => cleanText(person.name)).filter(Boolean)
  const everyone = [cleanText(myName), ...people].filter(Boolean)
  const duplicated =
    new Set(everyone.map((person) => person.toLowerCase())).size !== everyone.length
  const errors = {
    name: cleanText(name) ? null : t('error.groupName'),
    myName: cleanText(myName) ? null : t('error.yourName'),
    others: people.length === 0 ? t('error.others') : duplicated ? t('error.duplicateNames') : null,
  }
  const shown = attempts > 0

  // After a failed attempt, take the person to the first problem.
  useEffect(() => {
    if (attempts > 0) form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [attempts])

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    const chosen = currencyFromCode(currency)
    if (errors.name || errors.myName || errors.others || !chosen) {
      setAttempts((count) => count + 1)
      return
    }
    setSaving(true)
    const id = await createGroup({
      name: cleanText(name),
      currency: chosen,
      myName: cleanText(myName),
      others: people,
    })
    // The new group opens with its invite, ready to send (SPEC.md section 3, step 2).
    navigate(`/g/${id}`, { replace: true, state: { share: true } })
  }

  return (
    <Page
      title={t('newGroup.title')}
      heading={t('newGroup.title')}
      back={{ href: '/', label: t('app.allGroups') }}
    >
      <form
        ref={form}
        className={pageStyles.stack}
        noValidate
        onSubmit={(event) => void submit(event)}
      >
        <TextField
          label={t('newGroup.name')}
          value={name}
          onValue={setName}
          placeholder={t('newGroup.namePlaceholder')}
          maxLength={LIMITS.groupName}
          autoComplete="off"
          error={shown ? errors.name : null}
        />
        <SelectField
          label={t('newGroup.currency')}
          value={currency}
          options={options}
          onValue={setCurrency}
          hint={t('newGroup.currencyHint')}
        />
        <TextField
          label={t('newGroup.yourName')}
          value={myName}
          onValue={setMyName}
          maxLength={LIMITS.memberName}
          autoComplete="given-name"
          error={shown ? errors.myName : null}
        />

        <fieldset className={styles.people}>
          <legend className={styles.legend}>{t('newGroup.others')}</legend>
          {others.map((person, index) => (
            <div key={person.key} className={styles.person}>
              <TextField
                label={t('newGroup.person', { number: index + 1 })}
                labelHidden
                placeholder={t('newGroup.person', { number: index + 1 })}
                value={person.name}
                maxLength={LIMITS.memberName}
                autoComplete="off"
                onValue={(value) => {
                  setOthers((list) =>
                    list.map((item) => (item.key === person.key ? { ...item, name: value } : item)),
                  )
                }}
                {...(shown && errors.others && index === 0 ? { 'aria-invalid': true } : {})}
              />
              {others.length > 1 && (
                <IconButton
                  icon={X}
                  label={t('newGroup.removePerson', { number: index + 1 })}
                  onClick={() => {
                    setOthers((list) => list.filter((item) => item.key !== person.key))
                  }}
                />
              )}
            </div>
          ))}
          {shown && errors.others && <p className={fieldStyles.error}>{errors.others}</p>}
          {/* You and the others make the group, up to its limit. */}
          {others.length < LIMITS.members - 1 ? (
            <div>
              <Button
                icon={UserPlus}
                onClick={() => {
                  setOthers((list) => [...list, { key: nextKey.current++, name: '' }])
                }}
              >
                {t('newGroup.addPerson')}
              </Button>
            </div>
          ) : (
            <p className={fieldStyles.hint}>{t('error.groupFull', { max: LIMITS.members })}</p>
          )}
        </fieldset>

        <Button type="submit" variant="primary" wide disabled={saving}>
          {t('newGroup.create')}
        </Button>
      </form>
    </Page>
  )
}
