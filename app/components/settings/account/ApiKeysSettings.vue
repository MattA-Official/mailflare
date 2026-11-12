<script setup lang="ts">
// Personal API keys, including MCP keys for agents. Ported from legacy/src/components/settings/api-keys-settings.tsx.
import type { ApiKeyScope } from '#lib/api/scopes'
import { formatUserDate } from '#lib/time/utils'
import type { ManagedApiKey, McpKeyScope } from '~/types/settings/account'
import { createManagedApiKey, keyPermissions, loadManagedApiKeys, MCP_KEY_SCOPES, revokeManagedApiKey, scopesNeedMailbox, STANDARD_KEY_SCOPES } from '~/utils/settings/account/api-keys'

const { t } = useLanguage()
const { mailboxes, selectedMailbox } = useSelectedMailbox()

const keys = ref<ManagedApiKey[]>([])
const loading = ref(true)
const busy = ref(false)
const createOpen = ref(false)
const revokingId = ref<string | null>(null)
const confirmRevoke = ref<ManagedApiKey | null>(null)
const error = ref<string | null>(null)
const name = ref('')
const mcpAllowed = ref(false)
const createdMcpAllowed = ref(false)
const standardScopes = ref<ApiKeyScope[]>(['read'])
const mcpScopes = ref<McpKeyScope[]>(['mcp:read'])
const mailboxIds = ref<string[]>([])
const newKey = ref<string | null>(null)
const copied = ref(false)

let cancelled = false
async function refresh() {
  try {
    const items = await loadManagedApiKeys()
    if (cancelled) return
    keys.value = items
    error.value = null
  } catch (cause) {
    if (!cancelled) error.value = cause instanceof Error ? cause.message : t('apiKeys.loadFailed')
  } finally {
    if (!cancelled) loading.value = false
  }
}
onMounted(() => {
  void refresh()
  window.addEventListener('mailflare:api-keys-changed', refresh)
})
onBeforeUnmount(() => {
  cancelled = true
  window.removeEventListener('mailflare:api-keys-changed', refresh)
})

const dialogOpen = computed({
  get: () => createOpen.value,
  set(open) {
    if (busy.value) return
    createOpen.value = open
    error.value = null
    if (open && mailboxIds.value.length === 0) {
      mailboxIds.value = [selectedMailbox.value?.id ?? mailboxes.value[0]?.id].filter((id): id is string => !!id)
    }
    if (!open) {
      newKey.value = null
      copied.value = false
    }
  },
})

const scopeOptions = computed(() => mcpAllowed.value ? MCP_KEY_SCOPES : STANDARD_KEY_SCOPES)
const activeScopes = computed<string[]>(() => mcpAllowed.value ? mcpScopes.value : standardScopes.value)
const canCreate = computed(() => !busy.value
  && !!name.value.trim()
  && activeScopes.value.length > 0
  && (mailboxIds.value.length > 0 || !scopesNeedMailbox(mcpAllowed.value, activeScopes.value)))

function toggle<T extends string>(list: T[], value: T, on: boolean): T[] {
  return on ? [...list.filter(item => item !== value), value] : list.filter(item => item !== value)
}

function toggleScope(value: string, on: boolean) {
  if (mcpAllowed.value) mcpScopes.value = toggle(mcpScopes.value, value as McpKeyScope, on)
  else standardScopes.value = toggle(standardScopes.value, value as ApiKeyScope, on)
}

async function create() {
  busy.value = true
  error.value = null
  try {
    const secret = await createManagedApiKey({ name: name.value.trim(), mcpAllowed: mcpAllowed.value, scopes: mcpAllowed.value ? mcpScopes.value : standardScopes.value, mailboxIds: mailboxIds.value })
    newKey.value = secret
    createdMcpAllowed.value = mcpAllowed.value
    copied.value = false
    name.value = ''
    keys.value = await loadManagedApiKeys()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('apiKeys.createFailed')
  } finally {
    busy.value = false
  }
}

async function revoke(key: ManagedApiKey) {
  confirmRevoke.value = null
  revokingId.value = key.id
  error.value = null
  try {
    await revokeManagedApiKey(key.id)
    keys.value = keys.value.filter(item => item.id !== key.id)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('apiKeys.revokeFailed')
  } finally {
    revokingId.value = null
  }
}

async function copyKey() {
  if (!newKey.value) return
  await navigator.clipboard.writeText(newKey.value)
  copied.value = true
}

function mailboxList(key: ManagedApiKey) {
  if (!key.mailboxScopeEnabled && key.kind !== 'mcp') return t('apiKeys.allAccessible')
  return key.mailboxIds.map((id) => {
    const mailbox = mailboxes.value.find(item => item.id === id)
    return mailbox ? `${mailbox.localPart}@${mailbox.hostname}` : id
  }).join(', ') || t('common.none')
}

