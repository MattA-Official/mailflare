<script setup lang="ts">
// The account menu in the sidebar footer: the selected mailbox, the other mailboxes with unread
// counts, other accounts signed in on this browser (each with its own sign-out), add account,
// settings, admin and sign out. The apps live in AppAppsMenu. Ported from
// legacy/src/components/mailbox-selector.tsx.
import { useEventListener } from '@vueuse/core'
import { getProfileAvatarUrl, PROFILE_AVATAR_CHANGED_EVENT } from '#lib/profile/avatar-client'
import { MAILBOX_AVATAR_CHANGED_EVENT } from '#lib/mailboxes/avatar-client'
import type { MailboxAvatarChangedDetail } from '#lib/mailboxes/avatar-client-types'
import type { ProfileAvatarChangedDetail } from '#lib/profile/types'
import { fetchBrowserAccounts, logoutClientSession, signOutBrowserAccount, switchBrowserAccount, type BrowserAccount } from '~/utils/auth/accounts'
import { alertDialog, confirmDialog } from '~/utils/confirm-dialog'

defineProps<{ collapsed?: boolean }>()

const { t } = useLanguage()
const route = useRoute()
const user = useCurrentUser()
const { selectedMailbox, mailboxes, isLoading, setSelectedMailbox } = useSelectedMailbox()
const open = ref(false)
const inboxesOpen = ref(false)
const browserAccounts = ref<BrowserAccount[]>([])
const profileAvatarUrl = ref('/api/profile/avatar')
const profileAvatarFailed = ref(false)
const mailboxAvatarUrls = ref<Record<string, string>>({})
const { counts } = useMessageCounts(null, open)

watch(open, async (value) => {
  if (value) browserAccounts.value = await fetchBrowserAccounts()
})

const otherAccounts = computed(() => browserAccounts.value.filter(account => !account.active && account.userId !== user.value?.id))
const otherMailboxes = computed(() => mailboxes.value.filter(mailbox => mailbox.id !== selectedMailbox.value?.id))
const selectedName = computed(() => (selectedMailbox.value ? getMailboxName(selectedMailbox.value) : user.value?.name ?? t('account.fallbackName')))
const selectedEmail = computed(() => (selectedMailbox.value ? getMailboxAddress(selectedMailbox.value) : user.value?.email ?? ''))
const selectedAvatarUrl = computed(() => {
  const mailbox = selectedMailbox.value
  if (!mailbox) return profileAvatarUrl.value
  return mailboxAvatarUrls.value[mailbox.id] ?? `/api/mailboxes/${mailbox.id}/avatar`
})
const selectedHasAvatar = computed(() => {
  const mailbox = selectedMailbox.value
  if (!mailbox) return !!user.value?.hasAvatar && !profileAvatarFailed.value
  return !!mailbox.hasAvatar || !!mailboxAvatarUrls.value[mailbox.id]
})
const identityPending = computed(() => isLoading.value && !selectedMailbox.value)
const adminActive = computed(() => route.meta.nav === 'admin')

function onTriggerAvatarError() {
  if (!selectedMailbox.value) profileAvatarFailed.value = true
}

function unreadFor(mailboxId: string) {
  return counts.value.mailboxes.find(count => count.mailboxId === mailboxId)?.unread ?? 0
}

function selectMailbox(mailbox: MailboxOption) {
  setSelectedMailbox(mailbox)
  open.value = false
  void navigateTo('/inbox')
}

async function logout() {
  const switched = await logoutClientSession()
  open.value = false
  window.location.assign(switched ? '/inbox' : '/login')
}

async function signOutAccount(account: BrowserAccount) {
  if (!(await confirmDialog(t('account.signOutAccountConfirm', { name: account.name, email: account.email })))) return
  const error = await signOutBrowserAccount(account.userId)
  if (error) {
    void alertDialog(error)
    return
  }
  browserAccounts.value = browserAccounts.value.filter(item => item.userId !== account.userId)
}

