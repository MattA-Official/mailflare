<script setup lang="ts">
// Ported from legacy/src/app/(auth)/reset-password.
import { confirmPasswordReset } from '~/utils/auth/flows'

definePageMeta({ layout: false, auth: { mode: 'guest' } })

const { t } = useLanguage()
const route = useRoute()
const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))
const password = ref('')
const confirm = ref('')
const error = ref<string | null>(null)
const loading = ref(false)
const done = ref(false)

async function onSubmit() {
  if (password.value !== confirm.value) {
    error.value = t('auth.reset.mismatch')
    return
  }
  loading.value = true
  error.value = null
  try {
    const result = await confirmPasswordReset(token.value, password.value)
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
    <form v-if="!done" class="space-y-5" @submit.prevent="onSubmit">
      <UFormField :label="t('auth.reset.newPassword')" name="password" required>
        <UInput v-model="password" name="password" type="password" autocomplete="new-password" minlength="8" required autofocus size="xl" class="w-full" />
      </UFormField>
      <UFormField :label="t('auth.reset.confirm')" name="confirm" required>
        <UInput v-model="confirm" name="confirm" type="password" autocomplete="new-password" minlength="8" required size="xl" class="w-full" />
      </UFormField>
      <UAlert v-if="error" role="alert" color="error" variant="subtle" :title="error" />
      <UButton type="submit" block size="xl" :loading="loading" :label="loading ? t('common.saving') : t('auth.reset.setNew')" />
    </form>
    <template v-if="done" #footer>
      <ULink to="/login" class="text-primary hover:underline">{{ t('auth.reset.goToSignIn') }}</ULink>
    </template>
  </AuthShell>
</template>
