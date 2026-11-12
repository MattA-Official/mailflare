<script setup lang="ts">
// Password, passkey and second-factor sign-in. `?add=1` signs in another account alongside the
// current one. Ported from legacy/src/app/(auth)/login.
import { browserSupportsWebAuthn, browserSupportsWebAuthnAutofill, WebAuthnAbortService } from '@simplewebauthn/browser'
import { authErrorText } from '#lib/auth/error-messages'
import { isPasskeyCancellation } from '#lib/auth/webauthn/browser-errors'
import {
  finishPasskeyLogin,
  getSetupStatus,
  requestPasskeyLoginOptions,
  startPasskeyAutofill,
  submitLogin,
  submitMfaCode,
  submitPasskeyLogin,
  submitPasskeyMfa,
} from '~/utils/auth/flows'
import type { LoginResult } from '~/types/auth/flows'

definePageMeta({
  layout: false,
  auth: { mode: 'public' },
  middleware: [
    async (to) => {
      // Upstream's server page: no admin yet means first-run setup; a signed-in user goes to the inbox
      // unless they are adding another account.
      const status = await getSetupStatus().catch(() => null)
      if (status?.hasAdminAccount === false) return navigateTo('/setup', { replace: true })
      if (to.query.add === '1') return
      const info = await fetchSessionInfo({ fresh: true })
      if (info?.status === 200) return navigateTo('/inbox', { replace: true })
    },
  ],
})

const { t } = useLanguage()
const route = useRoute()
const adding = computed(() => route.query.add === '1')

const form = reactive({ email: '', password: '', turnstileToken: '' })
const error = ref<string | null>(null)
const loading = ref(false)
const turnstile = useTemplateRef<{ reset: () => void }>('turnstile')
// Set once the password is accepted for an account with a second factor.
const challengeToken = ref<string | null>(null)
const methods = ref<string[]>([])
const code = ref('')
let running = false
let unmounted = false

async function finish(data: LoginResult) {
  clearCurrentUserCache()
  await navigateTo(data.redirect ?? '/inbox', { replace: true })
}

function resetChallenge() {
  challengeToken.value = null
  methods.value = []
  code.value = ''
}

// Offer saved passkeys through the browser's credential picker (conditional mediation).
onMounted(async () => {
  if (!browserSupportsWebAuthn()) return
  try {
    if (!(await browserSupportsWebAuthnAutofill())) return
    const options = await requestPasskeyLoginOptions()
    if (unmounted || !options.options || !options.ceremonyToken) return
    const response = await startPasskeyAutofill(options)
    if (unmounted || running) return
    running = true
    loading.value = true
    const { ok, data } = await finishPasskeyLogin(options, response)
    if (ok) await finish(data)
  } catch {
    // No credential chosen, a cancelled prompt or no autofill surface is not an error on page load.
  } finally {
    running = false
    if (!unmounted) loading.value = false
  }
})

onBeforeUnmount(() => {
  unmounted = true
  WebAuthnAbortService.cancelCeremony()
})

async function onPasskey() {
  if (!browserSupportsWebAuthn()) {
    error.value = t('passkey.browserUnsupported')
    return
  }
  loading.value = true
  error.value = null
  try {
    const { ok, data } = await submitPasskeyLogin()
    if (!ok) {
      error.value = authErrorText(data.code, t, 'passkey.loginFailed')
      return
    }
    await finish(data)
  } catch (cause) {
    error.value = isPasskeyCancellation(cause) ? t('authError.passkeyCancelled') : t('authError.passkeyUnavailable')
  } finally {
    loading.value = false
  }
}

async function onPasskeyMfa() {
  if (!challengeToken.value) return
  loading.value = true
  error.value = null
  try {
    const { ok, data } = await submitPasskeyMfa(challengeToken.value)
    if (!ok) {
      if (data.code === 'passkey_expired') resetChallenge()
      error.value = authErrorText(data.code, t, 'passkey.loginFailed')
      return
    }
    await finish(data)
  } catch (cause) {
    error.value = isPasskeyCancellation(cause) ? t('authError.passkeyCancelled') : t('authError.passkeyUnavailable')
  } finally {
    loading.value = false
  }
}

async function onSubmit() {
  loading.value = true
  error.value = null
  try {
    const { ok, data } = await submitLogin({ email: form.email, password: form.password, turnstileToken: form.turnstileToken || undefined })
    if (!ok) {
      error.value = authErrorText(data.code, t, 'auth.loginFailed')
      turnstile.value?.reset()
      return
    }
    if (data.mfaRequired && data.challengeToken) {
      challengeToken.value = data.challengeToken
      methods.value = data.methods ?? []
      return
    }
    await finish(data)
  } catch (cause) {
    error.value = cause instanceof DOMException && cause.name === 'TimeoutError' ? t('auth.loginTimeout') : t('auth.loginUnreachable')
    turnstile.value?.reset()
  } finally {
    loading.value = false
  }
}

