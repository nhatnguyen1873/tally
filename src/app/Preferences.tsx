import type { LanguagePreference } from '../i18n/language.ts'
import { useI18n } from '../i18n/I18nProvider.tsx'
import { SelectField } from '../ui/Field.tsx'
import { Section } from '../ui/Page.tsx'
import styles from './Preferences.module.css'
import { setPrefs, type ThemePreference, usePrefs } from './prefs.ts'

const LANGUAGES: readonly LanguagePreference[] = ['system', 'en', 'vi']
const THEMES: readonly ThemePreference[] = ['system', 'light', 'dark']

/** Language and theme for the whole app, saved on this device. */
export function Preferences() {
  const { t } = useI18n()
  const prefs = usePrefs()
  return (
    <Section title={t('settings.app')}>
      <div className={styles.grid}>
        <SelectField
          label={t('prefs.language')}
          value={prefs.language}
          options={LANGUAGES.map((value) => ({ value, label: t(`prefs.language.${value}`) }))}
          onValue={(value) => {
            setPrefs({ language: value as LanguagePreference })
          }}
        />
        <SelectField
          label={t('prefs.theme')}
          value={prefs.theme}
          options={THEMES.map((value) => ({ value, label: t(`prefs.theme.${value}`) }))}
          onValue={(value) => {
            setPrefs({ theme: value as ThemePreference })
          }}
        />
      </div>
    </Section>
  )
}
