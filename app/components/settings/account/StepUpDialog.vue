<script setup lang="ts">
// One reusable "prove it is still you" dialog. Passkeys are the primary choice when available;
// the password path remains available where the account policy allows it.
// Ported from legacy/src/components/settings/step-up-dialog.tsx.
import { authErrorText } from '#lib/auth/error-messages'
import { isPasskeyCancellation } from '#lib/auth/webauthn/browser-errors'
import { ClientRequestError } from '#lib/http/client-error'
import { stepUpWithPasskey, stepUpWithPassword } from '~/utils/settings/account/passkey-settings'

const props = withDefaults(defineProps<{
  hasPassword: boolean
  hasPasskey?: boolean
  requireSecondFactor?: boolean
  totpEnabled?: boolean
  action: string
  title?: string
  description?: string
  /** Position in a multi-step flow, so each confirmation says where it is. */
  step?: { current: number, total: number }
  targetUserId?: string
  /** Awaited with the step-up token. Return true to keep the dialog open for the next step of the same flow. */
  onAuthorized: (stepUpToken: string) => unknown
}>(), { hasPasskey: false, requireSecondFactor: false, totpEnabled: false, title: undefined, description: undefined, step: undefined, targetUserId: undefined })

const open = defineModel<boolean>('open', { default: false })
const { t } = useLanguage()

const password = ref('')
const code = ref('')
const showPassword = ref(false)
const error = ref<string | null>(null)
const busy = ref(false)

const passwordPathAllowed = computed(() => props.hasPassword && (!props.requireSecondFactor || props.totpEnabled))
const needsCode = computed(() => props.hasPassword && props.totpEnabled && (props.requireSecondFactor || props.action === 'mfa.disable'))
const showPasswordForm = computed(() => !props.hasPasskey || showPassword.value || !passwordPathAllowed.value)

function resetFields() {
  password.value = ''
  code.value = ''
  showPassword.value = false
}

watch(open, (next) => {
  if (!next) {
    resetFields()
    error.value = null
  }
})

async function authorize(getToken: () => Promise<string>) {
  busy.value = true
  error.value = null
  try {
    const token = await getToken()
    const keepOpen = await props.onAuthorized(token)
    if (keepOpen === true) {
      // The next step of the same flow asks for its own proof.
      resetFields()
      return
    }
    open.value = false
  } catch (err) {
    error.value = isPasskeyCancellation(err)
      ? t('authError.passkeyCancelled')
      : authErrorText(err instanceof ClientRequestError ? err.code : undefined, t, 'passkey.verifyFailed')
  } finally {
    busy.value = false
  }
}

function submitPassword() {
  void authorize(() => stepUpWithPassword(password.value, needsCode.value ? code.value : undefined, props.action, props.targetUserId))
}
</script>

<template>
  <UModal v-model:open="open" :title="title ?? t('passkey.verifyTitle')" :description="description ?? t('passkey.verifyDescription')">
    <template v-if="step && step.total > 1" #title>
      <span class="block text-xs font-medium uppercase tracking-wide text-dimmed" aria-live="polite">
        {{ t('passkey.stepOf', { current: step.current, total: step.total }) }}
      </span>
      {{ title ?? t('passkey.verifyTitle') }}
    </template>
    <template #body>
      <div class="space-y-4">
        <div v-if="hasPasskey" class="space-y-3">
          <UButton
            block
            icon="i-lucide-key-round"
            :label="busy ? t('passkey.waiting') : t('passkey.verifyWithPasskey')"
            :disabled="busy"
            @click="authorize(() => stepUpWithPasskey(action, targetUserId))"
          />
          <p class="flex items-start gap-2 text-xs leading-5 text-muted">
            <UIcon name="i-lucide-shield-check" class="mt-0.5 size-4 shrink-0" />
            {{ t('passkey.verifyHint') }}
          </p>
          <p v-if="passwordPathAllowed" class="text-center text-xs uppercase tracking-wide text-dimmed">
            {{ t('passkey.or') }}
          </p>
        </div>

        <form v-if="showPasswordForm && passwordPathAllowed" class="space-y-4" @submit.prevent="submitPassword">
          <UFormField :label="t('common.password')" name="step-up-password">
            <UInput
              id="step-up-password"
              v-model="password"
              type="password"
              autocomplete="current-password"
              :autofocus="!hasPasskey"
              required
              class="w-full"
            />
          </UFormField>
          <UFormField v-if="needsCode" :label="t('mfa.code')" name="step-up-code">
            <UInput
              id="step-up-code"
              v-model="code"
              inputmode="text"
              autocomplete="one-time-code"
              autocapitalize="none"
              autocorrect="off"
              :spellcheck="false"
              :placeholder="t('auth.codePlaceholder')"
              required
              class="w-full"
            />
          </UFormField>
          <UButton
            type="submit"
            :variant="hasPasskey ? 'outline' : 'solid'"
            :color="hasPasskey ? 'neutral' : 'primary'"
            :disabled="busy"
            :label="busy ? t('common.pleaseWait') : t('common.continue')"
          />
        </form>

        <p v-if="!hasPasskey && !passwordPathAllowed" role="alert" class="text-sm text-error">
          {{ t('passkey.verifyUnavailable') }}
        </p>
        <UButton
          v-if="hasPasskey && passwordPathAllowed && !showPassword"
          block
          variant="link"
          color="neutral"
          :label="t('passkey.usePasswordInstead')"
          @click="showPassword = true"
        />
        <p v-if="error" role="alert" class="text-sm text-error">
          {{ error }}
        </p>
      </div>
    </template>
  </UModal>
</template>
