<script setup lang="ts">
// Fork-only. Apps that sign people in through Mailflare (OIDC provider, server/lib/oidc).
import type { AppFormDraft } from '~/components/admin/system/AppForm.vue'
import { createOidcApp, draftToInput, emptyAppDraft, fetchOidcApps } from '~/utils/admin/system/apps'

definePageMeta({ layout: 'dashboard', nav: 'admin', auth: { role: 'admin', primary: true, requireMailbox: true } })

const { t } = useLanguage()
useHead({ title: () => t('oidc.apps.title') })

const { data: apps, status, error, refresh } = useAsyncData('oidc-apps', fetchOidcApps)

const createOpen = ref(false)
const draft = ref<AppFormDraft>(emptyAppDraft())
const creating = ref(false)
const createError = ref<string | null>(null)
const created = ref<{ id: string, clientId: string, clientSecret: string | null } | null>(null)
const copied = ref<string | null>(null)

watch(createOpen, (open) => {
  if (open) return
  draft.value = emptyAppDraft()
  createError.value = null
  if (created.value) void navigateTo(`/apps/${created.value.id}`)
  created.value = null
})

async function create() {
  creating.value = true
  createError.value = null
  try {
    const result = await createOidcApp(draftToInput(draft.value))
    created.value = { id: result.app.id, clientId: result.app.clientId, clientSecret: result.clientSecret }
    await refresh()
  } catch (cause) {
    createError.value = cause instanceof Error ? cause.message : t('oidc.apps.saveFailed')
  } finally {
    creating.value = false
  }
}

async function copy(value: string) {
  await navigator.clipboard.writeText(value)
  copied.value = value
}
</script>

<template>
  <AdminSystemPage id="apps" :title="t('oidc.apps.title')" :description="t('oidc.apps.description')">
    <template #actions>
      <UButton icon="i-lucide-plus" :label="t('oidc.apps.new')" @click="createOpen = true" />
    </template>

    <UAlert v-if="error" role="alert" color="error" variant="subtle" :title="t('oidc.apps.loadFailed')" />
    <div v-else-if="status === 'pending' && !apps" class="space-y-2">
      <USkeleton v-for="index in 2" :key="index" class="h-20 w-full rounded-lg" />
    </div>
    <p v-else-if="!apps?.length" class="rounded-lg border border-default bg-default px-5 py-4 text-sm text-muted">
      {{ t('oidc.apps.none') }}
    </p>
    <ul v-else class="divide-y divide-default overflow-hidden rounded-lg border border-default bg-default">
      <li v-for="app in apps" :key="app.id">
        <NuxtLink :to="`/apps/${app.id}`" class="flex items-center gap-4 px-5 py-4 hover:bg-elevated/50">
          <UAvatar icon="i-lucide-app-window" color="primary" size="xl" />
          <span class="min-w-0 flex-1 space-y-1">
            <span class="flex min-w-0 flex-wrap items-center gap-2">
              <strong class="truncate text-sm font-semibold text-highlighted">{{ app.name }}</strong>
              <UBadge v-if="app.disabled" color="warning" variant="subtle" :label="t('oidc.apps.off')" />
              <UBadge v-if="!app.confidential" color="neutral" variant="outline" :label="t('oidc.apps.public')" />
            </span>
            <span class="block truncate font-mono text-xs text-muted">{{ app.clientId }}</span>
            <span class="flex flex-wrap gap-1">
              <UBadge v-for="role in app.roles" :key="role.key" color="neutral" variant="outline" :label="role.label" />
            </span>
          </span>
          <span class="shrink-0 text-sm text-muted">{{ t('oidc.apps.members', { count: app.memberCount ?? 0 }) }}</span>
          <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-muted" />
        </NuxtLink>
      </li>
    </ul>

    <UModal v-model:open="createOpen" :dismissible="!creating" :title="created ? t('oidc.apps.createdTitle') : t('oidc.apps.createTitle')" :description="created ? (created.clientSecret ? t('oidc.apps.copySecret') : '') : t('oidc.apps.createDescription')" scrollable>
      <template #body>
        <form v-if="!created" class="space-y-5" @submit.prevent="create">
          <AdminSystemAppForm v-model="draft" mode="create" />
          <UAlert v-if="createError" role="alert" color="error" variant="subtle" :title="createError" />
          <UButton type="submit" :loading="creating" :disabled="!draft.name.trim() || !draft.redirectUris.trim()" :label="creating ? t('oidc.apps.creating') : t('oidc.apps.create')" />
        </form>
        <div v-else class="space-y-4">
          <UFormField :label="t('oidc.apps.clientId')">
            <div class="flex gap-2">
              <code class="block min-w-0 flex-1 break-all rounded bg-elevated p-2 text-xs">{{ created.clientId }}</code>
              <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-copy" :label="copied === created.clientId ? t('common.copied') : t('oidc.apps.copy')" @click="copy(created.clientId)" />
            </div>
          </UFormField>
          <UFormField v-if="created.clientSecret" :label="t('oidc.apps.clientSecret')">
            <div class="flex gap-2">
              <code class="block min-w-0 flex-1 break-all rounded border border-primary/30 bg-primary/5 p-2 text-xs">{{ created.clientSecret }}</code>
              <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-copy" :label="copied === created.clientSecret ? t('common.copied') : t('oidc.apps.copy')" @click="copy(created.clientSecret)" />
            </div>
          </UFormField>
          <UButton color="neutral" variant="outline" :label="t('common.done')" @click="createOpen = false" />
        </div>
      </template>
    </UModal>
  </AdminSystemPage>
</template>
