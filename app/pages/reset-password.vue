<script setup lang="ts">
// Ported from legacy/src/app/(auth)/reset-password.
import * as z from 'zod'
import { confirmPasswordReset } from '~/utils/auth/flows'

definePageMeta({ layout: false, auth: { mode: 'guest' } })

const { t } = useLanguage()
const route = useRoute()
const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))
const state = reactive({ password: '', confirm: '' })
const schema = computed(() => z.object({
  password: z.string().min(8, t('auth.passwordTooShort')),
  confirm: z.string(),
}).refine(value => value.password === value.confirm, { message: t('auth.reset.mismatch'), path: ['confirm'] }))
const error = ref<string | null>(null)
const loading = ref(false)
const done = ref(false)

async function onSubmit() {
  loading.value = true
  error.value = null
  try {
    const result = await confirmPasswordReset(token.value, state.password)
    if (!result.ok) {
      error.value = result.error ?? t('auth.reset.failed')
      return
    }
    done.value = true
  } catch {
    error.value = t('auth.serverUnreachable')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AuthShell v-if="!token" icon="i-lucide-lock-keyhole" :title="t('auth.reset.linkMissing')" :description="t('auth.reset.linkMissingDescription')">
    <ULink to="/forgot-password" class="text-sm text-primary hover:underline">{{ t('auth.reset.requestNew') }}</ULink>
  </AuthShell>

  <AuthShell
    v-else
    icon="i-lucide-lock-keyhole"
    :title="done ? t('auth.reset.updated') : t('auth.reset.chooseNew')"
    :description="done ? t('auth.reset.doneDescription') : t('auth.reset.description')"
  >
    <UForm v-if="!done" :schema="schema" :state="state" class="space-y-5" @submit="onSubmit">
      <UFormField :label="t('auth.reset.newPassword')" name="password" required>
        <UInput v-model="state.password" type="password" autocomplete="new-password" required autofocus size="xl" />
      </UFormField>
      <UFormField :label="t('auth.reset.confirm')" name="confirm" required>
        <UInput v-model="state.confirm" type="password" autocomplete="new-password" required size="xl" />
      </UFormField>
      <UAlert v-if="error" role="alert" color="error" variant="subtle" :title="error" />
      <UButton type="submit" block size="xl" :loading="loading" :label="loading ? t('common.saving') : t('auth.reset.setNew')" />
    </UForm>
    <template v-if="done" #footer>
      <ULink to="/login" class="text-primary hover:underline">{{ t('auth.reset.goToSignIn') }}</ULink>
    </template>
  </AuthShell>
</template>
