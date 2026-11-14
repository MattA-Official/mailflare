<script setup lang="ts">
// Fork-only. Every shared drive on the instance, for admins who manage users. Drives hold themselves, so this
// is where admins see them all, with members and storage, and restore one that was deleted.
import { formatDriveSize } from '#lib/drive/utils'
import { errorMessage } from '~/utils/drive/drive-utils'

definePageMeta({ layout: 'dashboard', nav: 'admin', auth: { role: 'admin', requireMailbox: true } })

type SharedDriveListItem = {
  id: string
  name: string
  createdAt: string
  deleted: boolean
  purgeAt: string | null
  storageLimitBytes: number | null
  storageUsed: number
  peopleCount: number
  groupCount: number
  managerCount: number
}

const { t, locale } = useLanguage()
const toast = useToast()
const formatDate = (value: string) => new Date(value).toLocaleDateString(locale.value, { dateStyle: 'medium' })
useHead({ title: () => t('admin.nav.sharedDrives') })

const { data, status, error, refresh } = useAsyncData('shared-drives', () => api<{ drives: SharedDriveListItem[] }>('/api/shared-drives'))
const active = computed(() => (data.value?.drives ?? []).filter(drive => !drive.deleted))
const deleted = computed(() => (data.value?.drives ?? []).filter(drive => drive.deleted))

const restoring = ref<string | null>(null)
async function restore(id: string) {
  restoring.value = id
  try {
    await api(`/api/shared-drives/${encodeURIComponent(id)}/restore`, { method: 'POST' })
    toast.add({ title: t('sharedDrives.restored'), color: 'success' })
    await refresh()
  } catch (cause) {
    toast.add({ title: errorMessage(cause, t('sharedDrives.restoreFailed')), color: 'error' })
  } finally {
    restoring.value = null
  }
}

const creating = ref(false)
const name = ref('')
const saving = ref(false)
async function create() {
  if (!name.value.trim() || saving.value) return
  saving.value = true
  try {
    const result = await api<{ drive: { id: string } }>('/api/drives', { method: 'POST', body: { name: name.value.trim() } })
    toast.add({ title: t('sharedDrives.created'), color: 'success' })
    creating.value = false
    await navigateTo(`/drive?drive=${encodeURIComponent(result.drive.id)}`)
  } catch (cause) {
    toast.add({ title: errorMessage(cause, t('sharedDrives.failed')), color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <AdminSystemPage id="shared-drives" :title="t('admin.nav.sharedDrives')" :description="t('sharedDrives.adminDescription')">
    <template #actions>
      <UButton icon="i-lucide-plus" :label="t('sharedDrives.new')" @click="name = ''; creating = true" />
    </template>

    <p v-if="error" role="alert" class="text-sm text-error">
      {{ t('sharedDrives.loadFailed') }}
    </p>
    <div v-else-if="status === 'pending' && !data" class="space-y-2">
      <USkeleton v-for="index in 2" :key="index" class="h-16 w-full rounded-lg" />
    </div>
    <template v-else>
      <p v-if="!active.length" class="rounded-lg border border-default bg-default px-5 py-4 text-sm text-muted">
        {{ t('sharedDrives.noneAdmin') }}
      </p>
      <ul v-else class="divide-y divide-default overflow-hidden rounded-lg border border-default bg-default">
        <li v-for="drive in active" :key="drive.id">
          <NuxtLink :to="`/drive?drive=${encodeURIComponent(drive.id)}`" class="flex items-center gap-4 px-5 py-4 hover:bg-elevated/50">
            <span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <UIcon name="i-lucide-hard-drive" class="size-5" />
            </span>
            <span class="min-w-0 flex-1 space-y-0.5">
              <strong class="block truncate text-sm font-semibold text-highlighted">{{ drive.name }}</strong>
              <span class="block truncate text-xs text-muted">
                {{ drive.storageLimitBytes ? t('sharedDrives.usage', { used: formatDriveSize(drive.storageUsed), total: formatDriveSize(drive.storageLimitBytes) }) : t('sharedDrives.storageUsed', { size: formatDriveSize(drive.storageUsed) }) }}
                <template v-if="!drive.managerCount"> · <span class="text-warning">{{ t('sharedDrives.noManager') }}</span></template>
              </span>
            </span>
            <span class="hidden shrink-0 text-sm text-muted sm:block">{{ t('sharedDrives.groupCount', { count: drive.groupCount }) }}</span>
            <span class="shrink-0 text-sm text-muted">{{ t('sharedDrives.peopleCount', { count: drive.peopleCount }) }}</span>
            <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-muted" />
          </NuxtLink>
        </li>
      </ul>

      <section v-if="deleted.length" class="space-y-3">
        <h2 class="text-sm font-semibold text-highlighted">
          {{ t('sharedDrives.deletedTitle') }}
        </h2>
        <ul class="divide-y divide-default overflow-hidden rounded-lg border border-default bg-default">
          <li v-for="drive in deleted" :key="drive.id" class="flex items-center gap-4 px-5 py-4">
            <span class="min-w-0 flex-1 space-y-0.5">
              <strong class="block truncate text-sm font-semibold text-highlighted">{{ drive.name }}</strong>
              <span v-if="drive.purgeAt" class="block truncate text-xs text-muted">{{ t('sharedDrives.removedOn', { date: formatDate(drive.purgeAt) }) }}</span>
            </span>
            <UButton color="neutral" variant="outline" :loading="restoring === drive.id" :disabled="!!restoring" :label="t('sharedDrives.restore')" @click="restore(drive.id)" />
          </li>
        </ul>
      </section>
    </template>

    <UModal v-model:open="creating" :title="t('sharedDrives.new')" :dismissible="!saving">
      <template #body>
        <form class="space-y-5" @submit.prevent="create">
          <UInput v-model="name" autofocus class="w-full" :maxlength="100" :placeholder="t('sharedDrives.name')" :aria-label="t('sharedDrives.name')" />
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" :disabled="saving" :label="t('common.cancel')" @click="creating = false" />
            <UButton type="submit" :disabled="saving || !name.trim()" :label="t('sharedDrives.create')" />
          </div>
        </form>
      </template>
    </UModal>
  </AdminSystemPage>
</template>
