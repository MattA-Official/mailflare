<script setup lang="ts">
// Ported from legacy/src/app/(admin)/accounts/[id]/mailboxes/page.tsx.
import type { ManagedDomain, ManagedMailbox } from '~/types/admin/system/accounts'
import { addManagedMailbox, fetchManagedDomains, fetchManagedMailboxes, removeManagedMailbox } from '~/utils/admin/system/accounts'
import { useManagedAccount } from '~/utils/admin/system/use-managed-account'

const { t } = useLanguage()
const route = useRoute()
const id = computed(() => String(route.params.id))
const { data: account } = useManagedAccount(id)

const mailboxes = ref<ManagedMailbox[]>([])
const domains = ref<ManagedDomain[]>([])
const localPart = ref('')
const domainId = ref('')
const saving = ref(false)
const message = ref<string | null>(null)

const domainItems = computed(() => domains.value.map(domain => ({ label: domain.hostname, value: domain.id })))
const hostname = computed(() => domains.value.find(domain => domain.id === domainId.value)?.hostname)

async function load() {
  const [nextMailboxes, nextDomains] = await Promise.all([fetchManagedMailboxes(id.value), fetchManagedDomains()])
  mailboxes.value = nextMailboxes
  domains.value = nextDomains
  domainId.value ||= nextDomains[0]?.id ?? ''
}

onMounted(() => load().catch((error) => {
  message.value = error instanceof Error ? error.message : t('account.mailboxes.loadFailed')
}))

async function add() {
  if (!account.value) return
  saving.value = true
  message.value = null
  try {
    await addManagedMailbox(account.value, { domainId: domainId.value, localPart: localPart.value })
    localPart.value = ''
    await load()
  } catch (error) {
    message.value = error instanceof Error ? error.message : t('account.mailboxes.addFailed')
  } finally {
    saving.value = false
  }
}

async function remove(mailboxId: string) {
  message.value = null
  try {
    await removeManagedMailbox(mailboxId)
    await load()
  } catch (error) {
    message.value = error instanceof Error ? error.message : t('account.mailboxes.removeFailed')
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-xl font-medium text-highlighted">
        {{ t('account.mailboxes.title') }}
      </h2>
      <p class="mt-1 text-sm text-muted">
        {{ t('account.mailboxes.manage', { name: account?.name ?? t('account.password.thisAccount') }) }}
      </p>
    </div>
    <UCard>
      <div class="space-y-4">
        <h3 class="text-base font-semibold text-highlighted">
          {{ t('account.mailboxes.current') }}
        </h3>
        <div class="space-y-2">
          <div v-for="mailbox in mailboxes" :key="mailbox.id" class="flex items-center justify-between gap-2 rounded-lg bg-elevated/50 px-4 py-3">
            <span class="min-w-0">
              <span class="block truncate font-medium">{{ mailbox.displayName || mailbox.localPart }}</span>
              <span class="block truncate text-sm text-muted">{{ mailbox.localPart }}@{{ mailbox.hostname }}</span>
            </span>
            <span class="flex shrink-0 items-center gap-1">
              <UButton color="neutral" variant="ghost" size="sm" :to="`/mailboxes/${mailbox.id}`" :label="t('mailbox.title')" :aria-label="`${t('mailbox.title')}: ${mailbox.localPart}@${mailbox.hostname}`" />
              <UButton color="error" variant="ghost" size="sm" icon="i-lucide-trash-2" :aria-label="t('account.mailboxes.removeInbox')" @click="remove(mailbox.id)" />
            </span>
          </div>
          <p v-if="account && mailboxes.length === 0" class="text-sm text-muted">
            {{ t('account.mailboxes.none') }}
          </p>
        </div>
        <div class="border-t border-default pt-6">
          <h3 class="text-base font-semibold text-highlighted">
            {{ t('account.mailboxes.addTitle') }}
          </h3>
          <p class="mt-1 text-sm text-muted">
            {{ t('account.mailboxes.addDescription') }}
          </p>
          <form class="mt-4 space-y-4" @submit.prevent="add">
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField :label="t('account.mailboxes.inboxName')" required>
                <UInput v-model="localPart" :placeholder="t('account.mailboxes.inboxPlaceholder')" :disabled="!account || saving" :maxlength="64" required class="w-full" />
              </UFormField>
              <UFormField :label="t('account.mailboxes.domain')" required>
                <USelect v-model="domainId" :items="domainItems" :placeholder="t('account.mailboxes.noDomains')" :disabled="!account || domains.length === 0 || saving" class="w-full" />
              </UFormField>
            </div>
            <p v-if="domainId" class="break-all text-sm text-muted">
              {{ t('account.mailboxes.address') }} <span class="font-medium text-highlighted">{{ localPart || t('account.mailboxes.inboxPlaceholder') }}@{{ hostname }}</span>
            </p>
            <UButton type="submit" icon="i-lucide-plus" :loading="saving" :disabled="!account || !domainId || !localPart.trim()" :label="saving ? t('account.mailboxes.adding') : t('account.mailboxes.add')" />
          </form>
        </div>
      </div>
    </UCard>
    <p v-if="message" role="status" class="text-sm text-muted">
      {{ message }}
    </p>
  </div>
</template>