async function onSubmitCode() {
  if (!challengeToken.value) return
  loading.value = true
  error.value = null
  try {
    const { ok, data } = await submitMfaCode(challengeToken.value, code.value)
    if (!ok) {
      if (data.code === 'passkey_expired') resetChallenge()
      error.value = authErrorText(data.code, t, 'auth.codeMismatch')
      return
    }
    await finish(data)
  } catch {
    error.value = t('auth.loginUnreachable')
  } finally {
    loading.value = false
  }
}

function backToSignIn() {
  resetChallenge()
  error.value = null
}

// An empty method list means the server did not say, so keep the code field: it is the only
// method that can still work.
const hasCodeMethods = computed(() => methods.value.length === 0 || methods.value.includes('totp') || methods.value.includes('recovery'))
const canUsePasskey = computed(() => methods.value.includes('passkey'))
const mfaDescription = computed(() => {
  if (canUsePasskey.value) return hasCodeMethods.value ? t('auth.mfaPasskeyOrCodeDescription') : t('auth.mfaPasskeyDescription')
  return methods.value.length === 0 || methods.value.includes('recovery') ? t('auth.mfaDescription') : t('auth.mfaCodeDescription')
})
const codeLabel = computed(() => (methods.value.includes('recovery') ? t('auth.codeOrRecovery') : t('auth.codeLabel')))
</script>

<template>
  <AuthShell v-if="challengeToken" icon="i-lucide-shield-check" :title="t('auth.mfaTitle')" :description="mfaDescription">
    <form class="space-y-5" @submit.prevent="onSubmitCode">
      <div v-if="canUsePasskey" class="space-y-4">
        <UButton block size="xl" icon="i-lucide-key-round" :disabled="loading" :label="t('passkey.usePasskey')" @click="onPasskeyMfa" />
        <USeparator v-if="hasCodeMethods" :label="t('passkey.orCode')" />
      </div>
      <template v-if="hasCodeMethods">
        <UFormField :label="codeLabel" name="code" required>
          <UInput
            v-model="code"
            name="code"
            inputmode="text"
            autocomplete="one-time-code"
            autocapitalize="none"
            autocorrect="off"
            :spellcheck="false"
            autofocus
            required
            size="xl"
            class="w-full"
            :placeholder="t('auth.codePlaceholder')"
            :aria-invalid="error ? true : undefined"
          />
        </UFormField>
        <UButton type="submit" block size="xl" :loading="loading" :label="loading ? t('auth.verifying') : t('auth.verify')" />
      </template>
      <UAlert v-if="error" role="alert" color="error" variant="subtle" :title="error" />
      <p v-if="!hasCodeMethods" class="text-xs leading-5 text-muted">{{ t('passkey.lostAllHint') }}</p>
      <UButton block variant="link" color="neutral" :label="t('auth.backToSignIn')" @click="backToSignIn" />
    </form>
  </AuthShell>

  <AuthShell
    v-else
    icon="i-lucide-mail"
    :title="adding ? t('auth.addAnother') : t('auth.signIn')"
    :description="adding ? t('auth.addDescription') : t('auth.signInDescription')"
  >
    <form method="post" class="space-y-5" @submit.prevent="onSubmit">
      <UFormField :label="t('auth.email')" name="email" required>
        <UInput
          v-model="form.email"
          name="email"
          type="email"
          autocomplete="username webauthn"
          required
          size="xl"
          class="w-full"
          :aria-invalid="error ? true : undefined"
        />
      </UFormField>
      <UFormField :label="t('auth.password')" name="password" required>
        <template #hint>
          <ULink to="/forgot-password" class="text-xs font-medium text-primary hover:underline">{{ t('auth.forgotPassword') }}</ULink>
        </template>
        <UInput
          v-model="form.password"
          name="password"
          type="password"
          autocomplete="current-password"
          required
          size="xl"
          class="w-full"
          :aria-invalid="error ? true : undefined"
        />
      </UFormField>
      <UAlert v-if="error" role="alert" color="error" variant="subtle" :title="error" />
      <AuthTurnstile ref="turnstile" v-model="form.turnstileToken" />
      <UButton type="submit" block size="xl" :loading="loading" :label="loading ? t('auth.signingIn') : t('auth.signIn')" />
      <USeparator :label="t('passkey.or')" />
      <UButton block size="xl" variant="outline" color="neutral" icon="i-lucide-key-round" :disabled="loading" :label="t('passkey.signIn')" @click="onPasskey" />
      <details class="text-center">
        <summary class="cursor-pointer list-none text-xs font-medium text-muted underline underline-offset-2 hover:text-default [&::-webkit-details-marker]:hidden">
          {{ t('passkey.cantUse') }}
        </summary>
        <p class="mt-2 rounded-xl bg-elevated px-4 py-3 text-left text-xs leading-5 text-muted">{{ t('passkey.lostAllHint') }}</p>
      </details>
    </form>
  </AuthShell>
</template>
