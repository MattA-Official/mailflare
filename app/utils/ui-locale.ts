// Nuxt UI's own strings (close buttons, calendar months, table and pagination labels) for the app
// language. Each catalogue is its own lazy chunk, so US English loads nothing extra. Languages Nuxt UI
// does not ship fall back to its English defaults.
import type { Locale as UiLocale, Messages } from '@nuxt/ui'
import type { Locale } from '#lib/i18n/locales'

const catalogues = import.meta.glob<{ default: UiLocale<Messages> }>('../../node_modules/@nuxt/ui/dist/runtime/locale/*.js')

// Our codes are BCP 47 ("pt-BR"); Nuxt UI's files are named "pt_br", and Portuguese (Portugal) is plain "pt".
const FILE_NAMES: Partial<Record<Locale, string>> = { 'pt-PT': 'pt', 'fa': 'fa_ir' }

// English is one catalogue for us, but dates should read day-first everywhere except the US, so
// English readers outside the US get Nuxt UI's British catalogue (en-GB dates, 24-hour clock).
function englishVariant(): string | undefined {
  const browser = typeof navigator === 'undefined' ? 'en-US' : navigator.language
  return browser.startsWith('en-') && browser !== 'en-US' ? 'en_gb' : undefined
}

export async function loadUiLocale(code: Locale): Promise<UiLocale<Messages> | undefined> {
  const name = code === 'en' ? englishVariant() : FILE_NAMES[code] ?? code.toLowerCase().replace('-', '_')
  if (!name) return undefined
  const load = catalogues[`../../node_modules/@nuxt/ui/dist/runtime/locale/${name}.js`]
  return load ? (await load()).default : undefined
}
