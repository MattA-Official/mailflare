<script setup lang="ts">
// Ported from legacy/src/app/(admin)/accounts/[id]/permissions/page.tsx.
import type { TransferCandidate } from '~/types/admin/system/accounts'
import { fetchTransferCandidates, saveManagedAccount, transferPrimaryAdmin } from '~/utils/admin/system/accounts'
import { useManagedAccountDraft } from '~/utils/admin/system/use-managed-account'

const { t } = useLanguage()
const route = useRoute()
const id = computed(() => String(route.params.id))
const currentUser = useCurrentUser()
const { draft: account, data, error: loadError } = useManagedAccountDraft(id)

const saving = ref(false)
const message = ref<string | null>(null)
const candidates = ref<TransferCandidate[]>([])
const transferTargetId = ref<string>()
const transferOpen = ref(false)
const transferring = ref(false)

const isPrimary = computed(() => !!account.value?.canChangeRole)
const editable = computed(() => !!account.value?.editable)
const transferTarget = computed(() => candidates.value.find(candidate => candidate.id === transferTargetId.value) ?? null)
const roleItems = computed(() => [{ label: t('accounts.roleUser'), value: 'user' }, { label: t('accounts.roleAdmin'), value: 'admin' }])
const candidateItems = computed(() => candidates.value.map(candidate => ({ label: `${candidate.email} — ${candidate.name}`, value: candidate.id })))

watch(loadError, (error) => {
  if (error) message.value = error.message || t('account.permissions.loadFailed')
})

watch(isPrimary, async (value) => {
  if (!value) return
  try {
    const list = await fetchTransferCandidates()
    candidates.value = list.filter(candidate => candidate.id !== currentUser.value?.id && !candidate.disabled)
  } catch {
    // The transfer list is optional; the rest of the page still works.
  }
}, { immediate: true })

async function savePermissions() {
  if (!account.value) return
  saving.value = true
  message.value = null
  try {
    await saveManagedAccount(account.value)
    data.value = { ...account.value }
    // Editing your own flags changes what your navigation shows; drop the cached user.
    if (currentUser.value?.id === account.value.id) {
      clearCurrentUserCache()
      void fetchSessionInfo({ fresh: true })
    }
    message.value = t('account.permissions.updated')
  } catch (error) {
    message.value = error instanceof Error ? error.message : t('account.permissions.updateFailed')
  } finally {
    saving.value = false
  }
}

async function confirmTransfer() {
  if (!transferTarget.value) return
  transferring.value = true
  message.value = null
  try {
    await transferPrimaryAdmin(transferTarget.value.id)
    clearCurrentUserCache()
    transferOpen.value = false
    // A full reload drops the stale cached session so the navigation reflects the new role.
    window.location.assign(`/accounts/${transferTarget.value.id}/permissions`)
  } catch (error) {
    message.value = error instanceof Error ? error.message : t('account.permissions.transferFailed')
    transferring.value = false
  }
}

const rows = computed(() => account.value
  ? [
      { key: 'canManageMailboxes', label: t('account.permissions.manageMailboxes'), hint: t('account.permissions.manageMailboxesHint'), aria: t('account.permissions.allowMailboxes'), disabled: !editable.value },
      { key: 'canManageDomains', label: t('account.permissions.manageDomains'), hint: t('account.permissions.manageDomainsHint'), aria: t('account.permissions.allowDomains'), disabled: !account.value.canChangeRole },
      { key: 'canManageUsers', label: t('account.permissions.manageUsers'), hint: t('account.permissions.manageUsersHint'), aria: t('account.permissions.allowUsers'), disabled: !account.value.canChangeRole },
    ] as const
  : [])

const features = computed(() => [
  { key: 'calendarEnabled', label: t('account.calendar'), hint: t('account.permissions.calendarHint'), aria: t('account.permissions.allowCalendar') },
  { key: 'driveEnabled', label: t('account.drive'), hint: t('account.permissions.driveHint'), aria: t('account.permissions.allowDrive') },
] as const)

