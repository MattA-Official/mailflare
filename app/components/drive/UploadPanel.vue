<script setup lang="ts">
// Every upload of the session stacked in one card: a row per file with its bar and percentage.
// Ported from legacy/src/app/(drive)/drive-upload-panel.tsx.
import type { DriveUploadEntry } from '~/types/drive/drive'

const props = defineProps<{ uploads: DriveUploadEntry[] }>()
defineEmits<{ close: [] }>()
const { t } = useLanguage()
const active = computed(() => props.uploads.filter(entry => entry.status === 'queued' || entry.status === 'uploading').length)
const done = computed(() => props.uploads.filter(entry => entry.status === 'done').length)
</script>

<template>
  <section v-if="uploads.length" :aria-label="t('drive.uploads')" class="fixed bottom-4 right-4 z-[90] w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-default bg-default shadow-xl">
    <header class="flex items-center justify-between gap-3 bg-muted px-4 py-2.5 text-sm font-medium text-highlighted">
      <span aria-live="polite">{{ active ? t('drive.uploadingCount', { count: active }) : t('drive.uploaded', { count: done }) }}</span>
      <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" class="rounded-full" :class="{ invisible: active > 0 }" :disabled="active > 0" :aria-label="t('navigation.close')" @click="$emit('close')" />
    </header>
    <ul class="max-h-64 divide-y divide-default overflow-y-auto">
      <li v-for="entry in uploads" :key="entry.id" class="px-4 py-2.5 text-sm">
        <div class="flex items-center gap-2">
          <span class="min-w-0 flex-1 truncate text-highlighted" :title="entry.name">{{ entry.name }}</span>
          <UIcon v-if="entry.status === 'done'" name="i-lucide-circle-check" class="size-4 shrink-0 text-success" :aria-label="t('drive.uploadDone')" />
          <UIcon v-if="entry.status === 'failed'" name="i-lucide-circle-alert" class="size-4 shrink-0 text-error" aria-hidden="true" />
        </div>
        <p v-if="entry.status === 'failed'" class="mt-1 text-xs text-error">{{ entry.error ?? t('drive.uploadFailed', { name: entry.name }) }}</p>
        <div v-else class="mt-1.5 flex items-center gap-3">
          <UProgress :model-value="entry.percent" :color="entry.status === 'done' ? 'success' : 'primary'" size="sm" class="min-w-0 flex-1" :aria-label="entry.name" />
          <span class="w-10 shrink-0 text-right text-xs tabular-nums text-muted">{{ entry.status === 'queued' ? '—' : `${entry.percent}%` }}</span>
        </div>
        <p v-if="entry.resumed && entry.status === 'uploading'" class="mt-1 text-xs text-muted">{{ t('drive.resuming', { name: entry.name }) }}</p>
      </li>
    </ul>
  </section>
</template>
