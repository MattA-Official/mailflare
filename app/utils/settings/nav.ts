// Settings sidebar sections, ported from legacy/src/components/settings/settings-nav-utils.ts.
// Owned by the account-settings workstream; the dashboard layout renders it for nav: 'settings'.
import type { TranslationKey } from '#lib/i18n/types'

export type SettingsNavItem = {
  href: string
  labelKey: TranslationKey
  /** Shown only to users who can manage mailboxes. */
  requiresMailboxAccess?: boolean
}

export type SettingsNavSection = {
  labelKey: TranslationKey
  items: SettingsNavItem[]
}

export const settingsNavSections: SettingsNavSection[] = [
  {
    labelKey: 'settings.nav.settings',
    items: [
      { href: '/settings/account', labelKey: 'settings.nav.account' },
      { href: '/settings/inbox', labelKey: 'settings.nav.inbox' },
      { href: '/settings/security', labelKey: 'settings.nav.security' },
      { href: '/settings/api-keys', labelKey: 'settings.nav.apiKeys' },
      { href: '/settings/app-passwords', labelKey: 'settings.nav.appPasswords' },
      { href: '/settings/rules', labelKey: 'settings.nav.rules' },
    ],
  },
  {
    labelKey: 'settings.nav.mailbox',
    items: [
      { href: '/settings/mailboxes', labelKey: 'admin.nav.mailboxes', requiresMailboxAccess: true },
      { href: '/settings/import', labelKey: 'settings.nav.import' },
      { href: '/settings/export', labelKey: 'settings.nav.export' },
    ],
  },
]

export function isActiveSettingsPath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function visibleSettingsNavSections(canManageMailboxes: boolean): SettingsNavSection[] {
  return settingsNavSections.map(section => ({
    ...section,
    items: section.items.filter(item => !item.requiresMailboxAccess || canManageMailboxes),
  }))
}
