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
// The open folder or file is in the URL (?item=), so Back works and a subfolder can be linked.
const itemId = computed(() => typeof route.query.item === 'string' ? route.query.item : null)
// One key, so the current listing stays on screen while the next one loads.
const { data, error } = useFetch<PublicDriveListing>(() => `/api/drive/public/${encodeURIComponent(token.value)}`, {
  key: 'public-drive-listing',
  query: computed(() => itemId.value ? { item: itemId.value } : {}),
})
const missing = computed(() => Boolean(error.value))

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
          <UButton v-else :to="{ query: { item: crumb.id } }" color="neutral" variant="ghost" size="lg" :label="crumb.name" class="rounded-full text-lg font-normal text-highlighted" />
        </span>
        <UButton v-if="isFile" :to="publicContentUrl(token, data.item.id, true)" external icon="i-lucide-download" class="ml-auto rounded-full" :label="t('drive.download')" />
      </nav>
      <div v-if="isFile" class="flex min-h-[70vh] flex-1 flex-col rounded-2xl bg-[#202124] p-3">
        <DrivePreviewBody class="min-h-0 flex-1" :src="publicContentUrl(token, data.item.id)" :download-href="publicContentUrl(token, data.item.id, true)" :content-type="data.item.contentType" :name="data.item.name" />
      </div>
      <div v-else class="rounded-2xl bg-default p-2">
        <UEmpty v-if="!entries.length" variant="naked" icon="i-lucide-folder-open" :title="t('drive.empty')" />
        <div v-for="entry in entries" :key="entry.id" class="flex items-center gap-4 rounded-lg px-3 text-sm hover:bg-elevated">
          <NuxtLink :to="{ query: { item: entry.id } }" class="flex min-w-0 flex-1 items-center gap-4 py-3 text-left">
            <UIcon :name="driveIconFor(entry).icon" class="size-4 shrink-0" :class="[driveIconFor(entry).className, entry.kind === 'folder' && 'fill-current']" />
            <span class="truncate text-highlighted">{{ entry.name }}</span>
          </NuxtLink>
          <span v-if="entry.kind === 'file'" class="hidden shrink-0 text-muted sm:block">{{ formatDriveSize(entry.size) }}</span>
          <UButton v-if="entry.kind === 'file'" :to="publicContentUrl(token, entry.id, true)" external icon="i-lucide-download" color="neutral" variant="ghost" class="rounded-full" :aria-label="entry.name" />
        </div>
      </div>
    </main>
  </div>
</template>
