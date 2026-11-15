<script setup lang="ts">
// A collapsible sidebar section with a remembered open state (upstream nav-section-header). In the
// icon rail the label is hidden and the content always shows.
const props = defineProps<{ label?: string, storageKey?: string, collapsed?: boolean }>()
const open = ref(true)

onMounted(() => {
  if (!props.storageKey) return
  try {
    const raw = localStorage.getItem(props.storageKey)
    if (raw !== null) open.value = JSON.parse(raw) !== false
  } catch {
    // Keep it open.
  }
})

function toggle() {
  open.value = !open.value
  if (!props.storageKey) return
  try {
    localStorage.setItem(props.storageKey, JSON.stringify(open.value))
  } catch {
    // Storage can be unavailable in private windows.
  }
}
</script>

<template>
  <section class="flex flex-col gap-px">
    <USeparator v-if="collapsed && label" class="my-2" />
    <div v-if="!collapsed && label" class="mt-2 flex h-8 items-center gap-1">
      <UButton
        color="neutral"
        variant="link"
        size="xs"
        icon="i-lucide-chevron-right"
        :label="label"
        :aria-expanded="open"
        class="min-w-0 flex-1 px-2.5 font-semibold uppercase tracking-wide"
        :ui="{ leadingIcon: ['size-3.5 transition-transform', open && 'rotate-90'] }"
        @click="toggle"
      />
      <slot name="actions" />
    </div>
    <template v-if="collapsed || !label || open">
      <slot />
    </template>
  </section>
</template>
