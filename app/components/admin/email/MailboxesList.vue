<script setup lang="ts">
// The mailbox list with its "New mailbox" dialog. Ported from legacy/src/app/(admin)/mailboxes/page.tsx.
// Mounted by /mailboxes (admin) and /settings/mailboxes; links follow the current base path.
import type { MailboxDomain, MailboxOwner, MailboxesResponse, MailboxStatus } from '~/types/admin/email/mailboxes'
import { errorMessage } from '~/utils/admin/email/domains'
import { formatAccountDateTime, getMailboxAddress, getMailboxesBase, getMailboxName, notifyMailboxesChanged } from '~/utils/admin/email/mailboxes'

const { t } = useLanguage()
const route = useRoute()
const base = computed(() => getMailboxesBase(route.path))
const user = useCurrentUser()

const { data: domains } = useAsyncData('mailbox-domains', () => api<{ domains: MailboxDomain[] }>('/api/domains'))
const { data: mailboxes, status, refresh } = useAsyncData('admin-mailboxes', () => api<MailboxesResponse>('/api/mailboxes'))

const createOpen = ref(false)
const displayName = ref('')
const localPart = ref('')
const domainId = ref<string | undefined>()
const ownerUserId = ref<string | undefined>()
const mailboxType = ref<'personal' | 'shared'>('personal')
const accounts = ref<MailboxOwner[]>([])
const pending = ref(false)
const createError = ref<string | null>(null)

watch(createOpen, async (open) => {
  if (!open) return
  displayName.value ||= user.value?.name?.trim() || ''
  ownerUserId.value ||= user.value?.id
  accounts.value = await api<{ accounts: MailboxOwner[] }>('/api/accounts').then(r => r.accounts ?? []).catch(() => [])
})

const mailboxOwners = computed(() => {
  const owners = [...accounts.value]
  const me = user.value
  if (me?.id && !owners.some(owner => owner.id === me.id)) {
    owners.unshift({ id: me.id, email: me.email ?? '', name: me.name ?? me.email ?? t('mailboxes.currentAccount'), role: 'admin' })
  }
  return owners
})
const ownerItems = computed(() => mailboxOwners.value.map(owner => ({ label: `${owner.name} (${owner.email})`, value: owner.id })))
const domainItems = computed(() => (domains.value?.domains ?? []).map(domain => ({ label: domain.hostname, value: domain.id })))
const typeItems = computed(() => [
  { label: t('mailboxes.personalInbox'), value: 'personal' },
  { label: t('mailboxes.sharedInbox'), value: 'shared' },
])
const domainMap = computed(() => new Map((domains.value?.domains ?? []).map(d => [d.id, d.hostname])))

function pickOwner(id: string | undefined) {
  ownerUserId.value = id
  const owner = mailboxOwners.value.find(item => item.id === id)
  if (owner) displayName.value = owner.name
}

const canCreate = computed(() => (mailboxType.value === 'shared' || !!ownerUserId.value) && !!displayName.value.trim() && !!domainId.value && !!localPart.value && !pending.value)

async function create() {
  pending.value = true
  createError.value = null
  const type = mailboxType.value
  try {
    const json = await api<{ id?: string }>('/api/mailboxes', {
      method: 'POST',
      body: { domainId: domainId.value, ...(type === 'personal' ? { ownerUserId: ownerUserId.value } : {}), localPart: localPart.value, displayName: displayName.value.trim(), type },
    })
    displayName.value = ''
    localPart.value = ''
    domainId.value = undefined
    ownerUserId.value = undefined
    mailboxType.value = 'personal'
    notifyMailboxesChanged()
    createOpen.value = false
    await refresh()
    if (type === 'shared' && json.id) await navigateTo(`${base.value}/${json.id}`)
  } catch (error) {
    createError.value = errorMessage(error, t('mailboxes.failed'))
  } finally {
    pending.value = false
  }
}

const STATUS_COLORS: Record<MailboxStatus, 'success' | 'neutral' | 'error'> = { active: 'success', disabled: 'neutral', pendingDeletion: 'error' }
const rows = computed(() => (mailboxes.value?.mailboxes ?? []).map(mailbox => ({ ...mailbox, hostname: mailbox.hostname ?? domainMap.value.get(mailbox.domainId) ?? '?' })))
const columns = 'grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 md:grid-cols-[auto_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]'
</script>

