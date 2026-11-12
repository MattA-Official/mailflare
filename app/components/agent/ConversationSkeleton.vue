<script setup lang="ts">
// Placeholder while a saved conversation loads. Ported from legacy/src/components/agent/conversation-skeleton.tsx.
const { t } = useLanguage()
</script>

<template>
  <div role="status" :aria-label="t('agent.loadingConversation')" class="space-y-6 py-2">
    <div class="flex justify-end"><USkeleton class="h-12 w-3/5 max-w-72 rounded-2xl bg-primary/15" /></div>
    <div class="space-y-3">
      <USkeleton class="h-3 w-24" /><USkeleton class="h-4 w-full" /><USkeleton class="h-4 w-11/12" /><USkeleton class="h-4 w-3/4" />
    </div>
    <div class="flex justify-end"><USkeleton class="h-12 w-1/2 max-w-60 rounded-2xl bg-primary/15" /></div>
    <div class="space-y-3">
      <USkeleton class="h-3 w-24" /><USkeleton class="h-4 w-5/6" /><USkeleton class="h-4 w-2/3" />
    </div>
  </div>
</template>
