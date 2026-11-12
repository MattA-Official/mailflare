<script setup lang="ts">
// Ported from legacy/src/app/(admin)/backups/page.tsx.
import { BACKUP_TABLE_GROUPS } from '#lib/backups/table-groups'
import type { BackupItem, BackupSettings } from '~/types/admin/system/misc'
import { WEEKDAYS, backupStatusColor, downloadBackup, fetchBackups, formatBackupDate, formatBackupSize, removeBackup, restoreBackup, saveBackupSettings, startBackup } from '~/utils/admin/system/backups'

definePageMeta({ layout: 'dashboard', nav: 'admin', auth: { role: 'admin', primary: true, requireMailbox: true } })

const { t } = useLanguage()
useHead({ title: () => t('backups.title') })

const { data, status, error: loadError, refresh } = useAsyncData('admin-backups', fetchBackups)

const settings = ref<BackupSettings | null>(null)
let savedSettings: BackupSettings | null = null
watch(() => data.value?.settings, (value) => {
  if (value && !settings.value) {
    savedSettings = value
    settings.value = { ...value }
  }
}, { immediate: true })

// Poll while a backup is queued or running, as upstream's refetchInterval did.
const busy = computed(() => data.value?.backups.some(backup => backup.status === 'queued' || backup.status === 'running') ?? false)
let poll: ReturnType<typeof setInterval> | undefined
watch(busy, (value) => {
  clearInterval(poll)
  if (value) poll = setInterval(() => void refresh(), 5000)
}, { immediate: true })
onBeforeUnmount(() => clearInterval(poll))

const error = ref<string | null>(null)
const pending = reactive({ settings: false, autoSave: false, run: false, delete: false, download: false, restore: false })
const settingsOpen = ref(false)
const settingsError = ref<string | null>(null)
const restoreInput = ref<HTMLInputElement | null>(null)
const restoreFile = ref<File | null>(null)

const configuration = computed(() => data.value?.configuration)
const backupConfigured = computed(() => configuration.value?.configured === true)
const frequencyItems = computed(() => [
  { label: t('backups.daily'), value: 'daily' },
  { label: t('backups.weekly'), value: 'weekly' },
  { label: t('backups.monthly'), value: 'monthly' },
])
const weekdayItems = computed(() => WEEKDAYS.map(day => ({ label: t(day.labelKey), value: day.value as number })))

async function run<T>(key: keyof typeof pending, action: () => Promise<T>, fallback: string): Promise<T | undefined> {
  pending[key] = true
  error.value = null
  try {
    return await action()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : fallback
  } finally {
    pending[key] = false
  }
}

/** Saves immediately and rolls back to the last saved settings on failure. */
async function autoSave(next: BackupSettings) {
  settings.value = next
  pending.autoSave = true
  error.value = null
  try {
    await saveBackupSettings(next)
    savedSettings = next
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('backups.operationFailed')
    if (savedSettings) settings.value = { ...savedSettings }
  } finally {
    pending.autoSave = false
  }
}

function setFrequency(scheduleType: BackupSettings['scheduleType']) {
  if (!settings.value) return
  void autoSave({ ...settings.value, scheduleType, scheduleValue: scheduleType === 'daily' ? null : 1 })
}

function commitNumber(field: 'scheduleValue' | 'retentionDays', min: number, max: number, fallback: number) {
  if (!settings.value) return
  const value = settings.value[field]
  if (typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max) void autoSave(settings.value)
  else settings.value = { ...settings.value, [field]: savedSettings?.[field] ?? fallback }
}

async function saveTables() {
  if (!settings.value) return
  pending.settings = true
  settingsError.value = null
  try {
    await saveBackupSettings(settings.value)
    savedSettings = settings.value
    settingsOpen.value = false
    await refresh()
  } catch (cause) {
    settingsError.value = cause instanceof Error ? cause.message : t('backups.saveSettingsFailed')
  } finally {
    pending.settings = false
  }
}

function toggleGroup(id: BackupSettings['excludedTableGroups'][number], checked: boolean) {
  if (!settings.value) return
  const excluded = settings.value.excludedTableGroups
  settings.value = { ...settings.value, excludedTableGroups: checked ? excluded.filter(item => item !== id) : [...excluded, id] }
}

function pickRestore(event: Event) {
  const input = event.target as HTMLInputElement
  restoreFile.value = input.files?.[0] ?? null
  input.value = ''
}

async function confirmRestore() {
  const file = restoreFile.value
  restoreFile.value = null
  if (!file) return
  const done = await run('restore', () => restoreBackup(file).then(() => true), t('backups.operationFailed'))
  if (done) window.location.assign('/login')
}