<template>
  <div class="mx-auto w-full max-w-3xl space-y-4">
    <div class="flex justify-end">
      <UModal v-model:open="createOpen" :title="t('mailboxes.createTitle')" :description="t('mailboxes.createDescription')">
        <UButton icon="i-lucide-plus" :label="t('mailboxes.new')" />
        <template #body>
          <form class="space-y-4" @submit.prevent="canCreate && create()">
            <UFormField v-if="mailboxes?.canCreateShared" :label="t('mailboxes.type')">
              <USelect v-model="mailboxType" :items="typeItems" class="w-full" />
            </UFormField>
            <UFormField v-if="mailboxType === 'personal'" :label="t('mailboxes.account')">
              <USelect :model-value="ownerUserId" :items="ownerItems" class="w-full" @update:model-value="pickOwner" />
            </UFormField>
            <UAlert v-else color="info" variant="subtle" :description="t('mailboxes.sharedHint')" />
            <UFormField :label="t('common.name')">
              <UInput v-model="displayName" :placeholder="t('mailboxes.namePlaceholder')" class="w-full" />
            </UFormField>
            <UFormField :label="t('mailboxes.emailAddress')">
              <UFieldGroup class="w-full">
                <UInput v-model="localPart" :placeholder="t('mailboxes.localPlaceholder')" class="min-w-0 flex-1" autocomplete="off" spellcheck="false">
                  <template #trailing>
                    <span class="text-sm text-muted">@</span>
                  </template>
                </UInput>
                <USelect v-model="domainId" :items="domainItems" :placeholder="t('accounts.selectDomain')" :aria-label="t('accounts.domain')" class="max-w-[55%]" />
              </UFieldGroup>
            </UFormField>
            <p v-if="createError" role="alert" class="text-sm text-error">
              {{ createError }}
            </p>
            <UButton type="submit" :disabled="!canCreate" :loading="pending" :label="pending ? t('accounts.creating') : t('mailboxes.createButton')" />
          </form>
        </template>
      </UModal>
    </div>

    <div v-if="status === 'pending' && !mailboxes" class="space-y-2">
      <USkeleton v-for="n in 3" :key="n" class="h-16 w-full rounded-lg" />
    </div>
    <UCard v-else-if="!rows.length" :ui="{ body: 'text-sm text-muted' }">
      {{ t('mailboxes.none') }}
    </UCard>
    <div v-else class="overflow-hidden rounded-lg border border-default bg-default">
      <div :class="columns" class="border-b border-default px-5 py-3 text-xs font-medium uppercase text-muted">
        <span class="w-10" />
        <span>{{ t('common.name') }}</span>
        <span class="hidden md:block">{{ t('mailboxes.type') }}</span>
        <span class="hidden md:block">{{ t('accounts.colStatus') }}</span>
        <span class="hidden md:block">{{ t('accounts.colLastSignIn') }}</span>
      </div>
      <NuxtLink v-for="mailbox in rows" :key="mailbox.id" :to="`${base}/${mailbox.id}`" :class="columns" class="border-b border-default px-5 py-4 transition-colors last:border-b-0 hover:bg-elevated/50">
        <UAvatar :src="mailbox.hasAvatar ? `/api/mailboxes/${mailbox.id}/avatar` : undefined" :alt="getMailboxName(mailbox)" size="lg" />
        <span class="min-w-0">
          <span class="block truncate text-sm font-semibold text-highlighted">{{ getMailboxName(mailbox) }}</span>
          <span class="block truncate text-sm text-muted">{{ getMailboxAddress(mailbox) }}</span>
        </span>
        <span class="hidden md:block">
          <UBadge :color="mailbox.type === 'shared' ? 'primary' : 'neutral'" variant="soft" :label="mailbox.type === 'shared' ? t('mailboxes.sharedInbox') : t('mailboxes.personalInbox')" />
        </span>
        <span class="hidden md:block">
          <UBadge :color="STATUS_COLORS[mailbox.status ?? 'active']" variant="soft" :label="t(`accounts.status.${mailbox.status ?? 'active'}`, { date: '' })" />
        </span>
        <span class="hidden text-sm text-muted md:block">
          {{ mailbox.type === 'shared' ? '—' : mailbox.lastSignInAt ? formatAccountDateTime(mailbox.lastSignInAt) : t('accounts.neverSignedIn') }}
        </span>
      </NuxtLink>
    </div>
  </div>
</template>
