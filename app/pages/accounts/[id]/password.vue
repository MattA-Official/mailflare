<script setup lang="ts">
// Ported from legacy/src/app/(admin)/accounts/[id]/password/page.tsx.
import * as z from 'zod'
import type { SecurityStatus } from '~/types/settings/account'
import { loadSecurityStatus } from '~/utils/settings/account/passkey-settings'
import { createRecoveryLink, saveManagedAccount } from '~/utils/admin/system/accounts'
import { useManagedAccount } from '~/utils/admin/system/use-managed-account'

const { t } = useLanguage()
const route = useRoute()
const id = computed(() => String(route.params.id))
const { data: account, error: loadError } = useManagedAccount(id)

const state = reactive({ password: '' })
const schema = computed(() => z.object({ password: z.string().trim().min(8, t('auth.passwordTooShort')).max(128) }))
const saving = ref(false)
const message = ref<string | null>(null)
const recoveryOpen = ref(false)
const pendingRecovery = ref(false)
const pendingReset = ref(false)
const recoveryLink = ref<string | null>(null)
const { copy, copied } = useCopy()

watch(loadError, (error) => {
  if (error) message.value = error.message || t('account.loadFailed')
})
// The signed-in admin's own sign-in methods, for the step-up check. Optional: without it the
// check assumes a password.
const { data: adminSecurity } = useAsyncData<SecurityStatus | null>('step-up-security-status', () => loadSecurityStatus().catch(() => null))

const stepUp = computed(() => ({
  hasPassword: adminSecurity.value?.passwordSet ?? true,
  hasPasskey: (adminSecurity.value?.passkeys.length ?? 0) > 0,
  requireSecondFactor: adminSecurity.value?.requireSecondFactor ?? false,
  totpEnabled: adminSecurity.value?.totpEnabled ?? false,
}))

function requestReset() {
  if (account.value) pendingReset.value = true
}

async function resetPassword(token: string) {
  if (!account.value) return
  saving.value = true
  message.value = null
  try {
    await saveManagedAccount({ ...account.value, newPassword: state.password }, token)
    state.password = ''
    message.value = t('account.password.resetDone')
  } catch (error) {
    message.value = error instanceof Error ? error.message : t('account.password.resetFailed')
    throw error
  } finally {
    saving.value = false
  }
}

async function makeRecoveryLink(token: string) {
  recoveryLink.value = await createRecoveryLink(id.value, token)
}

function copyLink() {
  if (recoveryLink.value) void copy(recoveryLink.value)
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-xl font-medium text-highlighted">
        {{ t('account.password.title') }}
      </h2>
      <p class="mt-1 text-sm text-muted">
        {{ t('account.password.resetFor', { name: account?.name ?? t('account.password.thisAccount') }) }}
      </p>
    </div>
    <UCard>
      <p v-if="account && !account.editable" class="text-sm text-muted">
        {{ t('account.password.onlyPrimary') }}
      </p>
      <p v-else-if="account && !account.passwordSet" class="text-sm text-muted">
        {{ t('account.recovery.usesPasskeys') }}
      </p>
      <UForm v-else :schema="schema" :state="state" class="space-y-5" @submit="requestReset">
        <UFormField :label="t('account.password.new')" :help="t('account.password.hint')" name="password" required>
          <UInput v-model="state.password" type="password" autocomplete="new-password" maxlength="128" required :disabled="!account || saving" :placeholder="t('account.password.placeholder')" />
        </UFormField>
        <UButton type="submit" :loading="saving" :disabled="!account" :label="saving ? t('account.password.resetting') : t('account.password.reset')" />
      </UForm>
    </UCard>
    <p v-if="message" role="status" class="text-sm text-muted">
      {{ message }}
    </p>

    <UCard v-if="account?.editable">
      <div class="space-y-3">
        <div>
          <h3 class="text-lg font-semibold text-highlighted">
            {{ t('account.recovery.title') }}
          </h3>
          <p class="mt-1 text-sm text-muted">
            {{ t('account.recovery.description') }}
          </p>
        </div>
        <UButton color="neutral" variant="outline" icon="i-lucide-key-round" :label="t('account.recovery.create')" @click="recoveryOpen = true" />
      </div>
    </UCard>

    <UModal v-model:open="recoveryOpen" :title="t('account.recovery.createTitle')" :description="t('account.recovery.createDescription')">
      <template #footer>
        <UButton :label="t('common.continue')" @click="recoveryOpen = false; pendingRecovery = true" />
      </template>
    </UModal>

    <SettingsAccountStepUpDialog
      v-model:open="pendingRecovery"
      v-bind="stepUp"
      action="admin.recovery_link"
      :target-user-id="id"
      :on-authorized="makeRecoveryLink"
    />
    <SettingsAccountStepUpDialog
      v-model:open="pendingReset"
      v-bind="stepUp"
      action="admin.password_reset"
      :target-user-id="id"
      :on-authorized="resetPassword"
    />

    <UModal :open="!!recoveryLink" :title="t('account.recovery.createdTitle')" :description="t('account.recovery.createdDescription')" @update:open="open => !open && (recoveryLink = null)">
      <template #body>
        <code class="block break-all rounded-lg bg-elevated p-3 font-mono text-xs text-toned">{{ recoveryLink }}</code>
      </template>
      <template #footer>
        <div class="flex items-center gap-3">
          <UButton color="neutral" variant="outline" icon="i-lucide-copy" :label="copied ? t('common.copied') : t('account.recovery.copy')" @click="copyLink" />
          <UButton :label="t('common.done')" @click="recoveryLink = null" />
        </div>
      </template>
    </UModal>
  </div>
</template>
