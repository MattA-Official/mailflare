<script setup lang="ts">
// An icon-left status line shared by the domain setup and sending setup lists.
// Ported from legacy/src/app/(admin)/domains/status-row.tsx (StatusRow).
defineProps<{ ok: boolean, title: string, hint: string, tone?: 'red' | 'neutral', rowClass?: string }>()
</script>

<template>
  <li class="grid gap-3 rounded-lg px-4 py-3 text-sm sm:grid-cols-[auto_minmax(8rem,14rem)_minmax(0,1fr)_auto] sm:items-start" :class="rowClass ?? (ok ? 'bg-success/10' : 'bg-error/10')">
    <AdminEmailDomainStatusBadge :ok="ok" :tone="tone" />
    <span class="min-w-0">
      <span class="block font-medium text-highlighted">{{ title }}</span>
      <span class="block text-xs text-muted">{{ hint }}</span>
    </span>
    <span class="min-w-0 break-words text-muted"><slot /></span>
    <span v-if="$slots.action" class="flex flex-wrap items-center gap-2"><slot name="action" /></span>
  </li>
</template>
