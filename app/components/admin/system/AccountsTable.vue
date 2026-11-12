<script setup lang="ts">
// Ported from legacy/src/app/(admin)/accounts/accounts-table.tsx.
import { getAccountPurgeDate, getAccountStatus } from '#lib/accounts/deletion-utils'
import type { Account } from '~/types/admin/system/accounts'
import { formatAccountDate, formatAccountDateTime } from '~/utils/admin/system/accounts'

const props = defineProps<{
  accounts: Account[]
  currentUserId?: string
  isPrimaryAdmin: boolean
  loading: boolean
  restoringId: string | null
}>()
const selected = defineModel<Set<string>>('selected', { required: true })
const emit = defineEmits<{ deleteSelected: [], restore: [account: Account] }>()
const { t } = useLanguage()
const NuxtLink = resolveComponent('NuxtLink')

const columns = 'grid grid-cols-[auto_minmax(0,1fr)_1.75rem] items-center gap-x-4 md:grid-cols-[auto_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_1.75rem]'
const statusColor = { active: 'success', disabled: 'neutral', pendingDeletion: 'error' } as const

function isSelectable(account: Account) {
  return !account.isPrimaryAdmin && account.id !== props.currentUserId && !account.deletedAt && (props.isPrimaryAdmin || account.role !== 'admin')
}
const selectable = computed(() => props.accounts.filter(isSelectable))
const allSelected = computed(() => selectable.value.length > 0 && selectable.value.every(account => selected.value.has(account.id)))

function toggle(id: string, checked: boolean) {
  const next = new Set(selected.value)
  if (checked) next.add(id)
  else next.delete(id)
  selected.value = next
}

function toggleAll(checked: boolean) {
  selected.value = checked ? new Set(selectable.value.map(account => account.id)) : new Set()
}

const rows = computed(() => props.accounts.map((account) => {
  const status = getAccountStatus({ disabled: !!account.disabled, deletedAt: account.deletedAt })
  return {
    account,
    status,
    locked: !props.isPrimaryAdmin && account.role === 'admin' && account.id !== props.currentUserId,
    statusLabel: status === 'pendingDeletion' && account.deletedAt
      ? t('accounts.status.pendingDeletion', { date: formatAccountDate(getAccountPurgeDate(new Date(account.deletedAt)).toISOString()) })
      : t(`accounts.status.${status}`),
    roleLabel: account.isPrimaryAdmin ? t('accounts.primaryAdmin') : t(account.role === 'admin' ? 'accounts.role.admin' : 'accounts.role.user'),
  }
}))

const menu = computed(() => [[{ label: t('accounts.deleteSelected'), icon: 'i-lucide-trash-2', color: 'error' as const, disabled: !selected.value.size, onSelect: () => emit('deleteSelected') }]])
</script>

<template>
  <div class="overflow-hidden rounded-lg border border-default bg-default">
    <div :class="columns" class="border-b border-default px-5 py-3 text-xs font-medium uppercase text-muted">
      <UCheckbox :model-value="allSelected" :disabled="!selectable.length" :aria-label="t('accounts.selectAll')" @update:model-value="value => toggleAll(value === true)" />
      <span>{{ selected.size ? t('common.selectedCount', { count: selected.size }) : t('accounts.colAccount') }}</span>
      <span class="hidden md:block">{{ t('accounts.colStatus') }}</span>
      <span class="hidden md:block">{{ t('accounts.colLastSignIn') }}</span>
      <span class="flex justify-end">
        <UDropdownMenu :items="menu" :content="{ align: 'end' }">
          <UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-ellipsis-vertical" :aria-label="t('accounts.moreActions')" />
        </UDropdownMenu>
      </span>
    </div>
    <p v-if="loading" class="px-5 py-4 text-sm text-muted">
      {{ t('common.loading') }}
    </p>
    <div
      v-for="row in rows"
      :key="row.account.id"
      :class="[columns, row.account.deletedAt ? 'opacity-80' : row.locked ? 'cursor-not-allowed opacity-50' : 'hover:bg-elevated/50']"
      :title="row.locked && !row.account.deletedAt ? t('accounts.lockedAdmin') : undefined"
      :aria-disabled="row.locked && !row.account.deletedAt ? 'true' : undefined"
      class="border-b border-default px-5 py-3 last:border-b-0"
    >
      <UCheckbox
        :model-value="selected.has(row.account.id)"
        :disabled="!isSelectable(row.account)"
        :aria-label="t('accounts.selectOne', { name: row.account.name })"
        @update:model-value="value => toggle(row.account.id, value === true)"
      />
      <component :is="row.account.deletedAt || row.locked ? 'div' : NuxtLink" :to="row.account.deletedAt || row.locked ? undefined : `/accounts/${row.account.id}`" class="contents">
        <span class="flex min-w-0 items-center gap-4">
          <AdminSystemAvatar :name="row.account.name" :email="row.account.email" :src="row.account.hasAvatar ? `/api/accounts/${row.account.id}/avatar` : null" />
          <span class="min-w-0">
            <span class="flex items-center gap-2">
              <span class="truncate font-semibold text-highlighted">{{ row.account.name }}</span>
              <UBadge :color="row.account.isPrimaryAdmin ? 'warning' : 'neutral'" variant="subtle" size="sm" :label="row.roleLabel" />
            </span>
            <span class="block truncate text-sm text-muted">{{ row.account.email }}</span>
          </span>
        </span>
        <span class="hidden md:block"><UBadge :color="statusColor[row.status]" variant="subtle" size="sm" :label="row.statusLabel" /></span>
        <span class="hidden text-sm text-muted md:block">{{ row.account.lastSignInAt ? formatAccountDateTime(row.account.lastSignInAt) : t('accounts.neverSignedIn') }}</span>
      </component>
      <span class="flex justify-end">
        <UButton
          v-if="row.account.deletedAt"
          color="neutral"
          variant="ghost"
          size="xs"
          icon="i-lucide-rotate-ccw"
          :title="t('accounts.restore')"
          :aria-label="t('accounts.restoreAccount', { name: row.account.name })"
          :disabled="row.locked || restoringId === row.account.id"
          @click="emit('restore', row.account)"
        />
      </span>
    </div>
  </div>
</template>
