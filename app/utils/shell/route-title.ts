// Titles for pages that do not set their own, matched on the longest path prefix (upstream
// route-title-utils). The licences page is not ported, so it has no entry.
import type { TranslationKey } from '#lib/i18n/types'
import { settingsNavSections } from '~/utils/settings/nav'

const routeTitles: Array<[string, TranslationKey]> = [
  ['/settings', 'settings.nav.settings'],
  ['/admin', 'admin.title'],
  ['/mailboxes', 'admin.nav.mailboxes'],
  ['/domains', 'admin.nav.domains'],
  ['/routing', 'admin.nav.routing'],
  ['/webhooks', 'admin.nav.webhooks'],
  ['/spam-filter', 'admin.nav.spamFilter'],
  ['/api-keys', 'admin.nav.apiKeys'],
  ['/general', 'admin.nav.general'],
  ['/agent', 'admin.nav.agent'],
  ['/accounts', 'admin.nav.accounts'],
  ['/activity', 'admin.nav.activity'],
  ['/backups', 'admin.nav.backups'],
  ['/branding', 'admin.nav.branding'],
  ['/ai-usage', 'aiUsage.title'],
  ['/calendar', 'account.calendar'],
  ['/booking', 'booking.title'],
  ['/drive', 'drive.title'],
  ['/compose', 'compose.pageTitle'],
  ...settingsNavSections.flatMap(section => section.items.map((item): [string, TranslationKey] => [item.href, item.labelKey])),
]

export function getRouteTitleKey(pathname: string): TranslationKey | null {
  let best: [string, TranslationKey] | null = null
  for (const entry of routeTitles) {
    const [path] = entry
    if (pathname !== path && !pathname.startsWith(`${path}/`)) continue
    if (!best || path.length > best[0].length) best = entry
  }
  return best ? best[1] : null
}
