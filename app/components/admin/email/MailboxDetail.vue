<script setup lang="ts">
// Settings for one mailbox: name, avatar, aliases, shared access and deletion.
// Ported from legacy/src/app/(admin)/mailboxes/[id]/page.tsx. Mounted by /mailboxes/[id] and
// /settings/mailboxes/[id].
import type { MailboxDetail } from '~/types/admin/email/mailboxes'
import { errorMessage } from '~/utils/admin/email/domains'
import { useAdminConfirm } from '~/utils/admin/email/confirm'
import {
  createMailboxAlias, deleteMailbox, deleteMailboxAlias, fetchMailbox, fetchMailboxAliases, fetchSharedInboxAccess,
  getMailboxAddress, getMailboxesBase, grantSharedInboxAccess, revokeSharedInboxAccess, updateMailboxSettings,
} from '~/utils/admin/email/mailboxes'

const props = defineProps<{ mailboxId: string }>()
const { t } = useLanguage()
const route = useRoute()
const { confirm } = useAdminConfirm()

const { data: mailbox, error: loadError, status: loadStatus } = useAsyncData(`mailbox-${props.mailboxId}`, () => fetchMailbox(props.mailboxId), { watch: [() => props.mailboxId] })
const loading = computed(() => loadStatus.value === 'pending')
const address = computed(() => mailbox.value ? getMailboxAddress(mailbox.value) : '')

const displayName = ref('')
const useAllDomains = ref(true)
const aliasLocalPart = ref('')
const aliasDomainId = ref<string | undefined>()
const selectedUserId = ref<string | undefined>()

watch(mailbox, (value) => {
  if (!value) return
  displayName.value = value.displayName ?? ''
  useAllDomains.value = value.useAllDomains
  aliasDomainId.value ||= value.domainId
}, { immediate: true })

// Settings form
const saving = ref(false)
const saveState = ref<{ ok: boolean, text: string } | null>(null)
async function save() {
  saving.value = true
  saveState.value = null
  try {
    mailbox.value = await updateMailboxSettings(props.mailboxId, { displayName: displayName.value, useAllDomains: useAllDomains.value }) as MailboxDetail
    saveState.value = { ok: true, text: t('mailbox.saved') }
  } catch (error) {
    saveState.value = { ok: false, text: errorMessage(error, t('mailbox.updateFailed')) }
  } finally {
    saving.value = false
  }
}

// Aliases
const { data: aliases, status: aliasesStatus, error: aliasesError, refresh: refreshAliases } = useAsyncData(`mailbox-${props.mailboxId}-aliases`, () => fetchMailboxAliases(props.mailboxId), { watch: [() => props.mailboxId] })
const aliasDomainItems = computed(() => (aliases.value?.availableDomains ?? []).map(domain => ({ label: `@${domain.hostname}`, value: domain.id })))
const aliasBusy = ref<'add' | 'remove' | null>(null)
const aliasError = ref<string | null>(null)
async function addAlias() {
  if (!aliasLocalPart.value.trim() || !aliasDomainId.value) return
  aliasBusy.value = 'add'
  aliasError.value = null
  try {
    await createMailboxAlias(props.mailboxId, { domainId: aliasDomainId.value, localPart: aliasLocalPart.value.trim() })
    aliasLocalPart.value = ''
    await refreshAliases()
  } catch (error) {
    aliasError.value = errorMessage(error, t('mailbox.aliasAddFailed'))
  } finally {
    aliasBusy.value = null
  }
}
async function removeAlias(aliasId: string) {
  aliasBusy.value = 'remove'
  aliasError.value = null
  try {
    await deleteMailboxAlias(props.mailboxId, aliasId)
    await refreshAliases()
  } catch (error) {
    aliasError.value = errorMessage(error, t('mailbox.aliasRemoveFailed'))
  } finally {
    aliasBusy.value = null
  }
}

// Shared access
const canManageSharing = computed(() => mailbox.value?.canManageSharing === true)
const { data: sharedAccess, status: sharedStatus, error: sharedError, refresh: refreshShared } = useAsyncData(
  `mailbox-${props.mailboxId}-access`,
  () => canManageSharing.value ? fetchSharedInboxAccess(props.mailboxId) : Promise.resolve(null),
  { watch: [canManageSharing] },
)
const memberItems = computed(() => (sharedAccess.value?.availableUsers ?? [])
  .filter(account => !sharedAccess.value?.members.some(member => member.userId === account.id))
  .map(account => ({ label: `${account.name} (${account.email})`, value: account.id })))
