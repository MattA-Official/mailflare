<script setup lang="ts">
// One exchange: the user's message, the assistant's work log, its reply and any actions to approve.
// Ported from legacy/src/components/agent/agent-turn.tsx and the action parts of tool-activity.tsx.
import type { AgentDraftAction, AgentMessage, AgentTurn } from '~/types/agent/agent'
import { agentActionProposal, agentEmailLinkHref, draftFromToolContent, formatAgentDuration } from '~/utils/agent/agent-utils'

const props = defineProps<{ turn: AgentTurn, draftActions: AgentDraftAction[], approvingId: string | null }>()
const emit = defineEmits<{ openDraft: [draftId: string], approveDraft: [draftId: string, revision: number], approveAction: [item: AgentMessage] }>()
const { t } = useLanguage()
const workOpen = ref(props.turn.running)
watch(() => props.turn.running, (running) => {
  workOpen.value = running
})
const turnDraftActions = computed(() => props.draftActions.filter(action => props.turn.activity.some(item => item.id === action.messageId)))
const pendingActions = computed(() => props.turn.activity
  .filter(item => item.role === 'tool')
  .map(item => ({ item, proposal: agentActionProposal(item.content) }))
  .filter(({ item, proposal }) => proposal?.status === 'pending_approval' && !draftFromToolContent(item.content)))

function approveLabel(proposal: NonNullable<ReturnType<typeof agentActionProposal>>, item: AgentMessage) {
  if (props.approvingId === item.id) return t('agent.activity.approving')
  if (proposal.action === 'discard_draft') return t('agent.activity.approveDiscard')
  if (proposal.action === 'mark_email_read') return t('agent.activity.approveStatus')
  return t('agent.activity.approveMove', { destination: proposal.destination ?? '' })
}
</script>

<template>
  <div class="space-y-3 py-2">
    <div v-if="turn.user" class="ml-auto w-fit max-w-[90%] whitespace-pre-wrap break-words rounded-2xl bg-primary/10 px-4 py-3 text-sm leading-relaxed text-highlighted">{{ turn.user.content }}</div>
    <div v-if="turn.assistant || turn.activity.length" class="space-y-3">
      <template v-if="turn.running">
        <div v-if="turn.activity.length" class="mt-2 space-y-2 text-xs text-muted">
          <template v-for="item in turn.activity" :key="item.id">
            <p v-if="item.role === 'reasoning'" class="whitespace-pre-wrap break-words pl-5 text-xs text-muted">{{ item.content }}</p>
            <AgentToolActivity v-else :item="item" :force-open="true" />
          </template>
        </div>
      </template>
      <details v-else :open="workOpen" class="group/process text-muted" @toggle="(event) => workOpen = (event.target as HTMLDetailsElement).open">
        <summary class="flex w-fit cursor-pointer list-none items-center gap-1.5 py-1 text-sm [&::-webkit-details-marker]:hidden">
          <UIcon name="i-lucide-clock-3" class="size-3.5 text-dimmed" aria-hidden="true" />
          <span>{{ turn.durationMs !== null ? t('agent.turn.workedFor', { duration: formatAgentDuration(turn.durationMs) }) : t('agent.turn.workDetails') }}</span>
          <UIcon name="i-lucide-chevron-down" class="size-3.5 transition-transform group-open/process:rotate-180" aria-hidden="true" />
        </summary>
        <div class="mt-2 space-y-2 text-xs">
          <template v-if="turn.activity.length">
            <template v-for="item in turn.activity" :key="item.id">
              <p v-if="item.role === 'reasoning'" class="whitespace-pre-wrap break-words pl-5 text-xs text-muted">{{ item.content }}</p>
              <AgentToolActivity v-else :item="item" :force-open="false" />
            </template>
          </template>
          <p v-else class="text-dimmed">{{ t('agent.turn.noDetails') }}</p>
        </div>
      </details>
      <AgentMarkdown v-if="turn.assistant?.content" :content="turn.assistant.content" />
      <div v-for="action in turnDraftActions" :key="action.draftId" class="flex flex-wrap items-center justify-end gap-3 text-xs">
        <UButton variant="link" size="xs" :label="t('agent.activity.editDraft')" @click="emit('openDraft', action.draftId)" />
        <UButton size="sm" :disabled="approvingId === action.draftId" :label="action.scheduledAt ? t('agent.activity.schedule') : t('agent.activity.approveSend')" @click="emit('approveDraft', action.draftId, action.revision)" />
      </div>
      <div v-for="{ item, proposal } in pendingActions" :key="`${item.id}:actions`" class="space-y-2 text-xs">
        <ul v-if="proposal!.emails" class="space-y-1">
          <li v-for="email in proposal!.emails" :key="email.id">
            <NuxtLink :to="agentEmailLinkHref(email)" class="text-primary hover:underline">{{ email.subject || '(No subject)' }}</NuxtLink>
          </li>
        </ul>
        <div class="flex flex-wrap items-center justify-end gap-3">
          <UButton size="sm" :disabled="!item.recordId || approvingId === item.id" :label="approveLabel(proposal!, item)" @click="emit('approveAction', item)" />
        </div>
      </div>
    </div>
  </div>
</template>
