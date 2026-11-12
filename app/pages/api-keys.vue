<script setup lang="ts">
// Admin API keys, ported from legacy/src/app/(admin)/api-keys/page.tsx.
import type { AdminApiKeyScope } from '~/utils/admin/system/settings'
import { ADMIN_KEY_PERMISSIONS, createAdminApiKey, fetchAdminApiKeys, parseApiKeyScopes, revokeAdminApiKey } from '~/utils/admin/system/settings'

definePageMeta({ layout: 'dashboard', nav: 'admin', auth: { role: 'admin', primary: true, requireMailbox: true } })

const { t } = useLanguage()
useHead({ title: () => t('admin.section.apiKeysTitle') })

const { data: apiKeys, status, refresh } = useAsyncData('admin-api-keys', fetchAdminApiKeys)

const createOpen = ref(false)
const name = ref('')
const scopes = ref<AdminApiKeyScope[]>(['domains'])
const mcpAllowed = ref(false)
const createdMcpAllowed = ref(false)
const newKey = ref<string | null>(null)
const copied = ref(false)
const creating = ref(false)
const createError = ref<string | null>(null)
const revokeError = ref<string | null>(null)
const revoking = ref<string | null>(null)
const confirmRevoke = ref<{ id: string, name: string } | null>(null)

watch(createOpen, (open) => {
  if (!open) {
    newKey.value = null
    copied.value = false
    createError.value = null
  }
})

function toggleScope(scope: AdminApiKeyScope, checked: boolean) {
  scopes.value = checked ? [...scopes.value, scope] : scopes.value.filter(item => item !== scope)
}

async function create() {
  creating.value = true
  createError.value = null
  try {
    newKey.value = await createAdminApiKey({ name: name.value.trim(), scopes: scopes.value, mcpAllowed: mcpAllowed.value })
    createdMcpAllowed.value = mcpAllowed.value
    copied.value = false
    name.value = ''
    scopes.value = ['domains']
    await refresh()
  } catch (error) {
    createError.value = error instanceof Error ? error.message : t('apiKeys.createFailed')
  } finally {
    creating.value = false
  }
}

async function copyKey() {
  if (!newKey.value) return
  await navigator.clipboard.writeText(newKey.value)
  copied.value = true
}

async function revoke() {
  const target = confirmRevoke.value
  if (!target) return
  confirmRevoke.value = null
  revoking.value = target.id
  revokeError.value = null
  try {
    await revokeAdminApiKey(target.id)
    await refresh()
  } catch {
    revokeError.value = t('adminKeys.revokeFailed')
  } finally {
    revoking.value = null
  }
}
</script>

<template>
  <AdminSystemPage id="api-keys" :title="t('admin.section.apiKeysTitle')">
    <template #actions>
      <UButton icon="i-lucide-plus" :label="t('apiKeys.new')" @click="createOpen = true" />
    </template>

    <p v-if="revokeError" role="alert" class="text-sm text-error">
      {{ revokeError }}
    </p>
    <div v-if="status === 'pending' && !apiKeys" class="space-y-2">
      <USkeleton v-for="index in 3" :key="index" class="h-20 w-full rounded-lg" />
    </div>
    <p v-else-if="!apiKeys?.length" class="rounded-lg border border-default bg-default px-5 py-4 text-sm text-muted">
      {{ t('apiKeys.none') }}
    </p>
    <ul v-else class="divide-y divide-default overflow-hidden rounded-lg border border-default bg-default">
      <li v-for="key in apiKeys" :key="key.id" class="flex items-center gap-4 px-5 py-4">
        <span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <UIcon name="i-lucide-key-round" class="size-5" />
        </span>
        <span class="min-w-0 flex-1 space-y-2">
          <span class="flex min-w-0 flex-wrap items-center gap-2">
            <strong class="truncate text-sm font-semibold text-highlighted">{{ key.name }}</strong>
            <UBadge v-if="key.kind === 'mcp'" color="neutral" variant="outline" label="MCP" />
          </span>
          <span class="block truncate text-sm text-muted">{{ key.prefix }}...</span>
          <span class="flex flex-wrap gap-1">
            <UBadge v-for="scope in parseApiKeyScopes(key.scopes)" :key="scope" color="neutral" variant="outline" :label="scope" />
          </span>
        </span>
        <UButton color="neutral" variant="outline" size="sm" icon="i-lucide-trash-2" :loading="revoking === key.id" :disabled="!!revoking" :label="t('common.revoke')" @click="confirmRevoke = { id: key.id, name: key.name }" />
      </li>
    </ul>

    <UModal v-model:open="createOpen" :dismissible="!creating" :title="newKey ? t('apiKeys.createdTitle') : t('apiKeys.createTitle')" :description="newKey ? t('apiKeys.copyNow') : t('apiKeys.nameAndAccess')" scrollable>
      <template #body>
        <form v-if="!newKey" class="space-y-4" @submit.prevent="create">
          <UFormField :label="t('apiKeys.keyName')">
            <UInput v-model="name" :maxlength="100" :placeholder="t('adminKeys.namePlaceholder')" class="w-full" />
          </UFormField>
          <UCheckbox v-model="mcpAllowed" :label="t('apiKeys.allowMcp')" :description="t('adminKeys.allowMcpHint')" />
          <fieldset class="space-y-2">
            <legend class="mb-2 text-sm font-medium">
              {{ t('apiKeys.permissions') }}
            </legend>
            <UCheckbox
              v-for="scope in ADMIN_KEY_PERMISSIONS"
              :key="scope.value"
              :model-value="scopes.includes(scope.value)"
              :label="t(scope.labelKey)"
              :description="t(scope.descriptionKey)"
              @update:model-value="value => toggleScope(scope.value, value === true)"
            />
          </fieldset>
          <p v-if="createError" role="alert" class="text-sm text-error">
            {{ createError }}
          </p>
          <UButton type="submit" :loading="creating" :disabled="!name.trim() || scopes.length === 0" :label="creating ? t('accounts.creating') : t('adminKeys.createKey')" />
        </form>
        <div v-else class="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <code class="block break-all rounded bg-default p-2 text-xs">{{ newKey }}</code>
          <AdminSystemMcpInstructions v-if="createdMcpAllowed" mode="admin" :api-key="newKey" />
          <div class="flex gap-2">
            <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-copy" :label="copied ? t('common.copied') : t('apiKeys.copyKey')" @click="copyKey" />
            <UButton size="sm" color="neutral" variant="ghost" :label="t('common.done')" @click="createOpen = false" />
          </div>
        </div>
      </template>
    </UModal>

    <UModal :open="!!confirmRevoke" :title="t('common.revoke')" :description="confirmRevoke ? t('apiKeys.revokeConfirm', { name: confirmRevoke.name }) : ''" @update:open="open => !open && (confirmRevoke = null)">
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" :label="t('common.cancel')" @click="confirmRevoke = null" />
          <UButton color="error" :label="t('common.revoke')" @click="revoke" />
        </div>
      </template>
    </UModal>
  </AdminSystemPage>
</template>