const menu = computed(() => [[
  { label: pending.restore ? t('backups.restoring') : t('backups.restore'), icon: 'i-lucide-upload', disabled: pending.restore, onSelect: () => restoreInput.value?.click() },
  { label: t('backups.settings'), icon: 'i-lucide-settings', disabled: !settings.value || pending.autoSave, onSelect: () => { settingsOpen.value = true } },
]])

async function runBackup() {
  await run('run', startBackup, t('backups.operationFailed'))
  await refresh()
}

async function deleteBackup(backup: BackupItem) {
  await run('delete', () => removeBackup(backup.id), t('backups.operationFailed'))
  await refresh()
}
</script>

<template>
  <AdminSystemPage id="backups" :title="t('backups.title')" :description="t('backups.description')">
    <template #actions>
      <input ref="restoreInput" type="file" accept="application/json,.json" class="hidden" @change="pickRestore">
      <UButton icon="i-lucide-play" :loading="pending.run" :disabled="!backupConfigured" :label="pending.run ? t('backups.starting') : t('backups.backUp')" @click="runBackup" />
      <UDropdownMenu :items="menu" :content="{ align: 'end' }">
        <UButton color="neutral" variant="outline" icon="i-lucide-ellipsis-vertical" :aria-label="t('backups.actions')" />
      </UDropdownMenu>
    </template>

    <UAlert v-if="error || loadError" color="error" variant="subtle" :description="error ?? loadError?.message ?? t('backups.operationFailed')" />

    <UAlert
      v-if="configuration && !configuration.configured"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="t('backups.setupTitle')"
      :description="t('backups.setupDescription')"
    >
      <template #actions>
        <UBadge v-for="item in configuration.missing" :key="item" color="warning" variant="outline" :label="item" />
        <UButton size="sm" color="warning" variant="outline" icon="i-lucide-refresh-cw" :loading="status === 'pending'" :label="t('backups.checkAgain')" @click="refresh()" />
      </template>
    </UAlert>

    <UCard>
      <template #header>
        <h2 class="font-semibold text-highlighted">
          {{ t('backups.automatic') }}
        </h2>
        <p class="mt-1 text-sm text-muted">
          {{ t('backups.scheduleNote') }}
        </p>
      </template>
      <div v-if="settings" class="space-y-5">
        <div class="flex items-center justify-between gap-4">
          <label for="automatic-backup-switch" class="text-sm font-medium">{{ t('backups.enableAutomatic') }}</label>
          <USwitch id="automatic-backup-switch" :model-value="settings.enabled" :disabled="pending.autoSave" @update:model-value="enabled => settings && autoSave({ ...settings, enabled })" />
        </div>
        <template v-if="settings.enabled">
          <div class="grid gap-4">
            <div class="flex items-center justify-between gap-4">
              <span class="flex-1 text-sm font-medium">{{ t('backups.frequency') }}</span>
              <USelect :model-value="settings.scheduleType" :items="frequencyItems" :disabled="pending.autoSave" :aria-label="t('backups.frequency')" class="w-1/2 max-w-52 shrink-0" @update:model-value="value => setFrequency(value as BackupSettings['scheduleType'])" />
            </div>
            <div v-if="settings.scheduleType === 'weekly'" class="flex items-center justify-between gap-4">
              <span class="text-sm font-medium">{{ t('backups.dayOfWeek') }}</span>
              <USelect :model-value="settings.scheduleValue ?? 1" :items="weekdayItems" :disabled="pending.autoSave" :aria-label="t('backups.dayOfWeek')" class="w-1/2 max-w-52 shrink-0" @update:model-value="value => settings && autoSave({ ...settings, scheduleValue: Number(value) })" />
            </div>
            <div v-if="settings.scheduleType === 'monthly'" class="flex items-center justify-between gap-4">
              <span class="text-sm font-medium">{{ t('backups.dayOfMonth') }}</span>
              <UInputNumber v-model="settings.scheduleValue" :min="1" :max="28" :disabled="pending.autoSave" :aria-label="t('backups.dayOfMonth')" class="w-1/2 max-w-52 shrink-0" @blur="commitNumber('scheduleValue', 1, 28, 1)" />
            </div>
          </div>
          <div class="grid gap-4 border-t border-default pt-5">
            <div class="flex items-center justify-between gap-4">
              <span class="text-sm font-medium">{{ t('backups.deleteOld') }}</span>
              <USwitch :model-value="settings.retentionEnabled" :disabled="pending.autoSave" :aria-label="t('backups.deleteOld')" @update:model-value="retentionEnabled => settings && autoSave({ ...settings, retentionEnabled })" />
            </div>
            <div class="flex items-center justify-between gap-4">
              <span class="text-sm font-medium">{{ t('backups.deleteOlderThan') }}</span>
              <UInputNumber
                v-model="settings.retentionDays"
                :min="1"
                :max="3650"
                :disabled="!settings.retentionEnabled || pending.autoSave"
                :aria-label="t('backups.deleteOlderThan')"
                :format-options="{ style: 'unit', unit: 'day', unitDisplay: 'long' }"
                class="w-1/2 max-w-52 shrink-0"
                @blur="commitNumber('retentionDays', 1, 3650, 30)"
              />
            </div>
          </div>
        </template>
      </div>
    </UCard>

    <section class="overflow-x-auto rounded-lg border border-default bg-default">
      <div class="flex items-center gap-3 border-b border-default px-4 py-4">
        <UIcon name="i-lucide-database-backup" class="size-5 text-muted" />
        <h2 class="font-semibold text-highlighted">
          {{ t('backups.history') }}
        </h2>
      </div>
      <div class="min-w-[640px]">
        <div class="grid grid-cols-[1fr_110px_110px_170px_90px] gap-4 border-b border-default bg-elevated/50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
          <span>{{ t('backups.col.file') }}</span>
          <span>{{ t('backups.col.status') }}</span>
          <span>{{ t('backups.col.size') }}</span>
          <span>{{ t('backups.col.created') }}</span>
          <span>{{ t('backups.col.actions') }}</span>
        </div>
        <div v-if="status === 'pending' && !data" class="space-y-2 p-4">
          <USkeleton v-for="index in 5" :key="index" class="h-8 w-full" />
        </div>
        <p v-else-if="!data?.backups.length" class="px-4 py-6 text-sm text-muted">
          {{ t('backups.none') }}
        </p>
        <div v-for="backup in data?.backups ?? []" :key="backup.id" class="grid grid-cols-[1fr_110px_110px_170px_90px] items-center gap-4 border-b border-default px-4 py-3 last:border-b-0">
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-highlighted">
              {{ backup.filename ?? backup.id }}
            </p>
            <p class="truncate text-xs text-muted">
              {{ backup.trigger === 'manual' ? t('backups.manual') : t('backups.scheduled') }}{{ backup.error ? `: ${backup.error}` : '' }}
            </p>
          </div>
          <span><UBadge :color="backupStatusColor(backup.status)" variant="subtle" :label="t(`backups.status.${backup.status}`)" /></span>
          <span class="text-sm text-toned">{{ formatBackupSize(backup.size) }}</span>
          <span class="text-sm text-toned">{{ formatBackupDate(backup.createdAt) }}</span>
          <div class="flex gap-1">
            <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-download" :title="t('backups.download')" :aria-label="t('backups.download')" :disabled="backup.status !== 'completed' || pending.download" @click="run('download', () => downloadBackup(backup), t('backups.operationFailed'))" />
            <UButton color="error" variant="ghost" size="sm" icon="i-lucide-trash-2" :title="t('backups.delete')" :aria-label="t('backups.delete')" :disabled="pending.delete || backup.status === 'queued' || backup.status === 'running'" @click="deleteBackup(backup)" />
          </div>
        </div>
      </div>
    </section>

    <UModal v-model:open="settingsOpen" :title="t('backups.tablesTitle')" :description="t('backups.tablesDescription')" scrollable>
      <template #body>
        <div v-if="settings" class="space-y-5">
          <div class="divide-y divide-default">
            <div v-for="group in BACKUP_TABLE_GROUPS" :key="group.id" class="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
              <div class="min-w-0">
                <p class="text-sm font-medium text-highlighted">
                  {{ group.label }}
                </p>
                <p class="mt-1 break-words text-xs text-muted">
                  {{ t('backups.tables', { list: group.tables.join(', ') }) }}
                </p>
              </div>
              <USwitch
                :model-value="!settings.excludedTableGroups.includes(group.id)"
                :disabled="!settings.excludedTableGroups.includes(group.id) && settings.excludedTableGroups.length === BACKUP_TABLE_GROUPS.length - 1"
                :aria-label="t('backups.backUpGroup', { group: group.label })"
                @update:model-value="value => toggleGroup(group.id, value)"
              />
            </div>
          </div>
          <p v-if="settingsError" role="alert" class="text-sm text-error">
            {{ settingsError }}
          </p>
          <UButton icon="i-lucide-save" :loading="pending.settings" :label="pending.settings ? t('common.saving') : t('backups.saveSettings')" @click="saveTables" />
        </div>
      </template>
    </UModal>

    <UModal :open="!!restoreFile" :title="t('backups.restore')" :description="t('backups.restoreConfirm')" @update:open="open => !open && (restoreFile = null)">
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" :label="t('common.cancel')" @click="restoreFile = null" />
          <UButton color="error" :label="t('backups.restore')" @click="confirmRestore" />
        </div>
      </template>
    </UModal>
  </AdminSystemPage>
</template>
