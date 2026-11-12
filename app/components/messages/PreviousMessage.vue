<script setup lang="ts">
// Earlier messages quoted in a plain-text body, folded one inside another.
// Ported from legacy/src/components/previous-message.tsx.
import type { QuotedEmailContent } from '#lib/email/reply-content-types'

defineProps<{ message: QuotedEmailContent }>()
const { t } = useLanguage()
</script>

<template>
  <details class="group mt-4 border-l-2 border-default pl-4">
    <summary class="flex cursor-pointer list-none items-center gap-2 rounded-md py-2 text-xs font-medium text-muted hover:text-highlighted">
      <UIcon name="i-lucide-chevron-right" class="size-3.5 shrink-0 transition-transform group-open:rotate-90" />
      <span>{{ t(message.direction === 'sent' ? 'message.previous.sent' : 'message.previous.received', { date: message.dateLine }) }}</span>
    </summary>
    <div class="pb-2 pl-5 text-toned">
      <pre v-if="message.content" class="whitespace-pre-wrap font-sans text-sm">{{ message.content }}</pre>
      <MessagesPreviousMessage
        v-for="(nested, index) in message.quotedContent"
        :key="`${nested.dateLine}-${nested.content.slice(0, 24)}-${index}`"
        :message="nested"
      />
    </div>
  </details>
</template>
