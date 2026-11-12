<script setup lang="ts">
// Import from backup files, IMAP or Google Takeout into the selected mailbox. Every import except
// Takeout runs as a server-side job. Ported from legacy/src/app/(settings)/settings/import/page.tsx.
import type { ImapFormState, ImportProgress, ImportSourceItem, ImportSourceSection, ImportTab } from '~/types/settings/mail'
import {
  ensureImportDestination,
  fetchImapFolders,
  filterCustomImapFolders,
  getFileImportSource,
  getFolderImportSource,
  getSelectedImportSources,
  importMessageFiles,
  importSourceOptions,
  resolveImapSourceFolder,
  startImapImport,
} from '~/utils/settings/mail/import'

definePageMeta({ layout: 'dashboard', nav: 'settings' })

const SECTION_LABEL_KEYS = {
  inbox: 'navigation.inbox',
  sent: 'navigation.sent',
  drafts: 'navigation.drafts',
  archived: 'navigation.archived',
  spam: 'navigation.spam',
  trash: 'navigation.trash',
  others: 'importPage.others',
} as const satisfies Record<ImportSourceSection, string>

const { t } = useLanguage()
const { selectedMailbox } = useSelectedMailbox()

const activeTab = ref<ImportTab>('file')
const tabItems = computed(() => [
  { value: 'file', label: t('importPage.backupFile') },
  { value: 'imap', label: t('importPage.imap') },
  { value: 'takeout', label: t('importPage.takeout') },
])

const selectedSections = ref<ImportSourceSection[]>(importSourceOptions.map(option => option.value))
const sectionItems = computed(() => importSourceOptions.map(option => ({ value: option.value, label: t(SECTION_LABEL_KEYS[option.value]) })))
const selectedSources = computed(() => getSelectedImportSources(selectedSections.value))
const fileImportSource = computed(() => getFileImportSource(selectedSources.value))
// System sections are translated; folders discovered on the source keep their own names.
const sourceLabel = (source: ImportSourceItem) => source.sourceSection ? t(SECTION_LABEL_KEYS[source.sourceSection]) : source.label

const jobsRefresh = ref(0)

const files = ref<File[]>([])
const fileStarted = ref(false)
const fileError = ref<string | null>(null)
const fileLoading = ref(false)
const fileProgress = ref<ImportProgress | null>(null)

const imapForm = reactive<ImapFormState>({ host: '', port: '993', secure: true, username: '', password: '', folder: 'INBOX', limit: '100', importAll: true })
const imapStarted = ref(false)
const imapError = ref<string | null>(null)
const imapLoading = ref(false)
const imapProgress = ref<ImportProgress | null>(null)

function getDestination(source: ImportSourceItem): Promise<string> {
  if (!selectedMailbox.value?.id) throw new Error(t('importPage.selectMailboxFirst'))
  return ensureImportDestination(selectedMailbox.value.id, source)
}

async function submitFiles() {
  const mailboxId = selectedMailbox.value?.id
  if (!mailboxId || selectedSources.value.length === 0 || files.value.length === 0) return
  fileLoading.value = true
  fileError.value = null
  fileStarted.value = false
  fileProgress.value = { completed: 0, total: 100, label: t('importPage.preparing') }
  try {
    const destination = await getDestination(fileImportSource.value)
    await importMessageFiles(mailboxId, files.value, destination, (percentage) => {
      fileProgress.value = { completed: percentage, total: 100, label: t('importPage.uploading') }
    })
    fileStarted.value = true
    jobsRefresh.value += 1
  } catch (cause) {
    fileError.value = cause instanceof Error ? cause.message : t('importPage.fileFailed')
  } finally {
    fileLoading.value = false
    fileProgress.value = null
  }
}

async function submitImap() {
  const mailboxId = selectedMailbox.value?.id
  if (!mailboxId || selectedSources.value.length === 0) return
  imapLoading.value = true
  imapError.value = null
  imapStarted.value = false
  imapProgress.value = { completed: 0, total: 1, label: t('importPage.discovering') }
  try {
    const discoveredFolders = await fetchImapFolders(imapForm)
    const expandedSources: ImportSourceItem[] = []
    for (const source of selectedSources.value) {
      if (source.id === 'system:others') {
        expandedSources.push(...filterCustomImapFolders(discoveredFolders, selectedSources.value).map(getFolderImportSource))
      } else {
        expandedSources.push(source)
      }
    }
    const sources: { folder: string, destination: string }[] = []
    for (const source of expandedSources) {
      sources.push({ folder: resolveImapSourceFolder(source, discoveredFolders), destination: await getDestination(source) })
    }
    await startImapImport(mailboxId, imapForm, sources)
    imapStarted.value = true
    jobsRefresh.value += 1
    imapForm.password = ''
  } catch (cause) {
    imapError.value = cause instanceof Error ? cause.message : t('importPage.imapFailed')
  } finally {
    imapLoading.value = false
    imapProgress.value = null
  }
}
</script>

