<script setup lang="ts">
// Ported from legacy/src/app/(admin)/accounts/delete-accounts-dialog.tsx.
import { ACCOUNT_RESTORE_DAYS } from '#lib/accounts/deletion-utils'
import type { Account } from '~/types/admin/system/accounts'
import { deleteAccounts } from '~/utils/admin/system/accounts'

const props = defineProps<{ accounts: Account[], candidates: Account[] }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ deleted: [] }>()
const { t } = useLanguage()

const NONE = '__none'
const transferToId = ref(NONE)
const deleting = ref(false)
const message = ref<string | null>(null)

const recipients = computed(() => {
  const doomed = new Set(props.accounts.map(account => account.id))
  return [
    { label: t('accounts.transferNone'), value: NONE },
    ...props.candidates
      .filter(account => !doomed.has(account.id) && !account.disabled && !account.deletedAt)
      .map(account => ({ label: `${account.name} (${account.email})`, value: account.id })),
  ]
})

watch(open, (value) => {
  if (!value) message.value = null
})

async function confirm() {
  deleting.value = true
  message.value = null
  try {
    await deleteAccounts(props.accounts.map(account => account.id), transferToId.value === NONE ? null : transferToId.value)
    transferToId.value = NONE
    emit('deleted')
  } catch (error) {
    message.value = error instanceof Error ? error.message : t('accounts.deleteFailed')
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :dismissible="!deleting" :title="t('accounts.deleteTitle', { count: accounts.length })" :description="t('accounts.deleteDescription', { days: ACCOUNT_RESTORE_DAYS })">
    <template #body>
      <div class="space-y-4">
        <ul class="space-y-1 text-sm text-toned">
          <li v-for="account in accounts" :key="account.id" class="truncate">
            {{ account.name }} <span class="text-muted">{{ account.email }}</span>
          </li>
        </ul>
        <UFormField :label="t('accounts.transferLabel')" :help="t('accounts.transferHint')">
          <USelect v-model="transferToId" :items="recipients" :disabled="deleting" class="w-full" />
        </UFormField>
        <p v-if="message" role="alert" class="text-sm text-error">
          {{ message }}
        </p>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="outline" :disabled="deleting" :label="t('common.cancel')" @click="open = false" />
        <UButton color="error" :loading="deleting" :disabled="!accounts.length" :label="deleting ? t('accounts.deleting') : t('accounts.confirmDelete')" @click="confirm" />
      </div>
    </template>
  </UModal>
</template>
