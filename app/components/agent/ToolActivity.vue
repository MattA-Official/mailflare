<script setup lang="ts">
// One tool call in a turn's work log: what it did, and the emails or fields it returned.
// Ported from AgentToolActivity in legacy/src/components/agent/tool-activity.tsx.
import type { AgentMessage } from '~/types/agent/agent'
import { agentEmailLinkHref, agentEmailReferences, agentToolLabel, parseAgentToolContent } from '~/utils/agent/agent-utils'

const props = defineProps<{ item: AgentMessage, forceOpen: boolean }>()
const { t } = useLanguage()
const open = ref(props.forceOpen)
watch(() => props.forceOpen, (value) => {
  open.value = value
})
const HIDDEN_KEYS = ['emails', 'text', 'attachments', 'result', 'id', 'subject', 'from', 'snippet', 'url', 'reviewUrl', 'action', 'status']
const display = computed(() => agentToolLabel(props.item.toolName, props.item.toolState, props.item.content, t))
const result = computed(() => parseAgentToolContent(props.item.content))
const emails = computed(() => result.value ? agentEmailReferences(result.value) : [])
const fields = computed(() => Object.entries(result.value ?? {}).filter(([key, value]) => !HIDDEN_KEYS.includes(key) && value !== null && typeof value !== 'object'))
const attachments = computed(() => Array.isArray(result.value?.attachments) ? result.value.attachments as { filename?: string }[] : [])
</script>

<template>
  <UCollapsible :open="forceOpen || open" class="text-xs text-muted" @update:open="value => { if (!forceOpen) open = value }">
    <UButton
      color="neutral"
      variant="link"
      icon="i-lucide-wrench"
      trailing-icon="i-lucide-chevron-down"
      :label="display.label"
      block
      class="p-0"
      :ui="{ label: 'flex-1 truncate text-start', leadingIcon: 'size-3.5 text-dimmed', trailingIcon: 'size-3.5 text-dimmed transition-transform group-data-[state=open]:rotate-180' }"
    />
    <template #content>
      <div class="mt-1.5 space-y-2 pl-[18px]">
      <p>{{ display.description }}</p>
      <ul v-if="emails.length" class="space-y-1.5">
        <li v-for="email in emails" :key="email.id" class="break-words">
          <ULink :to="agentEmailLinkHref(email)" class="font-medium text-primary hover:underline">{{ email.subject || '(No subject)' }}</ULink>
          <span v-if="email.from" class="text-dimmed"> · {{ email.from }}</span>
          <p v-if="email.snippet" class="line-clamp-2 text-dimmed">{{ email.snippet }}</p>
        </li>
      </ul>
      <p v-for="[key, value] in fields" :key="key" class="break-words"><span class="text-dimmed">{{ key.replace(/([A-Z])/g, ' $1') }}: </span>{{ String(value) }}</p>
      <p v-if="typeof result?.text === 'string'" class="max-h-36 overflow-y-auto whitespace-pre-wrap break-words">{{ result.text }}</p>
      <p v-if="attachments.length">{{ t('agent.activity.attachments', { list: attachments.map(file => file.filename || t('agent.activity.attachment')).join(', ') }) }}</p>
      <p v-if="!result && item.content" class="whitespace-pre-wrap break-words">{{ item.content }}</p>
      </div>
    </template>
  </UCollapsible>
</template>