async function switchAccount(userId: string) {
  const error = await switchBrowserAccount(userId)
  open.value = false
  if (error) {
    await navigateTo('/login?add=1')
    return
  }
  window.location.assign('/inbox')
}

if (import.meta.client) {
  useEventListener(window, PROFILE_AVATAR_CHANGED_EVENT, (event: Event) => {
    clearCurrentUserCache()
    void fetchSessionInfo({ fresh: true })
    const detail = (event as CustomEvent<ProfileAvatarChangedDetail>).detail
    profileAvatarUrl.value = detail?.url ?? getProfileAvatarUrl()
    profileAvatarFailed.value = false
    const version = Date.now()
    const next = { ...mailboxAvatarUrls.value }
    for (const mailbox of mailboxes.value) {
      if (isIdentityMailbox(mailbox)) next[mailbox.id] = `/api/mailboxes/${mailbox.id}/avatar?v=${version}`
    }
    mailboxAvatarUrls.value = next
  })
  useEventListener(window, MAILBOX_AVATAR_CHANGED_EVENT, (event: Event) => {
    const detail = (event as CustomEvent<MailboxAvatarChangedDetail>).detail
    if (detail?.mailboxId && detail.url) mailboxAvatarUrls.value = { ...mailboxAvatarUrls.value, [detail.mailboxId]: detail.url }
  })
}

const linkClass = 'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-default hover:bg-elevated'
</script>

