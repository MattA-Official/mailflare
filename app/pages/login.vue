<script setup lang="ts">
// Password sign-in. The auth workstream adds MFA, passkeys, Turnstile and the account switcher
// (see legacy/src/app/(auth)/login/login-client.tsx).
definePageMeta({ layout: 'auth', auth: { mode: 'guest' } })

const { t } = useLanguage()
useHead({ title: () => t('auth.signIn') })

const state = reactive({ email: '', password: '' })
const pending = ref(false)
const error = ref('')

async function submit() {
  pending.value = true
  error.value = ''
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
      signal: AbortSignal.timeout(15000),
    })
    const data = await persistAuthSession(response)
    if (!response.ok || !data.token) {
      error.value = data.error ?? t('auth.loginFailed')
      return
    }
    await navigateTo(data.redirect ?? '/inbox', { replace: true })
  } catch (cause) {
    error.value = cause instanceof DOMException && cause.name === 'TimeoutError' ? t('auth.loginTimeout') : t('auth.loginUnreachable')
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-xl font-semibold text-highlighted">{{ t('auth.signIn') }}</h1>
      <p class="mt-1 text-sm text-muted">{{ t('auth.signInDescription') }}</p>
    </div>
    <UForm :state="state" class="space-y-4" @submit="submit">
      <UAlert v-if="error" color="error" variant="subtle" :title="error" />
      <UFormField :label="t('auth.email')" name="email" required>
        <UInput v-model="state.email" type="email" autocomplete="username" autofocus class="w-full" />
      </UFormField>
      <UFormField :label="t('auth.password')" name="password" required>
        <UInput v-model="state.password" type="password" autocomplete="current-password" class="w-full" />
      </UFormField>
      <UButton type="submit" block :loading="pending" :label="pending ? t('auth.signingIn') : t('auth.signIn')" />
    </UForm>
  </div>
</template>
