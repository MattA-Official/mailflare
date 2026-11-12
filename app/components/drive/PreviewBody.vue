<script setup lang="ts">
// The file itself inside the preview dialog and on public share pages.
// Ported from legacy/src/app/(drive)/drive-preview.tsx.
import { canPreview } from '~/utils/drive/drive-utils'

defineProps<{ src: string, downloadHref: string, contentType: string, name: string }>()
const { t } = useLanguage()
</script>

<template>
  <div v-if="!canPreview(contentType)" class="flex h-full flex-col items-center justify-center gap-4 text-sm text-[#e8eaed]">
    <p>{{ t('drive.noPreview') }}</p>
    <UButton :to="downloadHref" external color="neutral" variant="solid" class="rounded-full bg-[#e8eaed] text-[#202124] hover:bg-white" icon="i-lucide-download" :label="t('drive.download')" />
  </div>
  <img v-else-if="contentType.startsWith('image/')" :src="src" :alt="name" class="mx-auto max-h-full max-w-full object-contain">
  <video v-else-if="contentType.startsWith('video/')" :src="src" controls class="mx-auto max-h-full max-w-full" />
  <div v-else-if="contentType.startsWith('audio/')" class="flex h-full items-center justify-center">
    <audio :src="src" controls />
  </div>
  <iframe v-else :src="src" :title="name" class="size-full rounded-lg bg-white" style="color-scheme: light" />
</template>
