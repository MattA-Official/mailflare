<script setup lang="ts">
// Fork-only. Shown when a sign-in to an app through Mailflare (OIDC) cannot go ahead: the session
// was not a two-step sign-in, the account has no role in the app, or the link itself is wrong.
import { safeLoginNext } from '~/utils/auth/next'

definePageMeta({ layout: false, auth: { mode: 'public' } })

type Reason = 'two_factor_required' | 'no_access' | 'app_disabled' | 'unknown_app' | 'bad_redirect'
const REASONS: Reason[] = ['two_factor_required', 'no_access', 'app_disabled', 'unknown_app', 'bad_redirect']

const { t } = useLanguage()
const route = useRoute()
const reason = computed<Reason>(() => {
  const value = String(route.query.reason ?? '')
  return (REASONS as string[]).includes(value) ? value as Reason : 'unknown_app'
})
// Only a sign-in link back to Mailflare's own authorization endpoint may be retried.
const retry = computed(() => {
  const value = typeof route.query.retry === 'string' ? route.query.retry : ''
  return safeLoginNext(value)
})
const clientId = computed(() => typeof route.query.client_id === 'string' ? route.query.client_id : '')

const { data: app } = useAsyncData(
  () => `oauth-app-${clientId.value}`,
  () => clientId.value ? $fetch<{ name: string, homepageUrl: string | null }>('/api/oauth/app', { query: { client_id: clientId.value } }).catch(() => null) : Promise.resolve(null),
  { server: false },
)
useHead({ title: () => t('oidc.blocked.title') })

const title = computed(() => app.value?.name ? t('oidc.blocked.titleNamed', { app: app.value.name }) : t('oidc.blocked.title'))
const signInAgain = computed(() => retry.value ? `/login?${new URLSearchParams({ add: '1', next: retry.value })}` : '/login?add=1')
</script>

<template>
  <AuthShell icon="i-lucide-shield-alert" :title="title" :description="t(`oidc.blocked.${reason}`)">
    <div class="space-y-3">
      <template v-if="reason === 'two_factor_required'">
        <UButton block size="xl" icon="i-lucide-key-round" :to="signInAgain" external :label="t('oidc.blocked.signInAgain')" />
        <p class="text-xs leading-5 text-muted">
          {{ t('oidc.blocked.two_factor_setup') }}
        </p>
        <UButton block color="neutral" variant="outline" to="/settings/security" :label="t('oidc.blocked.securitySettings')" />
      </template>
      <UButton v-else-if="reason === 'no_access' && retry" block size="xl" color="neutral" variant="outline" icon="i-lucide-refresh-cw" :to="retry" external :label="t('oidc.blocked.tryAgain')" />
      <UButton v-if="app?.homepageUrl" block color="neutral" variant="ghost" :to="app.homepageUrl" external :label="t('oidc.blocked.backToApp')" />
      <UButton block color="neutral" variant="link" to="/inbox" :label="t('oidc.blocked.toInbox')" />
    </div>
  </AuthShell>
</template>
