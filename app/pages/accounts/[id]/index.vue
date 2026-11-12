<script setup lang="ts">
// Ported from legacy/src/app/(admin)/accounts/[id]/page.tsx.
import { getManagedAccountAvatarUrl, saveManagedAccount, uploadManagedAccountAvatar } from '~/utils/admin/system/accounts'
import { useManagedAccountDraft } from '~/utils/admin/system/use-managed-account'

const { t } = useLanguage()
const route = useRoute()
const id = computed(() => String(route.params.id))
const { draft: account, data, error: loadError } = useManagedAccountDraft(id)

const saving = ref(false)
const message = ref<string | null>(null)
const avatarVersion = ref(0)
const fileInput = ref<HTMLInputElement | null>(null)

async function saveDetails() {
  if (!account.value) return
  saving.value = true
  message.value = null
  try {
    await saveManagedAccount(account.value)
    data.value = { ...account.value }
    message.value = t('account.updated')
  } catch (error) {
    message.value = error instanceof Error ? error.message : t('account.updateFailed')
  } finally {
    saving.value = false
  }
}

async function uploadAvatar(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !account.value) return
  try {
    await uploadManagedAccountAvatar(account.value.id, file)
    account.value.hasAvatar = true
    avatarVersion.value = Date.now()
  } catch (error) {
    message.value = error instanceof Error ? error.message : t('account.avatarFailed')
  }
}
</script>

<template>
  <p v-if="!account" class="text-sm text-muted">
    {{ loadError ? (loadError.message || t('account.loadFailed')) : t('account.loadingAccount') }}
  </p>
  <div v-else class="space-y-6">
    <div>
      <h2 class="text-xl font-medium text-highlighted">
        {{ t('account.detailsTitle') }}
      </h2>
      <p class="mt-1 text-sm text-muted">
        {{ t('account.detailsDescription') }}
      </p>
    </div>
    <UCard>
      <form class="space-y-5" @submit.prevent="saveDetails">
        <UAlert v-if="!account.editable" color="neutral" variant="subtle" :description="t('account.noPermission')" />
        <div class="flex items-center gap-4">
          <AdminSystemAvatar size="xl" :name="account.name" :email="account.email" :src="account.hasAvatar ? getManagedAccountAvatarUrl(id, avatarVersion) : null" />
          <template v-if="account.editable">
            <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp,image/gif" class="sr-only" @change="uploadAvatar">
            <UButton color="neutral" variant="outline" icon="i-lucide-upload" :label="t('account.changeAvatar')" @click="fileInput?.click()" />
          </template>
        </div>
        <UFormField :label="t('auth.email')">
          <UInput :model-value="account.email" readonly disabled class="w-full" />
        </UFormField>
        <UFormField :label="t('common.name')">
          <UInput v-model="account.name" :disabled="!account.editable" class="w-full" />
        </UFormField>
        <UFormField v-if="account.canForwardEmail" :label="t('account.forwardingOptional')" :help="t('settings.forwarding.hint')">
          <UInput
            :model-value="account.forwardingEmail ?? ''"
            type="email"
            placeholder="destination@example.com"
            :disabled="!account.editable"
            class="w-full"
            @update:model-value="value => account && (account.forwardingEmail = String(value) || null)"
          />
        </UFormField>
        <div class="flex items-center justify-between gap-4 rounded-lg border border-default bg-elevated/50 p-4">
          <div class="space-y-1">
            <p class="text-sm font-semibold text-highlighted">
              {{ t('account.enabled') }}
            </p>
            <p class="text-xs text-muted">
              {{ account.isPrimaryAdmin ? t('account.primaryAlwaysEnabled') : t('account.allowSignIn') }}
            </p>
          </div>
          <USwitch
            :model-value="!account.disabled"
            :aria-label="t('account.enabled')"
            :disabled="saving || !account.editable || account.isPrimaryAdmin"
            @update:model-value="value => account && (account.disabled = !value)"
          />
        </div>
        <UButton v-if="account.editable" type="submit" :loading="saving" :disabled="!account.name.trim()" :label="saving ? t('common.saving') : t('account.saveDetails')" />
      </form>
    </UCard>
    <p v-if="message" role="status" class="text-sm text-muted">
      {{ message }}
    </p>
  </div>
</template>
