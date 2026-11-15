<script setup lang="ts">
// Earlier messages quoted in a plain-text body, folded one inside another.
// Ported from legacy/src/components/previous-message.tsx.
import type { QuotedEmailContent } from '#lib/email/reply-content-types'

defineProps<{ message: QuotedEmailContent }>()
const { t } = useLanguage()
</script>

<template>
  <UCollapsible class="mt-4 border-l-2 border-default pl-4">
    <UButton
      color="neutral"
      variant="link"
      size="xs"
      icon="i-lucide-chevron-right"
      :label="t(message.direction === 'sent' ? 'message.previous.sent' : 'message.previous.received', { date: message.dateLine })"
      class="px-0 py-2"
      :ui="{ leadingIcon: 'size-3.5 transition-transform group-data-[state=open]:rotate-90' }"
    />
    <template #content>
      <div class="pb-2 pl-5 text-toned">
      <pre v-if="message.content" class="whitespace-pre-wrap font-sans text-sm">{{ message.content }}</pre>
      <MessagesPreviousMessage
        v-for="(nested, index) in message.quotedContent"
        :key="`${nested.dateLine}-${nested.content.slice(0, 24)}-${index}`"
        :message="nested"
        />
      </div>
    </template>
  </UCollapsible>
</template>
