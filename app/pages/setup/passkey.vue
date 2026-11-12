<script setup lang="ts">
// Creates a passkey from a setup, recovery or admin-issued link. The token comes from `?token=`
// or, after first-run registration, from the HttpOnly setup cookie the server reads itself.
// Ported from legacy/src/app/(auth)/setup/passkey.
import { browserSupportsWebAuthn } from '@simplewebauthn/browser'
import { authErrorText } from '#lib/auth/error-messages'
import { isPasskeyCancellation, isPasskeyUnsupported } from '#lib/auth/webauthn/browser-errors'
import { createPasskeyCredential, finishPasskeySetup, loadPasskeySetupContext, startPasskeySetup } from '~/utils/auth/flows'
import type { PasskeySetupContext } from '~/types/auth/flows'

definePageMeta({ layout: false, auth: { mode: 'public' } })

const { t } = useLanguage()
const route = useRoute()
const token = typeof route.query.token === 'string' ? route.query.token : ''
const name = ref('')
const error = ref<string | null>(null)
const linkError = ref<string | null>(null)
const loading = ref(false)
const checking = ref(true)
const email = ref<string | null>(null)
const kind = ref<PasskeySetupContext['kind']>()

onMounted(async () => {
  try {
    const { ok, data } = await loadPasskeySetupContext(token)
    if (!ok) linkError.value = authErrorText(data.code, t, 'authError.setupInvalid')
    else {
      email.value = data.email ?? null
      kind.value = data.kind
    }
  } catch {
    linkError.value = t('authError.setupInvalid')
  } finally {
    checking.value = false
  }
})

async function createPasskey() {
  loading.value = true
  error.value = null
  try {
    if (!browserSupportsWebAuthn()) {
      error.value = t('passkey.browserUnsupported')
      return
    }
    const started = await startPasskeySetup(token)
    if (!started.options || !started.ceremonyToken) {
      linkError.value = authErrorText(started.code, t, 'authError.setupInvalid')
      return
    }
    const response = await createPasskeyCredential(started)
    const result = await finishPasskeySetup({ token, ceremonyToken: started.ceremonyToken, response, name: name.value })
    if (!result.ok) {
      error.value = authErrorText(result.data.code, t, 'authError.passkeyInvalid')
      return
    }
    clearCurrentUserCache()
    await navigateTo(result.data.redirect ?? '/inbox', { replace: true })
  } catch (cause) {
    if (isPasskeyCancellation(cause)) error.value = t('authError.passkeyCancelled')
    else if (isPasskeyUnsupported(cause)) error.value = t('passkey.browserUnsupported')
    else error.value = t('authError.passkeyInvalid')
  } finally {
    loading.value = false
  }
}

// A recovery link replaces the account's old sign-in methods; a first-run link only adds the first passkey.
const isRecovery = computed(() => kind.value === 'recovery' || kind.value === 'admin')
const description = computed(() => {
  if (!email.value) return t('passkey.setupDescription')
  return isRecovery.value ? t('passkey.setupRecoveryDescription') : t('passkey.setupAccountDescription')
})
</script>

<template>
  <AuthShell icon="i-lucide-key-round" :title="email ? t('passkey.setupFor', { email }) : t('passkey.setupTitle')" :description="description">
    <p v-if="checking" class="text-sm text-muted">{{ t('common.loading') }}</p>
    <div v-else-if="linkError" class="space-y-4">
      <UAlert role="alert" color="error" variant="subtle" :title="linkError" />
      <p class="text-sm leading-6 text-muted">{{ t('passkey.setupLinkHelp') }}</p>
    </div>
    <form v-else class="space-y-5" @submit.prevent="createPasskey">
      <UFormField :label="t('passkey.nameOptional')" name="passkey-name" :help="t('passkey.nameHint')">
        <UInput v-model="name" maxlength="100" autocomplete="off" autofocus size="xl" class="w-full" :placeholder="t('passkey.namePlaceholder')" />
      </UFormField>
      <UAlert v-if="error" role="alert" color="error" variant="subtle" :title="error" />
      <UButton type="submit" block size="xl" :loading="loading" :label="loading ? t('passkey.waiting') : t('passkey.create')" />
      <p class="text-xs leading-5 text-muted">{{ t('passkey.createHint') }}</p>
    </form>
  </AuthShell>
</template>
