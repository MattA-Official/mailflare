<script setup lang="ts">
// The database half of upstream's AdminUpdateCard (legacy/src/components/admin-update-card.tsx).
// The upstream-merge half dispatched a GitHub workflow in the installation repo; a rewritten fork
// cannot merge upstream that way, so it is not ported.
import type { MigrationStatusResponse } from '~/types/admin/system/misc'
import { applyDatabaseMigrations, getMigrationStatus } from '~/utils/admin/system/settings'

const { t } = useLanguage()
const status = ref<MigrationStatusResponse>()
const checking = ref(true)
const migrating = ref(false)
const error = ref('')

onMounted(async () => {
  try {
    status.value = await getMigrationStatus()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('update.migrationCheckFailed')
  } finally {
    checking.value = false
  }
})

async function migrate() {
  error.value = ''
  migrating.value = true
  try {
    status.value = await applyDatabaseMigrations()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('update.migrateFailed')
  } finally {
    migrating.value = false
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center gap-4">
        <div class="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <UIcon name="i-lucide-database" class="size-5" />
        </div>
        <div>
          <h2 class="text-base font-semibold text-highlighted">
            {{ t('update.title') }}
          </h2>
          <p class="mt-1 text-sm text-muted">
            {{ t('update.description') }}
          </p>
        </div>
      </div>
    </template>

    <div class="space-y-3">
      <div class="divide-y divide-default overflow-hidden rounded-lg border border-default">
        <div v-if="checking" class="flex items-center gap-3 px-4 py-4">
          <USkeleton class="size-4 rounded-full" />
          <USkeleton class="h-4 w-44" />
        </div>
        <div v-else-if="status?.unknown.length" class="flex items-center gap-3 px-4 py-4 text-sm text-error">
          <UIcon name="i-lucide-circle-x" class="size-4 shrink-0" />
          {{ t('update.deployMatching') }}
        </div>
        <div v-else-if="status?.pending.length" class="flex items-center gap-3 px-4 py-4">
          <UIcon name="i-lucide-database" class="size-4 shrink-0 text-warning" :class="{ 'animate-pulse': migrating }" />
          <p class="text-sm text-toned">
            {{ t('update.pendingMigrations', { count: status.pending.length }) }}
          </p>
          <UButton class="ms-auto" variant="link" :loading="migrating" :label="migrating ? t('update.updatingDatabase') : t('update.updateDatabase')" @click="migrate" />
        </div>
        <div v-else-if="status?.ready" class="flex items-center gap-3 px-4 py-4">
          <UIcon name="i-lucide-circle-check" class="size-4 shrink-0 text-success" />
          <p class="text-sm text-toned">
            {{ t('update.databaseUpToDate') }}
          </p>
        </div>
      </div>
      <p v-if="error" role="alert" class="text-sm text-error">
        {{ error }}
      </p>
    </div>
  </UCard>
</template>
