// Nuxt UI's own strings (close buttons, calendar months, table and pagination labels) for the app
// language. Each catalogue is its own lazy chunk, so English loads nothing extra. Languages Nuxt UI
// does not ship fall back to its English defaults.
import type { Locale as UiLocale, Messages } from '@nuxt/ui'
import type { Locale } from '#lib/i18n/locales'

const catalogues = import.meta.glob<{ default: UiLocale<Messages> }>('../../node_modules/@nuxt/ui/dist/runtime/locale/*.js')

// Our codes are BCP 47 ("pt-BR"); Nuxt UI's files are named "pt_br", and Portuguese (Portugal) is plain "pt".
const FILE_NAMES: Partial<Record<Locale, string>> = { 'pt-PT': 'pt', 'fa': 'fa_ir' }

export async function loadUiLocale(code: Locale): Promise<UiLocale<Messages> | undefined> {
  if (code === 'en') return undefined
  const name = FILE_NAMES[code] ?? code.toLowerCase().replace('-', '_')
  const load = catalogues[`../../node_modules/@nuxt/ui/dist/runtime/locale/${name}.js`]
  return load ? (await load()).default : undefined
}
