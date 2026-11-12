<script setup lang="ts">
// One attachment under a message, opening the preview. Ported from message-attachment-card.tsx.
import { formatAttachmentSize } from '~/utils/messages/detail-utils'
import { getAttachmentFileUrl, getAttachmentVisual } from '~/utils/messages/attachment-utils'
import type { MessageAttachment } from '~/utils/messages/types'

const props = defineProps<{ attachment: MessageAttachment, messageId: string }>()
const emit = defineEmits<{ preview: [attachment: MessageAttachment] }>()
const { t } = useLanguage()
const visual = computed(() => getAttachmentVisual(props.attachment))
const previewUrl = computed(() => getAttachmentFileUrl(props.messageId, props.attachment.id, 'preview'))
</script>

<template>
  <button
    type="button"
    class="group flex w-full items-center gap-3 rounded-lg border border-default p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
    @click="emit('preview', attachment)"
  >
    <img v-if="visual.thumbnail === 'image'" :src="previewUrl" alt="" loading="lazy" class="size-14 shrink-0 rounded-md bg-elevated object-cover">
    <span v-else-if="visual.thumbnail === 'video'" class="relative size-14 shrink-0 overflow-hidden rounded-md bg-inverted">
      <video :src="previewUrl" muted preload="metadata" playsinline class="size-full object-cover" />
      <span class="absolute inset-0 flex items-center justify-center bg-black/20">
        <UIcon name="i-lucide-play" class="size-5 text-white" />
      </span>
    </span>
    <span v-else class="flex size-14 shrink-0 items-center justify-center rounded-md" :class="visual.iconClassName">
      <UIcon :name="visual.icon" class="size-6" />
    </span>
    <span class="min-w-0 flex-1 text-left">
      <span class="block truncate text-sm font-medium text-highlighted">{{ attachment.filename }}</span>
      <span class="mt-0.5 block truncate text-xs text-muted">{{ t(visual.labelKey) }} · {{ formatAttachmentSize(attachment.size) }}</span>
    </span>
    <UIcon name="i-lucide-arrow-down-to-line" class="size-4 shrink-0 text-dimmed transition-colors group-hover:text-primary" />
  </button>
</template>
