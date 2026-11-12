<script setup lang="ts">
// Imports a Google Takeout export: the zip is read in the browser and messages are uploaded in
// batches. Ported from legacy/src/components/settings/takeout-import.tsx.
import type { TakeoutImportSummary } from '#lib/import/gmail-takeout-types'
import { parseIgnoredLabels, runTakeoutImport, splitMbox } from '#lib/import/gmail-takeout-utils'
import { isZipSupported, readStreamChunks } from '#lib/import/zip-utils'
import type { TakeoutRunState } from '~/types/settings/mail'
import { MESSAGES_CHANGED_EVENT } from '~/utils/settings/mail/import'
import {
  addTakeoutSummaries,
  clearTakeoutProgress,
  createTakeoutFolderResolver,
  createTakeoutUploader,
  emptyTakeoutSummary,
  formatBytes,
  getTakeoutProgress,
  getTakeoutSources,
  saveTakeoutProgress,
} from '~/utils/settings/mail/takeout'

const SECTION_LABEL_KEYS: Record<string, string> = {
  inbox: 'navigation.inbox',
  sent: 'navigation.sent',
  drafts: 'navigation.drafts',
  archived: 'navigation.archived',
  spam: 'navigation.spam',
  trash: 'navigation.trash',
}

const { t } = useLanguage()
const { selectedMailbox } = useSelectedMailbox()
const files = ref<File[]>([])
const options = reactive({ folders: true, skipSpam: false, skipTrash: false, ignoreLabels: '' })
const run = ref<TakeoutRunState | null>(null)
const result = ref<{ mode: TakeoutRunState['mode'], summary: TakeoutImportSummary } | null>(null)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)
let controller: AbortController | null = null
// The import mutates this object as it goes; the ref above is refreshed from it twice a second.
let live: TakeoutRunState | null = null
const running = computed(() => run.value !== null)

function cloneSummary(summary: TakeoutImportSummary): TakeoutImportSummary {
  return { ...summary, errors: [...summary.errors], destinations: { ...summary.destinations } }
}

function onBeforeUnload(event: BeforeUnloadEvent) {
  if (live?.mode === 'import') event.preventDefault()
}

let timer: ReturnType<typeof setInterval> | undefined
watch(running, (isRunning) => {
  clearInterval(timer)
  window.removeEventListener('beforeunload', onBeforeUnload)
  if (!isRunning) return
  timer = setInterval(() => {
    if (live) run.value = { ...live, summary: cloneSummary(live.summary) }
  }, 500)
  window.addEventListener('beforeunload', onBeforeUnload)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  window.removeEventListener('beforeunload', onBeforeUnload)
  controller?.abort()
})

function destinationLabel(key: string): string {
  const [type, ...rest] = key.split(':')
  const value = rest.join(':')
  if (type === 'folder') return t('importPage.takeoutFolder', { name: value })
  const labelKey = SECTION_LABEL_KEYS[value]
  return labelKey ? t(labelKey as Parameters<typeof t>[0]) : value
}

async function start(mode: TakeoutRunState['mode']) {
  const mailboxId = selectedMailbox.value?.id
  if (!mailboxId || files.value.length === 0) return
  error.value = null
  notice.value = null
  result.value = null
  if (!isZipSupported() && files.value.some(file => /\.zip$/i.test(file.name))) {
    error.value = t('importPage.takeoutUnsupported')
    return
  }
  controller = new AbortController()
  let total = emptyTakeoutSummary()
  live = { mode, sourceIndex: 0, sourceCount: 0, sourceLabel: '', bytesRead: 0, bytesTotal: 0, resumedAt: 0, summary: total }
  run.value = { ...live }
  try {
    const { sources, withoutMbox } = await getTakeoutSources(files.value)
    if (withoutMbox.length > 0) notice.value = t('importPage.takeoutNoMbox', { files: withoutMbox.join(', ') })
    if (sources.length === 0) return
    const upload = createTakeoutUploader(mailboxId)
    const resolveFolder = createTakeoutFolderResolver(mailboxId)
    for (const [index, source] of sources.entries()) {
      const resumedAt = mode === 'import' ? getTakeoutProgress(mailboxId, source) : 0
      const current: TakeoutRunState = {
        mode,
        sourceIndex: index + 1,
        sourceCount: sources.length,
        sourceLabel: source.label,
        bytesRead: 0,
        bytesTotal: source.size,
        resumedAt,
        summary: total,
      }
      live = current
      const before = total
      const chunks = readStreamChunks(await source.open(), (bytes) => {
        current.bytesRead += bytes
      })
      const summary = await runTakeoutImport(splitMbox(chunks), {
        labels: { folders: options.folders, ignore: parseIgnoredLabels(options.ignoreLabels) },
        skipSpam: options.skipSpam,
        skipTrash: options.skipTrash,
        startAt: resumedAt,
        dryRun: mode === 'preview',
        signal: controller.signal,
        upload,
        resolveFolder,
        onProgress: (progress) => {
          current.summary = addTakeoutSummaries(before, progress)
          if (mode === 'import') saveTakeoutProgress(mailboxId, source, progress.committed)
        },
      })
      total = addTakeoutSummaries(before, summary)
      if (summary.aborted) break
      if (mode === 'import') clearTakeoutProgress(mailboxId, source)
    }
    result.value = { mode, summary: total }
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught)
  } finally {
    controller = null
    live = null
    run.value = null
    if (mode === 'import') window.dispatchEvent(new Event(MESSAGES_CHANGED_EVENT))
  }
}

