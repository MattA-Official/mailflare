<script setup lang="ts">
// Fork-only. The roles this account holds in apps that sign in through Mailflare (OIDC provider).
import type { AccountApp } from '~/utils/admin/system/apps'
import { fetchAccountApps, saveAccountAppRoles } from '~/utils/admin/system/apps'

definePageMeta({ auth: { role: 'admin', primary: true, requireMailbox: true } })

const { t } = useLanguage()
const toast = useToast()
const route = useRoute()
const id = computed(() => String(route.params.id))
const { data, error, refresh } = useAsyncData(() => `account-apps-${id.value}`, () => fetchAccountApps(id.value))

const drafts = ref<Record<string, string[]>>({})
watch(() => data.value?.apps, (apps) => {
  drafts.value = Object.fromEntries((apps ?? []).map(app => [app.id, [...app.heldRoles]]))
}, { immediate: true })

const saving = ref<string | null>(null)
const messages = ref<Record<string, string>>({})

function toggle(app: AccountApp, key: string, on: boolean) {
  const current = new Set(drafts.value[app.id] ?? [])
  if (on) current.add(key)
  else current.delete(key)
  drafts.value[app.id] = app.roles.map(role => role.key).filter(roleKey => current.has(roleKey))
}

function changed(app: AccountApp) {
  return (drafts.value[app.id] ?? []).join(' ') !== app.heldRoles.join(' ')
}

async function save(app: AccountApp) {
  saving.value = app.id
  messages.value[app.id] = ''
  try {
    await saveAccountAppRoles(id.value, app.id, drafts.value[app.id] ?? [])
    await refresh()
    toast.add({ title: t('oidc.account.saved'), color: 'success' })
  } catch (cause) {
    messages.value[app.id] = cause instanceof Error ? cause.message : t('oidc.account.saveFailed')
  } finally {
    saving.value = null
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-xl font-medium text-highlighted">
        {{ t('oidc.account.title') }}
      </h2>
      <p class="mt-1 text-sm text-muted">
        {{ t('oidc.account.description') }}
      </p>
    </div>

    <UAlert v-if="error" role="alert" color="error" variant="subtle" :title="error.message || t('oidc.apps.loadFailed')" />

    <UAlert v-if="data && !data.twoFactorReady" color="warning" variant="subtle" icon="i-lucide-shield-alert" :title="t('oidc.account.notReady')" :description="t('oidc.account.notReadyHint')" />

    <div v-if="data && !data.apps.length" class="flex flex-wrap items-center gap-3 rounded-lg border border-default bg-default px-5 py-4">
      <p class="flex-1 text-sm text-muted">
        {{ t('oidc.account.noApps') }}
      </p>
      <UButton color="neutral" variant="outline" size="sm" to="/apps" :label="t('oidc.account.manageApps')" />
    </div>

    <UCard v-for="app in data?.apps ?? []" :key="app.id" :ui="{ body: 'p-0 sm:p-0' }">
      <template #header>
        <div class="flex items-center gap-2">
          <ULink :to="`/apps/${app.id}`" class="text-sm font-semibold text-highlighted hover:underline">
            {{ app.name }}
          </ULink>
          <UBadge v-if="app.disabled" color="warning" variant="subtle" :label="t('oidc.apps.off')" />
          <UBadge v-if="!(drafts[app.id]?.length)" color="neutral" variant="outline" :label="t('oidc.account.noRoles')" />
        </div>
        <p v-if="app.disabled" class="mt-1 text-xs text-muted">
          {{ t('oidc.account.appOff') }}
        </p>
      </template>
      <ul class="divide-y divide-default">
        <li v-for="role in app.roles" :key="role.key" class="flex items-start gap-4 px-5 py-3">
          <UCheckbox
            :model-value="drafts[app.id]?.includes(role.key) ?? false"
            :label="role.label"
            :description="role.description || undefined"
            :disabled="saving === app.id"
            class="flex-1"
            @update:model-value="value => toggle(app, role.key, value === true)"
          />
          <code class="shrink-0 text-xs text-muted">{{ role.key }}</code>
        </li>
      </ul>
      <template #footer>
        <UAlert v-if="messages[app.id]" role="alert" color="error" variant="subtle" :title="messages[app.id]" />
        <div class="flex items-center gap-3">
          <UButton size="sm" :disabled="!changed(app)" :loading="saving === app.id" :label="saving === app.id ? t('common.saving') : t('common.save')" @click="save(app)" />
        </div>
      </template>
    </UCard>
  </div>
</template>
