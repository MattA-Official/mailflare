<script setup lang="ts">
// Ported from legacy/src/app/(auth)/forgot-password.
import { requestPasswordReset } from '~/utils/auth/flows'

definePageMeta({ layout: false, auth: { mode: 'guest' } })

const { t } = useLanguage()
const email = ref('')
const turnstileToken = ref('')
const turnstile = useTemplateRef<{ reset: () => void }>('turnstile')
const error = ref<string | null>(null)
const loading = ref(false)
const sent = ref(false)

async function onSubmit() {
  loading.value = true
  error.value = null
  try {
    const result = await requestPasswordReset(email.value, turnstileToken.value || undefined)
    if (!result.ok) {
      error.value = result.error ?? t('auth.forgot.error')
      turnstile.value?.reset()
      return
    }
    sent.value = true
  } catch {
    error.value = t('auth.serverUnreachable')
    turnstile.value?.reset()
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AuthShell icon="i-lucide-key-round" :title="t('auth.forgot.title')" :description="sent ? t('auth.forgot.sent') : t('auth.forgot.description')">
    <form v-if="!sent" class="space-y-5" @submit.prevent="onSubmit">
      <UFormField :label="t('auth.email')" name="email" required>
        <UInput v-model="email" name="email" type="email" autocomplete="email" required autofocus size="xl" class="w-full" />
      </UFormField>
      <UAlert v-if="error" role="alert" color="error" variant="subtle" :title="error" />
      <AuthTurnstile ref="turnstile" v-model="turnstileToken" />
      <UButton type="submit" block size="xl" :loading="loading" :label="loading ? t('auth.sending') : t('auth.sendReset')" />
    </form>
    <template #footer>
      <ULink to="/login" class="text-muted hover:text-default">{{ t('auth.backToSignIn') }}</ULink>
    </template>
  </AuthShell>
</template>