<template>
  <SettingsMailSettingsPage id="settings-import" :title="t('settings.nav.import')">
    <SettingsMailImportJobs :refresh-key="jobsRefresh" />

    <section class="space-y-4">
      <div>
        <h2 class="text-xl font-semibold text-highlighted">{{ t('importPage.title') }}</h2>
        <p class="mt-1 text-sm text-muted">{{ t('importPage.description') }}</p>
      </div>
      <UCard :ui="{ body: 'space-y-6 p-6 sm:p-6' }">
        <UFormField :label="t('importPage.source')" name="source">
          <USelect v-model="activeTab" :items="tabItems" class="w-full" />
        </UFormField>

        <SettingsMailTakeoutImport v-if="activeTab === 'takeout'" />
        <template v-else>
          <UFormField :label="t('importPage.chooseSections')" name="sections">
            <USelectMenu
              v-model="selectedSections"
              :items="sectionItems"
              value-key="value"
              multiple
              :search-input="false"
              :placeholder="t('importPage.selectSections')"
              class="w-full"
            />
          </UFormField>

          <UForm v-if="activeTab === 'file'" :state="{ files }" class="space-y-4" @submit="submitFiles">
            <UFormField :label="t('importPage.selectFile')" :help="t('importPage.fileHint', { section: sourceLabel(fileImportSource) })" name="files">
              <UFileUpload v-model="files" multiple accept=".eml,.mbox,.mbx,message/rfc822,application/mbox" :label="t('import.filesLabel')" layout="list" class="w-full" />
            </UFormField>
            <UAlert v-if="selectedSections.includes('others')" color="warning" variant="subtle" :description="t('importPage.othersNote')" />
            <UButton
              type="submit"
              :disabled="!selectedMailbox || selectedSources.length === 0 || files.length === 0 || fileLoading"
              :label="fileLoading ? t('import.importing') : t('importPage.importFiles')"
            />
            <div v-if="fileProgress" class="space-y-1 text-xs text-muted" aria-live="polite">
              <div class="flex justify-between">
                <span>{{ fileProgress.label }}</span>
                <span>{{ fileProgress.completed }}%</span>
              </div>
              <UProgress :model-value="fileProgress.completed" size="xs" />
            </div>
            <UAlert v-if="fileStarted" color="success" variant="subtle" :description="t('importJobs.started')" />
            <UAlert v-if="fileError" color="error" variant="subtle" :description="fileError" />
          </UForm>

          <UForm v-else :state="imapForm" class="space-y-4" @submit="submitImap">
            <div class="grid gap-3 md:grid-cols-[1fr_110px]">
              <UFormField :label="t('importPage.host')" name="host">
                <UInput v-model="imapForm.host" placeholder="imap.gmail.com" class="w-full" />
              </UFormField>
              <UFormField :label="t('importPage.port')" name="port">
                <UInput v-model="imapForm.port" type="number" class="w-full" />
              </UFormField>
            </div>
            <div class="grid gap-3 md:grid-cols-2">
              <UFormField :label="t('importPage.username')" name="username">
                <UInput v-model="imapForm.username" placeholder="you@example.com" class="w-full" />
              </UFormField>
              <UFormField :label="t('importPage.passwordOrApp')" name="password">
                <UInput v-model="imapForm.password" type="password" autocomplete="off" class="w-full" />
              </UFormField>
            </div>
            <div class="grid items-end gap-3 md:grid-cols-2">
              <UFormField :label="imapForm.importAll ? t('importPage.perBatch') : t('importPage.perSource')" name="limit">
                <UInput v-model="imapForm.limit" type="number" :min="1" :max="100" class="w-full" />
              </UFormField>
              <div class="flex flex-wrap gap-4 pb-2">
                <UCheckbox v-model="imapForm.importAll" :label="t('importPage.importAll')" />
                <UCheckbox v-model="imapForm.secure" :label="t('importPage.useTls')" />
              </div>
            </div>
            <UAlert color="neutral" variant="soft" :description="t('importPage.imapNote')" />
            <UButton
              type="submit"
              icon="i-lucide-upload"
              :disabled="!selectedMailbox || selectedSources.length === 0 || !imapForm.host || !imapForm.username || !imapForm.password || imapLoading"
              :label="imapLoading ? t('import.importing') : t('importPage.importSources')"
            />
            <div v-if="imapProgress" class="space-y-1 text-xs text-muted" aria-live="polite">
              <div class="flex justify-between">
                <span>{{ imapProgress.label }}</span>
                <span>{{ imapProgress.completed }}/{{ imapProgress.total }}</span>
              </div>
              <UProgress :model-value="imapProgress.completed" :max="imapProgress.total" size="xs" />
            </div>
            <UAlert v-if="imapStarted" color="success" variant="subtle" :description="t('importJobs.started')" />
            <UAlert v-if="imapError" color="error" variant="subtle" :description="imapError" />
          </UForm>
        </template>
      </UCard>
    </section>
  </SettingsMailSettingsPage>
</template>
