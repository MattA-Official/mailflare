<script setup lang="ts">
// Public page for a Drive link: anyone with the link can browse the folder or view the file.
// Ported from legacy/src/app/d/[token]/page.tsx.
import { formatDriveSize } from '#lib/drive/utils'
import type { PublicDriveListing } from '~/types/drive/drive'
import { driveIconFor, publicContentUrl, sortDriveItems } from '~/utils/drive/drive-utils'

definePageMeta({ auth: { mode: 'public' } })

const { t } = useLanguage()
const route = useRoute()
const token = computed(() => String(route.params.token))
const itemId = ref<string | null>(null)
const data = ref<PublicDriveListing | null>(null)
const missing = ref(false)
let generation = 0

watch([token, itemId], async ([value, item]) => {
  const current = ++generation
  try {
    const response = await fetch(`/api/drive/public/${encodeURIComponent(value)}${item ? `?item=${encodeURIComponent(item)}` : ''}`)
    if (!response.ok) throw new Error()
    const listing = await response.json() as PublicDriveListing
    if (current !== generation) return
    data.value = listing
    missing.value = false
  } catch {
    if (current === generation) missing.value = true
  }
}, { immediate: true })

const isFile = computed(() => data.value?.item.kind === 'file')
const entries = computed(() => data.value ? sortDriveItems(data.value.items, 'name', true) : [])
useHead({ title: () => data.value?.item.name ?? t('drive.title') })
</script>

<template>
  <main v-if="missing" class="flex min-h-dvh items-center justify-center bg-muted p-6 text-center text-muted">{{ t('drive.publicNotFound') }}</main>
  <main v-else-if="!data" class="min-h-dvh bg-muted" aria-busy="true" />
  <div v-else class="min-h-dvh bg-muted">
    <main class="mx-auto flex min-h-dvh max-w-5xl flex-col p-4 md:p-8">
      <nav class="mb-4 flex flex-wrap items-center gap-1 text-lg text-highlighted">
        <span v-for="(crumb, index) in data.path" :key="crumb.id" class="flex items-center gap-1">
          <UIcon v-if="index > 0" name="i-lucide-chevron-right" class="size-[18px] text-muted" />
          <h1 v-if="index === data.path.length - 1" class="px-2 py-1">{{ crumb.name }}</h1>
          <button v-else type="button" class="rounded-full px-2 py-1 hover:bg-elevated" @click="itemId = crumb.id">{{ crumb.name }}</button>
        </span>
        <UButton v-if="isFile" :to="publicContentUrl(token, data.item.id, true)" external icon="i-lucide-download" class="ml-auto rounded-full" :label="t('drive.download')" />
      </nav>
      <div v-if="isFile" class="flex min-h-[70vh] flex-1 flex-col rounded-2xl bg-[#202124] p-3">
        <DrivePreviewBody class="min-h-0 flex-1" :src="publicContentUrl(token, data.item.id)" :download-href="publicContentUrl(token, data.item.id, true)" :content-type="data.item.contentType" :name="data.item.name" />
      </div>
      <div v-else class="rounded-2xl bg-default p-2">
        <p v-if="!entries.length" class="p-10 text-center text-sm text-muted">{{ t('drive.empty') }}</p>
        <div v-for="entry in entries" :key="entry.id" class="flex items-center gap-4 rounded-lg px-3 text-sm hover:bg-elevated">
          <button type="button" class="flex min-w-0 flex-1 items-center gap-4 py-3 text-left" @click="itemId = entry.id">
            <UIcon :name="driveIconFor(entry).icon" class="size-4 shrink-0" :class="[driveIconFor(entry).className, entry.kind === 'folder' && 'fill-current']" />
            <span class="truncate text-highlighted">{{ entry.name }}</span>
          </button>
          <span v-if="entry.kind === 'file'" class="hidden shrink-0 text-muted sm:block">{{ formatDriveSize(entry.size) }}</span>
          <UButton v-if="entry.kind === 'file'" :to="publicContentUrl(token, entry.id, true)" external icon="i-lucide-download" color="neutral" variant="ghost" class="rounded-full" :aria-label="entry.name" />
        </div>
      </div>
    </main>
  </div>
</template>