<template>
  <UPopover v-model:open="open" :content="{ side: 'top', align: 'start' }" :ui="{ content: 'w-[min(360px,calc(100vw-2rem))] max-h-[82vh] overflow-y-auto p-2' }">
    <UButton
      color="neutral"
      variant="ghost"
      block
      :square="collapsed"
      class="justify-start"
      :aria-label="t('account.openMenu')"
      :trailing-icon="collapsed ? undefined : 'i-lucide-chevrons-up-down'"
    >
      <USkeleton v-if="identityPending && !user" class="size-8 rounded-full" />
      <AppAccountAvatar
        v-else
        :name="selectedName"
        :color-seed="selectedEmail || selectedName"
        :has-avatar="selectedHasAvatar"
        :avatar-url="selectedAvatarUrl"
        :placeholder="identityPending"
        size="md"
        @error="onTriggerAvatarError"
      />
      <span v-if="!collapsed" class="min-w-0 flex-1 text-left">
        <span class="block truncate text-sm font-medium text-highlighted">{{ selectedName }}</span>
        <span class="block truncate text-xs text-muted">{{ selectedEmail }}</span>
      </span>
    </UButton>

    <template #content>
      <div class="rounded-lg bg-elevated/50 p-2">
        <NuxtLink to="/inbox" class="flex items-center gap-3 rounded-md p-2 hover:bg-primary/10" @click="open = false">
          <AppAccountAvatar
            :name="selectedName"
            :color-seed="selectedEmail || selectedName"
            :has-avatar="selectedHasAvatar"
            :avatar-url="selectedAvatarUrl"
            :placeholder="identityPending"
            size="3xl"
          />
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5">
              <p class="truncate text-base font-semibold text-highlighted">{{ selectedName }}</p>
              <UTooltip v-if="selectedMailbox?.type === 'shared'" :text="t('account.sharedInbox')">
                <UIcon name="i-lucide-users-round" class="size-4 shrink-0 text-primary" :aria-label="t('account.sharedInbox')" />
              </UTooltip>
            </div>
            <p class="truncate text-sm text-muted">{{ selectedEmail }}</p>
          </div>
          <UIcon name="i-lucide-check" class="size-5 shrink-0 text-primary" />
        </NuxtLink>
        <div v-if="otherMailboxes.length > 0" class="mt-2 border-t border-default pt-2">
          <button type="button" :aria-expanded="inboxesOpen" class="flex w-full items-center justify-between rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted hover:bg-elevated" @click="inboxesOpen = !inboxesOpen">
            {{ t('account.inboxes', { count: otherMailboxes.length }) }}
            <UIcon name="i-lucide-chevron-down" class="size-4 transition-transform" :class="inboxesOpen && 'rotate-180'" />
          </button>
          <template v-if="inboxesOpen">
            <button v-for="mailbox in otherMailboxes" :key="mailbox.id" type="button" class="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left hover:bg-elevated" @click="selectMailbox(mailbox)">
              <AppAccountAvatar
                :name="getMailboxName(mailbox)"
                :color-seed="getMailboxAddress(mailbox)"
                :has-avatar="!!mailbox.hasAvatar || !!mailboxAvatarUrls[mailbox.id]"
                :avatar-url="mailboxAvatarUrls[mailbox.id] ?? `/api/mailboxes/${mailbox.id}/avatar`"
              />
              <span class="min-w-0 flex-1">
                <span class="flex items-center gap-1.5">
                  <span class="truncate text-sm font-semibold text-highlighted">{{ getMailboxName(mailbox) }}</span>
                  <UIcon v-if="mailbox.type === 'shared'" name="i-lucide-users-round" class="size-3.5 shrink-0 text-primary" :aria-label="t('account.sharedInbox')" />
                </span>
                <span class="block truncate text-xs text-muted">{{ getMailboxAddress(mailbox) }}</span>
              </span>
              <UBadge v-if="unreadFor(mailbox.id) > 0" :label="unreadFor(mailbox.id) > 99 ? '99+' : String(unreadFor(mailbox.id))" variant="soft" size="sm" />
            </button>
          </template>
        </div>
      </div>

      <div class="mt-2 border-t border-default pt-2">
        <p v-if="otherAccounts.length > 0" class="px-3 pt-1 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">{{ t('account.otherAccounts') }}</p>
        <div v-for="account in otherAccounts" :key="account.userId" class="group flex items-center rounded-md hover:bg-primary/10 focus-within:bg-primary/10">
          <button type="button" class="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left" @click="switchAccount(account.userId)">
            <AppAccountAvatar :name="account.name" :color-seed="account.email" :has-avatar="account.hasAvatar" :avatar-url="`/api/auth/accounts/${account.userId}/avatar`" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-semibold text-highlighted">{{ account.name }}</span>
              <span class="block truncate text-xs text-muted">{{ account.email }}</span>
            </span>
          </button>
          <UTooltip :text="t('account.signOut')">
            <UButton
              icon="i-lucide-log-out"
              color="neutral"
              variant="ghost"
              size="sm"
              class="me-2 rounded-full opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              :aria-label="t('account.signOut')"
              @click="signOutAccount(account)"
            />
          </UTooltip>
        </div>
        <NuxtLink to="/login?add=1" :class="linkClass" @click="open = false"><UIcon name="i-lucide-user-plus" class="size-4.5 text-muted" />{{ t('account.addAnother') }}</NuxtLink>
      </div>

      <div class="mt-2 flex flex-col border-t border-default pt-2">
        <NuxtLink to="/settings/account" :class="linkClass" @click="open = false"><UIcon name="i-lucide-settings" class="size-4.5 text-muted" />{{ t('account.settings') }}</NuxtLink>
        <NuxtLink v-if="user?.role === 'admin'" to="/admin" :class="[linkClass, adminActive && 'bg-primary/10']" @click="open = false">
          <UIcon name="i-lucide-shield-check" class="size-4.5 text-muted" />{{ t('account.admin') }}
          <UIcon v-if="adminActive" name="i-lucide-check" class="ms-auto size-4 text-primary" />
        </NuxtLink>
        <button type="button" :class="[linkClass, 'w-full text-left']" @click="logout"><UIcon name="i-lucide-log-out" class="size-4.5 text-muted" />{{ t('account.signOut') }}</button>
      </div>
    </template>
  </UPopover>
</template>
