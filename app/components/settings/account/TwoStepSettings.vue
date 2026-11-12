<script setup lang="ts">
// Controls the extra step after a password sign-in. Passkeys are one possible second step; an
// authenticator app is the other. Direct passkey sign-in never needs an additional step.
// Ported from legacy/src/components/settings/two-step-settings.tsx.
import { authErrorText } from '#lib/auth/error-messages'
import { ClientRequestError } from '#lib/http/client-error'
import { beginMfaEnrollment, confirmMfaEnrollment, disableMfa } from '~/utils/settings/account/account'
import { generateRecoveryCodes, setSecondFactorRequirement } from '~/utils/settings/account/passkey-settings'
import { refreshSecurityStatus, useSecurityStatus } from '~/utils/settings/account/security-status'

type PendingAction = 'toggle-on' | 'toggle-off' | 'enroll' | 'disable' | 'codes'

const { t } = useLanguage()
const { status, error: loadFailed } = useSecurityStatus()
const pending = ref<PendingAction | null>(null)
const busy = ref(false)
const error = ref<string | null>(null)
const qrSvg = ref<string | null>(null)
const secret = ref('')
const code = ref('')
const codes = ref<string[] | null>(null)

const passkeyCount = computed(() => status.value?.passkeys.length ?? 0)
const hasAnyFactor = computed(() => passkeyCount.value > 0 || !!status.value?.totpEnabled)
const actionForPending = computed(() => {
  if (pending.value === 'enroll') return 'mfa.enroll'
  if (pending.value === 'disable') return 'mfa.disable'
  if (pending.value === 'codes') return 'mfa.codes'
  return 'second_factor.toggle'
})

async function authorized(token: string) {
  error.value = null
  if (pending.value === 'enroll') {
    const enrollment = await beginMfaEnrollment(null, token)
    qrSvg.value = enrollment.qrSvg
    secret.value = enrollment.secret
  } else if (pending.value === 'disable') {
    await disableMfa({ stepUpToken: token })
    await refreshSecurityStatus(true)
  } else if (pending.value === 'codes') {
    codes.value = await generateRecoveryCodes(token)
    await refreshSecurityStatus(true)
  } else {
    await setSecondFactorRequirement(pending.value === 'toggle-on', token)
    await refreshSecurityStatus(true)
  }
  pending.value = null
}

async function confirmEnrollment() {
  busy.value = true
  error.value = null
  try {
    codes.value = await confirmMfaEnrollment(code.value)
    qrSvg.value = null
    code.value = ''
    await refreshSecurityStatus(true)
  } catch (err) {
    error.value = authErrorText(err instanceof ClientRequestError ? err.code : undefined, t, 'mfa.confirmFailed')
  } finally {
    busy.value = false
  }
}

const stepUpOpen = computed({ get: () => pending.value !== null, set: (v) => { if (!v) pending.value = null } })
const scanOpen = computed({ get: () => qrSvg.value !== null, set: (v) => { if (!v) qrSvg.value = null } })
const codesOpen = computed({ get: () => codes.value !== null, set: (v) => { if (!v) codes.value = null } })
</script>

