// Translations use upstream's catalogues and translator unchanged (flat dotted keys, `{var}`
// interpolation, `.one`/`.other` plural variants), which the server shares for emails and push.
import { locales } from '#lib/i18n/locales'
import { DEFAULT_LOCALE, LOCALE_COOKIE, createTranslator, getDirection, loadMessages, resolveLocale, serializeLocaleCookie, type Translator } from '#lib/i18n/utils'
import type { Locale, Messages } from '#lib/i18n/types'

const locale = ref<Locale>(DEFAULT_LOCALE)
const messages = shallowRef<Partial<Messages> | undefined>()
const translator = computed<Translator>(() => createTranslator(locale.value, messages.value))

function readLocaleCookie(): Locale {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]+)`))
  return resolveLocale(match ? decodeURIComponent(match[1]!) : navigator.language)
}

async function applyLocale(next: Locale) {
  try {
    messages.value = next === DEFAULT_LOCALE ? undefined : await loadMessages(next)
    locale.value = next
  } catch {
    messages.value = undefined
    locale.value = DEFAULT_LOCALE
  }
  document.documentElement.lang = locale.value
  document.documentElement.dir = getDirection(locale.value)
}

/** Called once from the app plugin before the first render. */
export function initLanguage() {
  return applyLocale(readLocaleCookie())
}

export function useLanguage() {
  return {
    locale: readonly(locale),
    locales,
    dir: computed(() => getDirection(locale.value)),
    /** `t('inbox.unread', { count })` */
    t: ((key, vars) => translator.value(key, vars)) as Translator,
    async setLocale(next: Locale) {
      document.cookie = serializeLocaleCookie(next, location.protocol === 'https:')
      await applyLocale(next)
    },
  }
}
