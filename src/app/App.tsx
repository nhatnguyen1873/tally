import { Suspense, useEffect } from 'react'

import type { Catalog } from '../i18n/en.ts'
import { I18nProvider } from '../i18n/I18nProvider.tsx'
import type { Language } from '../i18n/language.ts'
import { ToastProvider } from '../ui/Toast.tsx'
import { applyTheme, usePrefs } from './prefs.ts'
import { Routes } from './Routes.tsx'
import { InAppBrowserHint } from './InAppBrowserHint.tsx'
import { Shell } from './Shell.tsx'
import { UpdatePrompt } from './UpdatePrompt.tsx'

function Theme() {
  const { theme } = usePrefs()
  useEffect(() => {
    applyTheme(theme)
  }, [theme])
  return null
}

export function App({ initial }: { initial: { language: Language; catalog: Catalog } }) {
  return (
    <I18nProvider initial={initial}>
      <Theme />
      <ToastProvider
        lasting={
          <>
            <InAppBrowserHint />
            <UpdatePrompt />
          </>
        }
      >
        <Suspense fallback={<Shell />}>
          <Routes />
        </Suspense>
      </ToastProvider>
    </I18nProvider>
  )
}
