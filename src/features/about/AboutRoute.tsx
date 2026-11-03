import { useI18n } from '../../i18n/I18nProvider.tsx'
import { Page, Section } from '../../ui/Page.tsx'
import styles from './AboutRoute.module.css'
import { ABOUT } from './copy.ts'

const SOURCE = 'https://github.com/nhatnguyen1873/tally'

/** How Tally keeps groups private, what the relay can see, and where the code is. */
export default function AboutRoute() {
  const { t, language } = useI18n()
  const copy = ABOUT[language]
  return (
    <Page title={copy.title} heading={copy.title} back={{ href: '/', label: t('app.allGroups') }}>
      <p className={styles.lead}>{copy.lead}</p>
      <Section title={copy['private.title']}>
        <p>{copy['private.body']}</p>
      </Section>
      <Section title={copy['relay.title']}>
        <p>{copy['relay.body']}</p>
      </Section>
      <Section title={copy['retention.title']}>
        <p>{copy['retention.body']}</p>
      </Section>
      <Section title={copy['tracking.title']}>
        <p>{copy['tracking.body']}</p>
      </Section>
      <Section title={copy['lost.title']}>
        <p>{copy['lost.body']}</p>
      </Section>
      <Section title={copy['code.title']}>
        <ul className={styles.links}>
          <li>
            <a href={SOURCE} target="_blank" rel="noopener noreferrer">
              {copy['code.source']}
            </a>
          </li>
          <li>
            <a href={`${SOURCE}/issues/new`} target="_blank" rel="noopener noreferrer">
              {copy['code.report']}
            </a>
          </li>
        </ul>
      </Section>
    </Page>
  )
}
