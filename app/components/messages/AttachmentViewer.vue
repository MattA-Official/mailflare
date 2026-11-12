<script setup lang="ts">
// Preview of an attachment with its risk check before download.
// Ported from legacy/src/components/message-attachment-viewer.tsx.
import type { AttachmentRisk } from '#lib/email/attachment-risk'
import { authFetch } from '~/utils/auth-client'
import { getAttachmentFileUrl, getAttachmentPreviewKind } from '~/utils/messages/attachment-utils'
import type { MessageAttachment } from '~/utils/messages/types'

const props = defineProps<{ attachment: MessageAttachment | null, messageId: string }>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useLanguage()
const textContent = ref('')
const textError = ref('')
const risk = shallowRef<AttachmentRisk | null>(null)
const acknowledged = ref(false)
const user = useCurrentUser()
const driveEnabled = computed(() => user.value?.driveEnabled !== false)
// Keyed by attachment id, so opening another file starts from idle.
const save = shallowRef<{ id: string, status: 'saving' | 'saved' | 'error' } | null>(null)
const saveState = computed(() => (save.value && save.value.id === props.attachment?.id ? save.value.status : 'idle'))

const previewKind = computed(() => (props.attachment ? getAttachmentPreviewKind(props.attachment) : 'unsupported'))
const previewUrl = computed(() => (props.attachment ? getAttachmentFileUrl(props.messageId, props.attachment.id, 'preview') : ''))
const flagged = computed(() => !!risk.value && risk.value.level !== 'ok')
const downloadUrl = computed(() => (props.attachment ? getAttachmentFileUrl(props.messageId, props.attachment.id, flagged.value ? 'acknowledged-download' : 'download') : ''))

watch([() => props.attachment, () => props.messageId, open], ([attachment, messageId, isOpen], _previous, onCleanup) => {
  risk.value = null
  acknowledged.value = false
  if (!isOpen || !attachment) return
  let cancelled = false
  onCleanup(() => {
    cancelled = true
  })
  void authFetch(getAttachmentFileUrl(messageId, attachment.id, 'risk'))
    .then(async (response): Promise<AttachmentRisk | null> => (response.ok ? await response.json() : null))
    .then((data) => {
      if (!cancelled && data) risk.value = data
    })
    .catch(() => undefined)
}, { immediate: true })

// Ask once per opened attachment whether it is already in Drive, so the button starts disabled.
watch([() => props.attachment, () => props.messageId, open, driveEnabled], ([attachment, messageId, isOpen, enabled], _previous, onCleanup) => {
  if (!isOpen || !attachment || !enabled) return
  const id = attachment.id
  let cancelled = false
  onCleanup(() => {
    cancelled = true
  })
  void authFetch(`/api/messages/${messageId}/attachments/${id}/save-to-drive`)
    .then(async response => (response.ok ? (await response.json()) as { saved?: boolean } : null))
    .then((data) => {
      if (cancelled || !data?.saved) return
      if (save.value?.id === id && save.value.status === 'saving') return
      save.value = { id, status: 'saved' }
    })
    .catch(() => undefined)
}, { immediate: true })

async function saveToDrive() {
  const attachment = props.attachment
  if (!attachment || saveState.value === 'saving' || saveState.value === 'saved') return
  const id = attachment.id
  save.value = { id, status: 'saving' }
  try {
    const response = await authFetch(`/api/messages/${props.messageId}/attachments/${id}/save-to-drive`, { method: 'POST' })
    if (!response.ok) throw new Error('Save to Drive failed')
    save.value = { id, status: 'saved' }
  }
  catch {
    save.value = { id, status: 'error' }
  }
}

watch([() => props.attachment, open, previewKind, previewUrl], ([attachment, isOpen, kind, url], _previous, onCleanup) => {
  if (!isOpen || !attachment || kind !== 'text') return
  let cancelled = false
  onCleanup(() => {
    cancelled = true
  })
  textContent.value = ''
  textError.value = ''
  authFetch(url)
    .then(async (response) => {
      if (!response.ok) throw new Error(t('attachment.loadFailed'))
      const content = await response.text()
      if (!cancelled) textContent.value = content
    })
    .catch((error) => {
      if (!cancelled) textError.value = error instanceof Error ? error.message : t('attachment.loadFailed')
    })
}, { immediate: true })
</script>

<template>
  <UModal
    v-if="attachment"
    v-model:open="open"
    :title="attachment.filename"
    :description="attachment.type"
    :ui="{ content: 'sm:max-w-[min(1100px,calc(100vw-32px))] h-[min(88vh,900px)]', body: 'flex min-h-0 flex-1 flex-col gap-3' }"
  >
    <template #body>
      <div class="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-lg bg-elevated">
        <img v-if="previewKind === 'image'" :src="previewUrl" :alt="attachment.filename" class="max-h-full max-w-full object-contain">
        <iframe v-else-if="previewKind === 'pdf'" :src="previewUrl" :title="attachment.filename" class="size-full border-0 bg-white" />
        <audio v-else-if="previewKind === 'audio'" :src="previewUrl" controls class="w-[min(560px,90%)]" />
        <video v-else-if="previewKind === 'video'" :src="previewUrl" controls class="max-h-full max-w-full" />
        <template v-else-if="previewKind === 'text'">
          <pre v-if="textError || textContent" class="size-full overflow-auto whitespace-pre-wrap p-5 text-sm text-default">{{ textError || textContent }}</pre>
          <div v-else class="size-full space-y-3 bg-default p-5">
            <USkeleton class="h-4 w-full" />
            <USkeleton class="h-4 w-11/12" />
            <USkeleton class="h-4 w-4/5" />
          </div>
        </template>
        <div v-else class="flex flex-col items-center gap-3 px-6 text-center">
          <UIcon name="i-lucide-file-warning" class="size-10 text-dimmed" />
          <p class="text-sm text-toned">{{ t('attachment.unsupported') }}</p>
        </div>
      </div>

      <UAlert
        v-if="risk && flagged"
        role="alert"
        :color="risk.level === 'blocked' ? 'error' : 'warning'"
        variant="subtle"
        :title="risk.level === 'blocked' ? t('attachment.risk.blocked') : t('attachment.risk.warning')"
      >
        <template #description>
          <ul class="mt-1 list-disc pl-5">
            <li v-for="reason in risk.reasons" :key="reason">{{ reason }}</li>
          </ul>
          <UCheckbox v-model="acknowledged" class="mt-2" :label="t('attachment.risk.acknowledge')" />
        </template>
      </UAlert>
    </template>
    <template #footer>
      <div class="flex w-full items-center justify-end gap-3">
        <span v-if="risk && !flagged" class="text-xs text-muted">{{ t('attachment.risk.ok') }}</span>
        <span v-if="saveState === 'error'" class="text-xs text-error">{{ t('attachment.saveToDriveFailed') }}</span>
        <UButton
          v-if="driveEnabled"
          color="neutral"
          variant="outline"
          :icon="saveState === 'saved' ? 'i-lucide-check' : 'i-lucide-hard-drive'"
          :label="saveState === 'saved' ? t('attachment.savedToDrive') : saveState === 'saving' ? t('common.saving') : t('attachment.saveToDrive')"
          :disabled="saveState === 'saving' || saveState === 'saved'"
          @click="saveToDrive"
        />
        <UButton v-if="flagged && !acknowledged" disabled icon="i-lucide-arrow-down-to-line" :label="t('attachment.download')" />
        <UButton v-else :to="downloadUrl" external :download="attachment.filename" icon="i-lucide-arrow-down-to-line" :label="t('attachment.download')" />
      </div>
    </template>
  </UModal>
</template>