const summary = computed(() => run.value?.summary ?? result.value?.summary ?? null)
const percent = computed(() => run.value && run.value.bytesTotal > 0 ? Math.min(100, Math.round((run.value.bytesRead / run.value.bytesTotal) * 100)) : 0)
const destinations = computed(() => Object.entries(result.value?.summary.destinations ?? {}).sort((a, b) => b[1] - a[1]))
const destinationCount = computed(() => destinations.value.reduce((sum, [, count]) => sum + count, 0))
const canStart = computed(() => !!selectedMailbox.value && files.value.length > 0 && !running.value)
</script>

<template>
  <form class="space-y-4" @submit.prevent="start('import')">
    <UFormField :label="t('importPage.takeoutFiles')" :help="t('importPage.takeoutHint')" name="takeoutFiles">
      <UFileUpload
        v-model="files"
        multiple
        accept=".zip,.mbox,application/zip,application/mbox"
        :disabled="running"
        :label="t('importPage.takeoutFiles')"
        layout="list"
        class="w-full"
      />
    </UFormField>
    <div class="grid gap-2 sm:grid-cols-3">
      <UCheckbox v-model="options.folders" :disabled="running" :label="t('importPage.takeoutFolders')" />
      <UCheckbox v-model="options.skipSpam" :disabled="running" :label="t('importPage.takeoutSkipSpam')" />
      <UCheckbox v-model="options.skipTrash" :disabled="running" :label="t('importPage.takeoutSkipTrash')" />
    </div>
    <UFormField v-if="options.folders" :label="t('importPage.takeoutIgnoreLabels')" :help="t('importPage.takeoutIgnoreHint')" name="ignoreLabels">
      <UInput v-model="options.ignoreLabels" :disabled="running" placeholder="[Superhuman]/, Notes" class="w-full" />
    </UFormField>
    <UAlert color="neutral" variant="soft" :description="t('importPage.takeoutKeepOpen')" />
    <div class="flex flex-wrap gap-2">
      <UButton
        type="submit"
        icon="i-lucide-upload"
        :disabled="!canStart"
        :label="run?.mode === 'import' ? t('import.importing') : t('importPage.takeoutStart')"
      />
      <UButton color="neutral" variant="outline" :disabled="!canStart" :label="t('importPage.takeoutPreview')" @click="start('preview')" />
      <UButton v-if="running" color="neutral" variant="outline" :label="t('importPage.takeoutStop')" @click="controller?.abort()" />
    </div>
    <div v-if="run" class="space-y-1 text-xs text-muted" aria-live="polite">
      <div class="flex justify-between gap-4">
        <span class="truncate">
          {{ run.sourceCount > 0
            ? t('importPage.takeoutReading', { source: run.sourceLabel, index: run.sourceIndex, count: run.sourceCount })
            : t('importPage.preparing') }}
        </span>
        <span class="shrink-0">{{ formatBytes(run.bytesRead) }} / {{ formatBytes(run.bytesTotal) }}</span>
      </div>
      <UProgress :model-value="percent" size="xs" />
      <p v-if="run.resumedAt > 0">{{ t('importPage.takeoutResumed', { count: run.resumedAt }) }}</p>
    </div>
    <p v-if="summary && (run?.mode === 'import' || result?.mode === 'import')" class="text-sm text-default">
      {{ t('importPage.takeoutCounts', { read: summary.read, imported: summary.imported, skipped: summary.skipped }) }}
    </p>
    <UAlert v-if="result" color="success" variant="subtle">
      <template #description>
        <div class="space-y-2">
          <p v-if="result.summary.aborted" class="font-medium">{{ t('importPage.takeoutStopped') }}</p>
          <template v-if="result.mode === 'preview'">
            <p class="font-medium">{{ t('importPage.takeoutPreviewResult', { count: destinationCount }) }}</p>
            <ul class="space-y-0.5 text-xs">
              <li v-for="[key, count] in destinations" :key="key" class="flex justify-between gap-4">
                <span class="truncate">{{ destinationLabel(key) }}</span>
                <span class="tabular-nums">{{ count }}</span>
              </li>
            </ul>
          </template>
          <p v-if="result.summary.tooLarge > 0" class="text-xs">{{ t('importPage.takeoutTooLarge', { count: result.summary.tooLarge }) }}</p>
          <p v-if="result.summary.ignored > 0" class="text-xs">{{ t('importPage.takeoutIgnored', { count: result.summary.ignored }) }}</p>
          <div v-if="result.summary.failed > 0" class="text-xs text-error">
            <p>{{ t('importPage.takeoutFailed', { count: result.summary.failed }) }}</p>
            <ul class="mt-1 list-disc space-y-0.5 pl-5">
              <li v-for="item in result.summary.errors.slice(0, 5)" :key="item">{{ item }}</li>
            </ul>
          </div>
        </div>
      </template>
    </UAlert>
    <UAlert v-if="notice" color="warning" variant="subtle" :description="notice" />
    <UAlert v-if="error" color="error" variant="subtle" :description="error" />
  </form>
</template>
