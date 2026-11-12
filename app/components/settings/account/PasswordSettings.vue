<script setup lang="ts">
// Password controls that understand passkey-only accounts: set one, change it, or remove it once
// another sign-in method exists. Ported from legacy/src/components/settings/password-settings.tsx.
import { authErrorText } from '#lib/auth/error-messages'
import { ClientRequestError } from '#lib/http/client-error'
import type { PasskeyPolicyChoice } from '~/types/settings/account'
import { updatePassword } from '~/utils/settings/account/account'
import { removePassword, setPassword } from '~/utils/settings/account/passkey-settings'
import { refreshSecurityStatus, useSecurityStatus } from '~/utils/settings/account/security-status'

const { t } = useLanguage()
const { status, error: loadFailed } = useSecurityStatus()

const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const message = ref<string | null>(null)
const error = ref<string | null>(null)
const busy = ref(false)
const pending = ref<'set' | 'remove' | null>(null)
const confirmRemove = ref(false)
const passwordProof = ref<string | null>(null)

const hasPasskeys = computed(() => (status.value?.passkeys.length ?? 0) > 0)
const stepUpOpen = computed({
  get: () => pending.value !== null,
  set: (value) => { if (!value) pending.value = null },
})
const choiceOpen = computed({ get: () => passwordProof.value !== null, set: () => {} })

function failure(err: unknown) {
  return authErrorText(err instanceof ClientRequestError ? err.code : undefined, t, 'settings.password.failed')
}

async function change() {
  message.value = null
  error.value = null
  if (newPassword.value !== confirmPassword.value) {
    error.value = t('settings.password.mismatch')
    return
  }
  busy.value = true
  try {
    await updatePassword(currentPassword.value, newPassword.value)
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    message.value = t('settings.password.changed')
    await refreshSecurityStatus(true)
  } catch (err) {
    error.value = failure(err)
  } finally {
    busy.value = false
  }
}

function requestSet() {
  error.value = null
  if (newPassword.value !== confirmPassword.value) {
    error.value = t('settings.password.mismatch')
    return
  }
  pending.value = 'set'
}

async function authorized(token: string) {
  error.value = null
  if (pending.value === 'set') {
    // Setting a password first asks what the account should require; the token is spent then.
    passwordProof.value = token
    pending.value = null
    return
  }
  await removePassword(token)
  message.value = t('passkey.passwordRemoved')
  await refreshSecurityStatus(true)
  pending.value = null
}

async function choosePasswordPolicy(choice: PasskeyPolicyChoice) {
  if (!passwordProof.value || busy.value) return
  if (choice === 'passkey-only') {
    passwordProof.value = null
    newPassword.value = ''
    confirmPassword.value = ''
    return
  }
  busy.value = true
  error.value = null
  try {
    await setPassword(newPassword.value, passwordProof.value, choice === 'password-and-passkey')
    message.value = t('passkey.passwordSet')
    newPassword.value = ''
    confirmPassword.value = ''
    await refreshSecurityStatus(true)
  } catch (err) {
    error.value = failure(err)
    await refreshSecurityStatus(true)
  } finally {
    passwordProof.value = null
    busy.value = false
  }
}
</script>

<template>
  <p v-if="!status" :role="loadFailed ? 'alert' : undefined" class="text-sm text-muted">
    {{ loadFailed ? t('settings.password.failed') : t('mfa.loading') }}
  </p>
  <div v-else class="space-y-4">
    <form v-if="status.passwordSet" class="space-y-4" @submit.prevent="change">
      <UFormField :label="t('settings.password.current')" name="currentPassword">
        <UInput id="currentPassword" v-model="currentPassword" type="password" autocomplete="current-password" required class="w-full" />
      </UFormField>
      <UFormField :label="t('settings.password.new')" name="newPassword">
        <UInput id="newPassword" v-model="newPassword" type="password" autocomplete="new-password" :minlength="8" required class="w-full" />
      </UFormField>
      <UFormField :label="t('settings.password.confirm')" name="confirmPassword">
        <UInput id="confirmPassword" v-model="confirmPassword" type="password" autocomplete="new-password" :minlength="8" required class="w-full" />
      </UFormField>
      <div class="flex flex-wrap items-center gap-3">
        <UButton type="submit" :disabled="busy" :label="busy ? t('settings.password.changing') : t('settings.password.change')" />
        <UButton
          color="neutral"
          variant="outline"
          :disabled="busy || !hasPasskeys"
          :title="hasPasskeys ? undefined : t('passkey.addBeforeRemovingPassword')"
          :label="t('passkey.removePassword')"
          @click="confirmRemove = true"
        />
      </div>
      <p v-if="!hasPasskeys" class="text-xs leading-5 text-muted">
        {{ t('passkey.addBeforeRemovingPassword') }}
      </p>
      <!-- Without a second step the password is the weakest factor, so passkey-only is the better account. -->
      <p v-else-if="!status.requireSecondFactor" class="text-xs leading-5 text-muted">
        {{ t('passkey.removePasswordRecommended') }}
      </p>
    </form>

    <form v-else class="space-y-4" @submit.prevent="requestSet">
      <p class="text-sm text-muted">
        {{ t('passkey.noPassword') }}
      </p>
      <UFormField :label="t('settings.password.new')" name="setPassword">
        <UInput id="setPassword" v-model="newPassword" type="password" autocomplete="new-password" :minlength="8" required class="w-full" />
      </UFormField>
      <UFormField :label="t('settings.password.confirm')" name="setPasswordConfirm">
        <UInput id="setPasswordConfirm" v-model="confirmPassword" type="password" autocomplete="new-password" :minlength="8" required class="w-full" />
      </UFormField>
      <UButton type="submit" icon="i-lucide-key-round" :disabled="busy" :label="t('passkey.setPassword')" />
    </form>

    <p v-if="message" role="status" class="text-sm text-muted">
      {{ message }}
    </p>
    <p v-if="error" role="alert" class="text-sm text-error">
      {{ error }}
    </p>

    <UModal v-model:open="confirmRemove" :title="t('passkey.removePasswordTitle')" :description="t('passkey.removePasswordDescription')">
      <template #body>
        <p class="text-sm leading-6 text-muted">
          {{ t('passkey.lostAllHint') }}
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" :label="t('common.cancel')" @click="confirmRemove = false" />
          <UButton color="error" :label="t('passkey.removePassword')" @click="confirmRemove = false; pending = 'remove'" />
        </div>
      </template>
    </UModal>

    <SettingsAccountStepUpDialog
      v-model:open="stepUpOpen"
      :has-password="status.passwordSet"
      :has-passkey="hasPasskeys"
      :require-second-factor="status.requireSecondFactor"
      :totp-enabled="status.totpEnabled"
      :action="pending === 'set' ? 'password.set' : 'password.remove'"
      :on-authorized="authorized"
    />
    <SettingsAccountPasskeyFirstChoice
      v-model:open="choiceOpen"
      context="add-password"
      :totp-enabled="status.totpEnabled"
      :busy="busy"
      @choose="choosePasswordPolicy"
    />
  </div>
</template>