<template>
  <div class="space-y-5">
    <div>
      <div class="flex items-center justify-between gap-4">
        <h2 class="text-lg font-semibold text-highlighted">
          {{ t('twoStep.title') }}
        </h2>
        <USwitch
          v-if="status?.passwordSet"
          :model-value="status.requireSecondFactor"
          :disabled="busy || (!hasAnyFactor && !status.requireSecondFactor)"
          :aria-label="t('twoStep.requireTitle')"
          @update:model-value="(enabled) => pending = enabled ? 'toggle-on' : 'toggle-off'"
        />
      </div>
      <p class="mt-1 text-sm text-muted">
        {{ !status || status.passwordSet ? t('twoStep.description') : t('twoStep.passwordlessDescription') }}
      </p>
    </div>

    <p v-if="!status" :role="loadFailed ? 'alert' : undefined" class="text-sm text-muted">
      {{ loadFailed ? t('mfa.loadFailed') : t('mfa.loading') }}
    </p>

    <template v-else>
      <p v-if="status.passwordSet && !hasAnyFactor" class="text-xs leading-5 text-muted">
        {{ t('twoStep.addMethodHint') }}
      </p>

      <!-- An enabled authenticator stays visible on a passwordless account so it can be turned off. -->
      <div v-if="status.passwordSet || status.totpEnabled" class="divide-y divide-default rounded-lg border border-default">
        <div v-if="status.passwordSet" class="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex items-start gap-3">
            <UIcon name="i-lucide-key-round" class="mt-0.5 size-5 shrink-0" :class="passkeyCount ? 'text-success' : 'text-dimmed'" />
            <div>
              <h3 class="text-sm font-semibold text-highlighted">
                {{ t('twoStep.passkeyTitle') }}
              </h3>
              <p class="mt-1 text-sm text-muted">
                {{ passkeyCount ? t('twoStep.passkeysAvailable', { count: passkeyCount }) : t('twoStep.noPasskeys') }}
              </p>
            </div>
          </div>
          <UButton color="neutral" variant="outline" size="sm" class="w-fit" to="#passkeys" :label="t('twoStep.managePasskeys')" />
        </div>
        <div class="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex items-start gap-3">
            <UIcon name="i-lucide-smartphone" class="mt-0.5 size-5 shrink-0" :class="status.totpEnabled ? 'text-success' : 'text-dimmed'" />
            <div>
              <h3 class="text-sm font-semibold text-highlighted">
                {{ t('twoStep.authenticatorTitle') }}
              </h3>
              <p class="mt-1 text-sm text-muted">
                {{ status.totpEnabled ? t('twoStep.authenticatorOn', { count: status.recoveryCodesLeft }) : t('twoStep.authenticatorOff') }}
              </p>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <template v-if="status.totpEnabled">
              <UButton color="neutral" variant="outline" size="sm" :disabled="busy" :label="t('mfa.newRecoveryCodes')" @click="pending = 'codes'" />
              <UButton color="neutral" variant="ghost" size="sm" :disabled="busy" :label="t('mfa.turnOff')" @click="pending = 'disable'" />
            </template>
            <UButton v-else size="sm" :disabled="busy" :label="t('mfa.turnOn')" @click="pending = 'enroll'" />
          </div>
        </div>
      </div>

      <p v-if="error && !scanOpen" role="alert" class="text-sm text-error">
        {{ error }}
      </p>

      <SettingsAccountStepUpDialog
        v-model:open="stepUpOpen"
        :has-password="status.passwordSet"
        :has-passkey="passkeyCount > 0"
        :require-second-factor="status.requireSecondFactor"
        :totp-enabled="status.totpEnabled"
        :action="actionForPending"
        :on-authorized="authorized"
      />

      <UModal v-model:open="scanOpen" :title="t('mfa.scanTitle')" :description="t('mfa.scanDescription')" :ui="{ content: 'max-h-[calc(100dvh-4rem)]' }">
        <template #body>
          <form class="space-y-4" @submit.prevent="confirmEnrollment">
            <!-- The server renders this SVG from the otpauth URL; it carries no user content. -->
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div role="img" :aria-label="t('mfa.scanTitle')" class="mx-auto w-48 rounded-lg border border-default bg-white p-2" v-html="qrSvg ?? ''" />
            <details class="text-xs text-muted">
              <summary class="cursor-pointer">
                {{ t('mfa.cantScan') }}
              </summary>
              <code class="mt-2 block break-all rounded-md bg-elevated/50 p-2 font-mono text-default">{{ secret }}</code>
            </details>
            <UFormField :label="t('mfa.sixDigitCode')" name="mfa-code">
              <UInput id="mfa-code" v-model="code" inputmode="numeric" autocomplete="one-time-code" placeholder="123 456" required autofocus class="w-full" />
            </UFormField>
            <p v-if="error" role="alert" class="text-sm text-error">
              {{ error }}
            </p>
            <UButton type="submit" :disabled="busy" :label="busy ? t('mfa.checking') : t('mfa.verifyAndTurnOn')" />
          </form>
        </template>
      </UModal>

      <UModal v-model:open="codesOpen" :title="t('mfa.saveCodesTitle')" :description="t('mfa.saveCodesDescription')">
        <template #body>
          <div class="space-y-4">
            <SettingsAccountRecoveryCodesList :codes="codes ?? []" />
            <UButton :label="t('common.done')" @click="codes = null" />
          </div>
        </template>
      </UModal>
    </template>
  </div>
</template>