const revokeOpen = computed({ get: () => confirmRevoke.value !== null, set: (v) => { if (!v) confirmRevoke.value = null } })
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between gap-4">
      <p class="text-sm text-muted">
        {{ t('apiKeys.description') }}
      </p>
      <UButton icon="i-lucide-plus" :label="t('apiKeys.new')" class="shrink-0" @click="dialogOpen = true" />
    </div>
    <p v-if="error && !createOpen" role="alert" class="text-sm text-error">
      {{ error }}
    </p>

    <section class="space-y-3">
      <USkeleton v-if="loading" class="h-20 w-full rounded-lg" />
      <UCard v-else-if="keys.length === 0">
        <p class="text-sm text-muted">
          {{ t('apiKeys.none') }}
        </p>
      </UCard>
      <UCard v-else :ui="{ body: 'p-0 sm:p-0' }">
        <ul class="divide-y divide-default">
          <li v-for="key in keys" :key="key.id" class="flex items-start gap-4 px-5 py-4">
            <span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <UIcon name="i-lucide-key-round" class="size-5" />
            </span>
            <span class="min-w-0 flex-1 space-y-2">
              <span class="flex min-w-0 flex-wrap items-center gap-2">
                <strong class="truncate text-sm font-semibold text-highlighted">{{ key.name }}</strong>
                <UBadge v-if="key.kind === 'mcp'" color="neutral" variant="outline" label="MCP" />
              </span>
              <span class="block truncate text-sm text-muted">
                {{ key.prefix }}… · {{ t('apiKeys.createdOn', { date: formatUserDate(key.createdAt, { dateStyle: 'short' }) }) }} ·
                {{ key.lastUsedAt ? t('apiKeys.lastUsed', { date: formatUserDate(key.lastUsedAt, { dateStyle: 'short' }) }) : t('apiKeys.neverUsed') }}
              </span>
              <span class="flex flex-wrap gap-1">
                <UBadge v-for="scope in keyPermissions(key)" :key="scope" color="neutral" variant="outline" :label="scope" />
              </span>
              <span class="block text-xs text-muted">{{ t('apiKeys.mailboxesLabel', { list: mailboxList(key) }) }}</span>
            </span>
            <UButton
              color="neutral"
              variant="outline"
              size="sm"
              icon="i-lucide-trash-2"
              :disabled="revokingId === key.id"
              :label="revokingId === key.id ? t('common.revoking') : t('common.revoke')"
              @click="confirmRevoke = key"
            />
          </li>
        </ul>
      </UCard>
    </section>

    <UModal
      v-model:open="dialogOpen"
      :title="newKey ? t('apiKeys.createdTitle') : t('apiKeys.createTitle')"
      :description="newKey ? t('apiKeys.copyNow') : t('apiKeys.nameAndAccess')"
      :ui="{ content: 'max-h-[calc(100dvh-4rem)]' }"
    >
      <template #body>
        <form v-if="!newKey" class="space-y-4" @submit.prevent="create">
          <UFormField :label="t('apiKeys.keyName')" name="managed-key-name">
            <UInput id="managed-key-name" v-model="name" :maxlength="100" :placeholder="t('apiKeys.namePlaceholder')" class="w-full" />
          </UFormField>
          <UCheckbox v-model="mcpAllowed" :label="t('apiKeys.allowMcp')" :description="t('apiKeys.allowMcpHint')" :ui="{ label: 'font-semibold' }" />
          <UCheckbox
            :model-value="!mcpAllowed && standardScopes.includes('jmap')"
            :disabled="mcpAllowed"
            :label="t('apiKeys.allowJmap')"
            :description="mcpAllowed ? t('apiKeys.jmapNeedsStandard') : t('apiKeys.jmapHint')"
            :ui="{ label: 'font-semibold' }"
            @update:model-value="(on) => standardScopes = toggle(standardScopes, 'jmap', !!on)"
          />
          <fieldset class="space-y-3">
            <legend class="mb-2 text-sm font-medium">
              {{ t('apiKeys.permissions') }}
            </legend>
            <UCheckbox
              v-for="scope in scopeOptions"
              :key="scope.value"
              :model-value="activeScopes.includes(scope.value)"
              :label="t(scope.labelKey)"
              :description="t(scope.descriptionKey)"
              :ui="{ label: 'font-semibold' }"
              @update:model-value="(on) => toggleScope(scope.value, !!on)"
            />
          </fieldset>
          <fieldset class="space-y-2">
            <legend class="mb-2 text-sm font-medium">
              {{ t('apiKeys.allowedMailboxes') }}
            </legend>
            <p v-if="mailboxes.length === 0" class="text-sm text-muted">
              {{ t('apiKeys.noMailboxes') }}
            </p>
            <UCheckbox
              v-for="mailbox in mailboxes"
              :key="mailbox.id"
              :model-value="mailboxIds.includes(mailbox.id)"
              :label="`${mailbox.localPart}@${mailbox.hostname}`"
              @update:model-value="(on) => mailboxIds = toggle(mailboxIds, mailbox.id, !!on)"
            />
            <p class="text-xs text-muted">
              {{ t('apiKeys.aliasHint') }}
            </p>
          </fieldset>
          <UButton type="submit" icon="i-lucide-key-round" :disabled="!canCreate" :label="busy ? t('apiKeys.creating') : t('apiKeys.createTitle')" />
          <p v-if="error" role="alert" class="text-sm text-error">
            {{ error }}
          </p>
        </form>
        <div v-else class="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <code class="block break-all rounded bg-default p-2 text-xs">{{ newKey }}</code>
          <SettingsAccountMcpAgentInstructions v-if="createdMcpAllowed" mode="mail" :api-key="newKey" />
          <div class="flex gap-2">
            <UButton color="neutral" variant="outline" size="sm" icon="i-lucide-copy" :label="copied ? t('common.copied') : t('apiKeys.copyKey')" @click="copyKey" />
            <UButton color="neutral" variant="ghost" size="sm" :disabled="busy" :label="t('common.done')" @click="dialogOpen = false" />
          </div>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="revokeOpen" :title="t('common.revoke')" :description="confirmRevoke ? t('apiKeys.revokeConfirm', { name: confirmRevoke.name }) : undefined">
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" :label="t('common.cancel')" @click="confirmRevoke = null" />
          <UButton color="error" :label="t('common.revoke')" @click="confirmRevoke && revoke(confirmRevoke)" />
        </div>
      </template>
    </UModal>
  </div>
</template>
