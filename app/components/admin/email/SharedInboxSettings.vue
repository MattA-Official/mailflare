<script setup lang="ts">
// Fork-only: spam protection and trash retention for a shared inbox. They live on the inbox's
// hidden account, so they apply to everyone who reads it rather than to the person changing them.
import { TRASH_RETENTION_OPTIONS, describeTrashRetention } from '#lib/email/trash-retention-utils'
import { errorMessage } from '~/utils/admin/email/domains'
import { fetchSharedInboxSettings, updateSharedInboxSettings, type SharedInboxSettings } from '~/utils/admin/email/mailboxes'

const props = defineProps<{ mailboxId: string }>()
const { t } = useLanguage()

const settings = ref<SharedInboxSettings | null>(null)
const canManage = ref(false)
const busy = ref(true)
const error = ref<string | null>(null)
// USelect cannot hold null, so "never" has its own value.
const NEVER = 'never'

async function load() {
  busy.value = true
  error.value = null
  try {
    const result = await fetchSharedInboxSettings(props.mailboxId)
    settings.value = result.settings
    canManage.value = result.canManage
  } catch (cause) {
    error.value = errorMessage(cause, t('mailbox.inboxSettingsLoadFailed'))
  } finally {
    busy.value = false
  }
}
watch(() => props.mailboxId, load, { immediate: true })

const retentionItems = computed(() => {
  const days = settings.value?.trashRetentionDays ?? null
  const options: number[] = days && !(TRASH_RETENTION_OPTIONS as readonly number[]).includes(days)
    ? [...TRASH_RETENTION_OPTIONS, days].sort((a, b) => a - b)
    : [...TRASH_RETENTION_OPTIONS]
  return [
    { value: NEVER, label: describeTrashRetention(null, t) },
    ...options.map(value => ({ value: String(value), label: describeTrashRetention(value, t) })),
  ]
})

async function update(patch: Partial<SharedInboxSettings>) {
  if (!settings.value) return
  const previous = settings.value
  settings.value = { ...previous, ...patch }
  busy.value = true
  error.value = null
  try {
    settings.value = (await updateSharedInboxSettings(props.mailboxId, patch)).settings
  } catch (cause) {
    settings.value = previous
    error.value = errorMessage(cause, t('mailbox.inboxSettingsFailed'))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="font-semibold text-highlighted">
        {{ t('mailbox.inboxSettings') }}
      </h2>
      <p class="mt-1 text-sm text-muted">
        {{ t('mailbox.inboxSettingsDescription') }}
      </p>
    </template>
    <div class="space-y-4">
      <SettingsMailSettingRow :title="t('settings.spam.title')" :description="t('settings.spam.description')">
        <USwitch
          :model-value="settings?.spamProtectionEnabled ?? true"
          :disabled="busy || !canManage || !settings"
          :aria-label="t('settings.spam.enable')"
          @update:model-value="update({ spamProtectionEnabled: $event })"
        />
      </SettingsMailSettingRow>
      <SettingsMailSettingRow :title="t('settings.trash.title')" :description="t('mailbox.inboxTrashDescription')">
        <USelect
          :model-value="settings?.trashRetentionDays ? String(settings.trashRetentionDays) : NEVER"
          :items="retentionItems"
          :disabled="busy || !canManage || !settings"
          :aria-label="t('settings.trash.title')"
          class="w-36"
          @update:model-value="update({ trashRetentionDays: String($event) === NEVER ? null : Number($event) })"
        />
      </SettingsMailSettingRow>
      <p v-if="error" class="text-sm text-error">
        {{ error }}
      </p>
    </div>
  </UCard>
</template>
