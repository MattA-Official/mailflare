<script setup lang="ts">
// Imports run on the server; this lists them and follows the ones still working. Changing
// `refreshKey` reloads the list. Ported from legacy/src/components/settings/import-jobs.tsx.
import type { ImportJobSummary } from '#lib/import/jobs-types'
import {
  IMPORT_JOBS_POLL_MS,
  MESSAGES_CHANGED_EVENT,
  fetchImportJobs,
  getImportJobPercent,
  isImportJobActive,
  removeImportJob,
  resumeImportJob,
} from '~/utils/settings/mail/import'

const props = defineProps<{ refreshKey: number }>()
const { t } = useLanguage()

const STATUS_COLOR: Record<ImportJobSummary['status'], 'neutral' | 'info' | 'success' | 'error' | 'warning'> = {
  queued: 'neutral',
  running: 'info',
  completed: 'success',
  failed: 'error',
  cancelled: 'warning',
}

const jobs = ref<ImportJobSummary[]>([])
const loaded = ref(false)
const resuming = ref<string | null>(null)
const password = ref('')
const resumeError = ref<string | null>(null)
let previous = new Map<string, ImportJobSummary['status']>()

async function load() {
  try {
    const next = await fetchImportJobs()
    const finishedNow = next.some((job) => {
      const before = previous.get(job.id)
      return !!before && (before === 'queued' || before === 'running') && !isImportJobActive(job)
    })
    previous = new Map(next.map(job => [job.id, job.status]))
    jobs.value = next
    if (finishedNow) window.dispatchEvent(new Event(MESSAGES_CHANGED_EVENT))
  } catch {
    // Keep the last list; the next poll retries.
  } finally {
    loaded.value = true
  }
}

const hasActive = computed(() => jobs.value.some(isImportJobActive))

onMounted(load)
watch(() => props.refreshKey, load)

let timer: ReturnType<typeof setInterval> | undefined
watch(hasActive, (active) => {
  clearInterval(timer)
  timer = active ? setInterval(load, IMPORT_JOBS_POLL_MS) : undefined
})
onBeforeUnmount(() => clearInterval(timer))

async function remove(job: ImportJobSummary) {
  try {
    await removeImportJob(job.id)
  } finally {
    await load()
  }
}

async function resume(job: ImportJobSummary) {
  if (job.kind === 'imap' && resuming.value !== job.id) {
    resuming.value = job.id
    password.value = ''
    resumeError.value = null
    return
  }
  try {
    await resumeImportJob(job.id, job.kind === 'imap' ? password.value : undefined)
    resuming.value = null
    password.value = ''
    resumeError.value = null
  } catch (cause) {
    resumeError.value = cause instanceof Error ? cause.message : t('importJobs.resumeFailed')
  } finally {
    await load()
  }
}

function progressLabel(job: ImportJobSummary) {
  if (job.currentSource) return t('importPage.importingSource', { source: job.currentSource })
  return job.status === 'queued' ? t('importJobs.waiting') : t('importPage.importingMessages')
}
</script>

<template>
  <section v-if="!loaded || jobs.length > 0" class="space-y-4" aria-live="polite">
    <p v-if="hasActive" class="flex items-center gap-2 text-sm text-muted">
      <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" aria-hidden="true" />
      {{ t('importJobs.running') }}
    </p>
    <ul class="space-y-3">
      <li v-for="job in jobs" :key="job.id">
        <UCard :ui="{ body: 'space-y-3 p-4 sm:p-4' }">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="truncate text-sm font-medium text-highlighted">{{ job.label }}</p>
              <p class="text-xs text-muted">
                {{ job.kind === 'imap' ? t('importPage.imap') : t('importPage.backupFile') }} · {{ new Date(job.createdAt).toLocaleString() }}
              </p>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <UBadge :color="STATUS_COLOR[job.status]" variant="subtle" :label="t(`importJobs.status.${job.status}`)" />
              <UButton v-if="job.status === 'failed'" size="sm" :label="t('importJobs.resume')" @click="resume(job)" />
              <UButton
                size="sm"
                color="neutral"
                variant="outline"
                :label="isImportJobActive(job) ? t('importJobs.cancel') : t('importJobs.dismiss')"
                @click="remove(job)"
              />
            </div>
          </div>
          <div v-if="isImportJobActive(job)" class="space-y-1 text-xs text-muted">
            <div class="flex justify-between gap-3">
              <span class="truncate">{{ progressLabel(job) }}</span>
              <span>{{ getImportJobPercent(job) === null ? '…' : `${getImportJobPercent(job)}%` }}</span>
            </div>
            <UProgress :model-value="getImportJobPercent(job)" size="xs" />
          </div>
          <p class="text-xs text-muted">
            <span v-if="isImportJobActive(job) && job.total <= 0" class="inline-flex items-center gap-1.5">
              <UIcon name="i-lucide-loader-circle" class="size-3 animate-spin" aria-hidden="true" />
              {{ t('importJobs.counting') }}
            </span>
            <template v-else>
              {{ t('importJobs.counts', { processed: job.processed, total: job.total, imported: job.imported, skipped: job.skipped }) }}
            </template>
          </p>
          <form v-if="resuming === job.id && job.status === 'failed'" class="flex items-center gap-2" @submit.prevent="resume(job)">
            <UInput
              v-model="password"
              type="password"
              autocomplete="off"
              :placeholder="t('importJobs.resumePassword')"
              :aria-label="t('importJobs.resumePassword')"
              class="flex-1"
            />
            <UButton type="submit" size="sm" :disabled="!password" :label="t('importJobs.resume')" />
          </form>
          <p v-if="resuming === job.id && resumeError" class="text-xs text-error">{{ resumeError }}</p>
          <UAlert v-if="job.error" color="error" variant="subtle" :description="job.error" />
          <details v-if="job.errorCount > 0" class="text-xs text-muted">
            <summary class="cursor-pointer">{{ t('importJobs.errors', { count: job.errorCount }) }}</summary>
            <ul class="mt-2 list-disc space-y-1 pl-5">
              <li v-for="item in job.errors.slice(0, 5)" :key="item">{{ item }}</li>
            </ul>
          </details>
        </UCard>
      </li>
    </ul>
  </section>
</template>