type FlagKey = (typeof rows.value)[number]['key'] | (typeof features.value)[number]['key']
function flagModel<K extends FlagKey>(list: () => readonly { key: K }[], fallback: boolean) {
  return computed<K[]>({
    get: () => list().filter(row => account.value?.[row.key] ?? fallback).map(row => row.key),
    set: (keys) => {
      if (!account.value) return
      for (const row of list()) account.value[row.key] = keys.includes(row.key)
    },
  })
}
const allowed = flagModel(() => rows.value, false)
const enabledFeatures = flagModel(() => features.value, true)
</script>

<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-xl font-medium text-highlighted">
        {{ t('account.permissions.title') }}
      </h2>
      <p class="mt-1 text-sm text-muted">
        {{ t('account.permissions.description') }}
      </p>
    </div>

    <UAlert v-if="account?.isPrimaryAdmin" color="warning" variant="subtle" icon="i-lucide-crown" :title="t('account.permissions.primaryAdmin')" :description="t('account.permissions.primaryNote')" />

    <UCard>
      <UFormField :label="t('accounts.role')" :help="account?.canChangeRole ? t('account.permissions.admins') : t('account.permissions.onlyPrimaryRoles')">
        <USelect
          :model-value="account?.role ?? 'user'"
          :items="roleItems"
          :disabled="!account || saving || !account.canChangeRole"
          class="sm:w-64"
          @update:model-value="value => account && (account.role = value === 'admin' ? 'admin' : 'user')"
        />
      </UFormField>
    </UCard>

    <UCheckboxGroup
      v-model="allowed"
      :legend="t('account.permissions.permission')"
      :items="rows.map(row => ({ value: row.key, label: row.label, description: row.hint, disabled: !account || row.disabled }))"
      variant="table"
      indicator="end"
      :ui="{ legend: 'mb-2' }"
    />

    <UCheckboxGroup
      v-model="enabledFeatures"
      :legend="t('account.permissions.features')"
      :items="features.map(row => ({ value: row.key, label: row.label, description: row.hint, disabled: !account || !editable }))"
      variant="table"
      indicator="end"
      :ui="{ legend: 'mb-2' }"
    />
    <p class="-mt-4 text-xs text-muted">
      {{ t('account.permissions.featuresHint') }}
    </p>

    <UButton v-if="editable" :loading="saving" :label="saving ? t('common.saving') : t('account.permissions.save')" @click="savePermissions" />

    <UCard v-if="isPrimary">
      <div class="space-y-4">
        <div>
          <h3 class="text-sm font-semibold text-highlighted">
            {{ t('account.permissions.transferTitle') }}
          </h3>
          <p class="mt-1 text-xs text-muted">
            {{ t('account.permissions.transferHint') }}
          </p>
        </div>
        <div class="flex flex-col gap-3 sm:flex-row">
          <USelect v-model="transferTargetId" :items="candidateItems" :placeholder="t('account.permissions.selectAccount')" :aria-label="t('account.permissions.selectNext')" class="sm:max-w-sm" />
          <UButton color="neutral" variant="outline" :disabled="!transferTarget" :label="t('account.permissions.transferTitle')" @click="transferOpen = true" />
        </div>
      </div>
    </UCard>

    <p v-if="message" role="status" class="text-sm text-muted">
      {{ message }}
    </p>

    <UModal v-model:open="transferOpen" :dismissible="!transferring" :title="t('account.permissions.transferQuestion')" :description="t('account.permissions.transferWarning')">
      <template #body>
        <div v-if="transferTarget" class="flex items-center gap-4 rounded-lg border border-default p-4">
          <AdminSystemAvatar size="lg" :name="transferTarget.name" :email="transferTarget.email" :src="transferTarget.hasAvatar ? `/api/accounts/${transferTarget.id}/avatar` : null" />
          <span class="min-w-0">
            <span class="block truncate font-semibold text-highlighted">{{ transferTarget.name }}</span>
            <span class="block truncate text-sm text-muted">{{ transferTarget.email }}</span>
          </span>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="outline" :disabled="transferring" :label="t('common.cancel')" @click="transferOpen = false" />
        <UButton :loading="transferring" :disabled="!transferTarget" :label="transferring ? t('account.permissions.transferring') : t('account.permissions.confirmTransfer')" @click="confirmTransfer" />
      </template>
    </UModal>
  </div>
</template>
