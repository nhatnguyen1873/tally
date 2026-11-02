import { useI18n } from '../i18n/I18nProvider.tsx'
import { ButtonLink } from '../ui/Button.tsx'
import { Page } from '../ui/Page.tsx'

export default function NotFoundRoute() {
  const { t } = useI18n()
  return (
    <Page
      title={t('app.notFound.title')}
      heading={t('app.notFound.title')}
      back={{ href: '/', label: t('app.allGroups') }}
    >
      <p>{t('app.notFound.body')}</p>
      <ButtonLink href="/" variant="primary">
        {t('app.goHome')}
      </ButtonLink>
    </Page>
  )
}