const memberBusy = ref(false)
const memberError = ref<string | null>(null)
async function addMember() {
  if (!selectedUserId.value) return
  memberBusy.value = true
  memberError.value = null
  try {
    await grantSharedInboxAccess(props.mailboxId, selectedUserId.value)
    selectedUserId.value = undefined
    await refreshShared()
  } catch (error) {
    memberError.value = errorMessage(error, t('mailbox.accountAddFailed'))
  } finally {
    memberBusy.value = false
  }
}
async function removeMember(userId: string) {
  memberBusy.value = true
  try {
    await revokeSharedInboxAccess(props.mailboxId, userId)
    await refreshShared()
  } catch (error) {
    memberError.value = errorMessage(error, t('mailbox.accountAddFailed'))
  } finally {
    memberBusy.value = false
  }
}

// Danger zone
const deleting = ref(false)
const deleteError = ref<string | null>(null)
async function remove() {
  if (!(await confirm({ title: t('mailbox.delete'), description: t('mailbox.deleteConfirm', { address: address.value }), color: 'error', confirmLabel: t('mailbox.delete') }))) return
  deleting.value = true
  deleteError.value = null
  try {
    await deleteMailbox(props.mailboxId)
    await navigateTo(getMailboxesBase(route.path))
  } catch (error) {
    deleteError.value = errorMessage(error, t('mailbox.deleteFailed'))
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-3xl space-y-6">
    <div class="flex items-start justify-between gap-4">
      <p v-if="address" class="min-w-0 truncate text-sm text-muted">
        {{ address }}
      </p>
      <USkeleton v-else class="h-4 w-52" />
      <div class="flex shrink-0 items-center gap-2">
        <UBadge v-if="mailbox?.type === 'shared'" color="neutral" variant="soft" :label="t('mailboxes.shared')" />
        <UBadge v-if="mailbox?.isPrimary" color="neutral" variant="soft" :label="t('mailbox.primary')" />
      </div>
    </div>

    <UAlert v-if="loadError" color="error" variant="subtle" :title="errorMessage(loadError, t('mailbox.loadFailed'))" />

    <UCard>
      <template #header>
        <h2 class="font-semibold text-highlighted">
          {{ t('mailbox.account') }}
        </h2>
      </template>
      <form class="space-y-4" @submit.prevent="save">
        <AdminEmailMailboxAvatarForm v-if="mailbox" :mailbox-id="mailbox.id" :has-avatar="!!mailbox.hasAvatar" :name="mailbox.displayName || mailbox.localPart" />
        <USkeleton v-else class="size-24 rounded-full" />
        <UFormField :label="t('common.name')">
          <UInput v-model="displayName" :placeholder="mailbox?.localPart ?? t('mailboxes.namePlaceholder')" :disabled="loading || saving" class="w-full" />
        </UFormField>
        <div class="rounded-lg bg-elevated/60 p-4">
          <UCheckbox v-model="useAllDomains" :disabled="loading || saving" :label="t('aliases.useAll')" :description="t('mailbox.useAllHint')" />
        </div>
        <p v-if="saveState" class="text-sm" :class="saveState.ok ? 'text-success' : 'text-error'">
          {{ saveState.text }}
        </p>
        <UButton type="submit" icon="i-lucide-save" :disabled="loading || saving" :label="saving ? t('common.saving') : t('settings.mailbox.saveChanges')" />
      </form>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="font-semibold text-highlighted">
          {{ t('mailbox.aliases') }}
        </h2>
        <p class="mt-1 text-sm text-muted">
          {{ t('mailbox.aliasesDescription') }}
        </p>
      </template>
      <div class="space-y-3">
        <USkeleton v-if="aliasesStatus === 'pending' && !aliases" class="h-12 w-full rounded-lg" />
        <div v-for="alias in aliases?.aliases ?? []" :key="alias.id" class="flex items-center justify-between gap-3 rounded-lg bg-elevated/60 px-4 py-3">
          <div class="flex min-w-0 items-center gap-2">
            <UIcon name="i-lucide-at-sign" class="size-4 shrink-0 text-dimmed" />
            <p class="truncate text-sm font-medium text-highlighted">
              {{ alias.localPart }}@{{ alias.hostname }}
            </p>
          </div>
          <UButton
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            :aria-label="t('mailbox.removeAddress', { address: `${alias.localPart}@${alias.hostname}` })"
            :disabled="aliasBusy === 'remove'"
            @click="removeAlias(alias.id)"
          />
        </div>
        <p v-if="aliases && aliases.aliases.length === 0" class="rounded-lg bg-elevated/60 px-4 py-3 text-sm text-muted">
          {{ t('mailbox.noAliases') }}
        </p>
        <p v-if="aliasesError" class="text-sm text-error">
          {{ errorMessage(aliasesError, t('mailbox.aliasesLoadFailed')) }}
        </p>
        <form class="flex flex-wrap gap-2 sm:flex-nowrap" @submit.prevent="addAlias">
          <UInput v-model="aliasLocalPart" :placeholder="t('mailbox.aliasPlaceholder')" class="min-w-0 flex-1" :disabled="aliasBusy === 'add'" autocomplete="off" spellcheck="false" />
          <USelect v-model="aliasDomainId" :items="aliasDomainItems" class="min-w-0 flex-1" :disabled="aliasBusy === 'add'" />
          <UButton type="submit" icon="i-lucide-at-sign" :disabled="!aliasLocalPart.trim() || !aliasDomainId || aliasBusy === 'add'" :label="aliasBusy === 'add' ? t('account.mailboxes.adding') : t('mailbox.addAlias')" />
        </form>
        <p v-if="aliasError" class="text-sm text-error">
          {{ aliasError }}
        </p>
      </div>
    </UCard>

    <UCard v-if="canManageSharing">
      <template #header>
        <h2 class="font-semibold text-highlighted">
          {{ t('mailbox.sharedAccess') }}
        </h2>
        <p class="mt-1 text-sm text-muted">
          {{ t('mailbox.sharedAccessDescription') }}
        </p>
      </template>
      <div class="space-y-3">
        <USkeleton v-if="sharedStatus === 'pending' && !sharedAccess" class="h-16 w-full rounded-lg" />
        <div v-for="member in sharedAccess?.members ?? []" :key="member.userId" class="flex items-center justify-between gap-3 rounded-lg bg-elevated/60 px-4 py-3">
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold text-highlighted">
              {{ member.userName }}
            </p>
            <p class="truncate text-xs text-muted">
              {{ member.userEmail }}
            </p>
          </div>
          <UButton icon="i-lucide-trash-2" color="error" variant="ghost" :aria-label="t('mailbox.removeAddress', { address: member.userName })" :disabled="memberBusy" @click="removeMember(member.userId)" />
        </div>
        <p v-if="sharedAccess && sharedAccess.members.length === 0" class="rounded-lg bg-elevated/60 px-4 py-3 text-sm text-muted">
          {{ t('mailbox.noMembers') }}
        </p>
        <p v-if="sharedError" class="text-sm text-error">
          {{ errorMessage(sharedError, t('mailbox.sharedLoadFailed')) }}
        </p>
        <form class="flex gap-2" @submit.prevent="addMember">
          <USelect v-model="selectedUserId" :items="memberItems" :placeholder="t('mailbox.chooseAccount')" class="min-w-0 flex-1" />
          <UButton type="submit" icon="i-lucide-user-plus" :disabled="!selectedUserId || memberBusy" :label="memberBusy ? t('account.mailboxes.adding') : t('mailbox.addUser')" />
        </form>
        <p v-if="memberError" class="text-sm text-error">
          {{ memberError }}
        </p>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="font-semibold text-error">
          {{ t('mailbox.dangerZone') }}
        </h2>
        <p class="mt-1 text-sm text-muted">
          {{ t('mailbox.dangerDescription', { address: address || t('mailbox.thisAddress') }) }}
        </p>
      </template>
      <UAlert v-if="deleteError" class="mb-4" color="error" variant="subtle" :title="deleteError" />
      <UButton color="error" icon="i-lucide-trash-2" :disabled="!mailbox || deleting" :label="deleting ? t('mailbox.deleting') : t('mailbox.delete')" @click="remove" />
    </UCard>
  </div>
</template>
