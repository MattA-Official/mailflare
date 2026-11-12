<script setup lang="ts">
// The email assistant: a chat about the selected mailbox that streams the agent's replies and tool
// calls, keeps past conversations, queues messages typed while it works, and lets the user review
// drafts and approve actions it proposes. Its settings view configures the mailbox's agent.
// Ported from legacy/src/components/agent/agent-panel.tsx.
import type { ReviewSnapshot } from '~/types/agent/send-review'
import type {
  AgentConversation, AgentConversationsResponse, AgentErrorResponse, AgentEvent, AgentHistoryResponse, AgentJob, AgentJobsResponse,
  AgentMessage, AgentPanelView, AgentSettings, AgentSettingsResponse, QueuedAgentMessage,
} from '~/types/agent/agent'
import { getUserTimeZone } from '#lib/time/utils'
import {
  activeAgentTool, activeAgentToolLabel, appendAgentReasoning, consumeAgentStream, editQueuedAgentMessage, enqueueAgentMessage, groupAgentMessages,
  isAgentScrollAtBottom, markAgentDraftSent, normalizeAgentHistory, readAgentConversationId, removeQueuedAgentMessage, resizeAgentInput,
  saveAgentConversationId, shouldSubmitAgentInput, steerQueuedAgentMessage, uniqueAgentDraftActions,
} from '~/utils/agent/agent-utils'

const props = defineProps<{ open: boolean, fullSize: boolean }>()
const emit = defineEmits<{ close: [], toggleFullSize: [] }>()

const { t } = useLanguage()
const { selectedMailbox } = useSelectedMailbox()
const { openDraftComposer } = useCompose()
const route = useRoute()

const view = ref<AgentPanelView>('chat')
const settings = ref<AgentSettings | null>(null)
const availableModels = ref<string[]>([])
const reviewers = ref<{ id: string, name: string, email: string }[]>([])
const canManage = ref(false)
const providerConfigured = ref(false)
const autoReplyEnabled = ref(false)
const conversationId = ref<string | null>(null)
const deletingConversationId = ref<string | null>(null)
const conversations = ref<AgentConversation[]>([])
const messages = ref<AgentMessage[]>([])
const loadingConversation = ref(false)
const jobs = ref<AgentJob[]>([])
const input = ref('')
const queuedMessages = ref<QueuedAgentMessage[]>([])
const busy = ref(false)
const error = ref<string | null>(null)
const approvingId = ref<string | null>(null)
const draftReview = ref<{ approvalId: string, snapshot: ReviewSnapshot, draftId: string } | null>(null)
const menuOpen = ref(false)
const chatScroll = useTemplateRef<HTMLDivElement>('chatScroll')
const inputRef = useTemplateRef<HTMLTextAreaElement>('inputRef')

// Plain variables for state the async send loop reads after awaits, like upstream's refs.
let controller: AbortController | null = null
let running = false
let queueGeneration = 0
let stickToBottom = true
let selectedConversation: string | null = null

const mailboxId = computed(() => selectedMailbox.value?.id)
const selectedMessageId = computed(() => route.path.match(/^\/(?:inbox|sent|archived|spam|trash|starred|snoozed|folders\/[^/]+)\/([^/]+)/)?.[1] ?? null)
const openEmailSubjects = ref<Record<string, string>>({})
const dismissedMessageId = ref<string | null>(null)
// Queued messages send later, so they read the email that is open at that moment.
const openEmailId = computed(() => selectedMessageId.value && selectedMessageId.value in openEmailSubjects.value && selectedMessageId.value !== dismissedMessageId.value ? selectedMessageId.value : null)

const welcomePrompts = computed(() => {
  const id = selectedMessageId.value
  return id
    ? [
        { label: t('agent.welcome.sumThis'), detail: t('agent.welcome.sumThisDetail'), prompt: `Read the thread containing email ${id} and summarize its key points.`, icon: 'i-lucide-file-text' },
        { label: t('agent.welcome.reply'), detail: t('agent.welcome.replyDetail'), prompt: `Read the thread containing email ${id} and draft a reply.`, icon: 'i-lucide-pen-line' },
        { label: t('agent.welcome.actionsThis'), detail: t('agent.welcome.actionsThisDetail'), prompt: `Read the thread containing email ${id} and list the action items.`, icon: 'i-lucide-list-checks' },
      ]
    : [
        { label: t('agent.welcome.sumRecent'), detail: t('agent.welcome.sumRecentDetail'), prompt: 'Summarize my recent email in this mailbox.', icon: 'i-lucide-file-text' },
        { label: t('agent.welcome.reply'), detail: t('agent.welcome.replyDetail'), prompt: 'Read my latest email and draft a reply.', icon: 'i-lucide-pen-line' },
        { label: t('agent.welcome.actions'), detail: t('agent.welcome.actionsDetail'), prompt: 'Find action items in my recent email.', icon: 'i-lucide-list-checks' },
      ]
})

async function readError(response: Response, fallback: string) {
  const data = await response.json().catch(() => ({})) as AgentErrorResponse
  return data.error || fallback
}

async function refresh() {
  const id = mailboxId.value
  if (!id) return
  const query = `mailboxId=${encodeURIComponent(id)}`
  const [settingsResponse, conversationsResponse, jobsResponse] = await Promise.all([
    authFetch(`/api/agent/settings?${query}`),
    authFetch(`/api/agent/conversations?${query}`),
    authFetch(`/api/agent/jobs?${query}`),
  ])
  if (!settingsResponse.ok) {
    error.value = await readError(settingsResponse, t('agent.panel.settingsLoadFailed'))
    return
  }
  const data = await settingsResponse.json() as AgentSettingsResponse
  settings.value = data.settings
  availableModels.value = data.models ?? []
  canManage.value = data.canManage
  providerConfigured.value = data.providerConfigured
  autoReplyEnabled.value = data.autoReplyEnabled
  reviewers.value = data.reviewers ?? []
  if (conversationsResponse.ok) conversations.value = ((await conversationsResponse.json()) as AgentConversationsResponse).conversations ?? []
  if (jobsResponse.ok) jobs.value = ((await jobsResponse.json()) as AgentJobsResponse).jobs ?? []
}

watch([selectedMessageId, mailboxId], async ([messageId, id]) => {
  if (!messageId || !id || messageId in openEmailSubjects.value) return
  try {
    const data = await api<{ message?: { mailboxId?: string, subject?: string | null } }>(`/api/messages/${encodeURIComponent(messageId)}`)
    if (data?.message?.mailboxId === id) openEmailSubjects.value = { ...openEmailSubjects.value, [messageId]: data.message.subject ?? '' }
  } catch { /* the chip is optional */ }
}, { immediate: true })

/** Stops any running reply and drops the queue. */
function resetRun() {
  controller?.abort()
  controller = null
  running = false
  queueGeneration += 1
  queuedMessages.value = []
  busy.value = false
}

function startNewChat() {
  resetRun()
  selectedConversation = null
  stickToBottom = true
  if (mailboxId.value) saveAgentConversationId(mailboxId.value, null)
  conversationId.value = null
  messages.value = []
  loadingConversation.value = false
  input.value = ''
  view.value = 'chat'
  menuOpen.value = false
}

let openGeneration = 0
watch([mailboxId, () => props.open], async ([id, open]) => {
  resetRun()
  const generation = ++openGeneration
  if (!open || !id) return
  stickToBottom = true
  conversationId.value = null
  messages.value = []
  settings.value = null
  view.value = 'chat'
  menuOpen.value = false
  error.value = null
  refresh().catch(() => {
    if (generation === openGeneration) error.value = t('agent.panel.settingsLoadFailed')
  })
  const savedId = readAgentConversationId(id)
  selectedConversation = savedId
  loadingConversation.value = !!savedId
  if (!savedId) return
  try {
    const response = await authFetch(`/api/agent/conversations/${encodeURIComponent(savedId)}?mailboxId=${encodeURIComponent(id)}`)
    if (generation !== openGeneration || selectedConversation !== savedId) return
    if (!response.ok) {
      saveAgentConversationId(id, null)
      selectedConversation = null
      return
    }
    const history = await response.json() as AgentHistoryResponse
    if (generation !== openGeneration || selectedConversation !== savedId) return
    conversationId.value = savedId
    messages.value = normalizeAgentHistory(history.messages ?? [])
  } catch { /* start a new chat instead */ } finally {
    if (generation === openGeneration && selectedConversation === savedId) loadingConversation.value = false
  }
}, { immediate: true })
onBeforeUnmount(() => controller?.abort())

watch([input, view], () => nextTick(() => resizeAgentInput(inputRef.value)), { immediate: true })

watch([messages, busy, loadingConversation, view, () => props.fullSize], () => nextTick(() => {
  const container = chatScroll.value
  if (container && stickToBottom) container.scrollTop = container.scrollHeight
}), { deep: true })

function onAgentDraft(event: Event) {
  const data = (event as CustomEvent<{ mailboxId: string }>).detail
  if (props.open && data?.mailboxId === mailboxId.value) void refresh()
}
let poll: ReturnType<typeof setInterval> | undefined
watch(() => props.open, (open) => {
  clearInterval(poll)
  if (open) poll = setInterval(() => void refresh(), 30_000)
}, { immediate: true })
onMounted(() => window.addEventListener('mailflare:agent-draft', onAgentDraft))
onBeforeUnmount(() => {
  window.removeEventListener('mailflare:agent-draft', onAgentDraft)
  clearInterval(poll)
})

async function selectConversation(id: string) {
  const mailbox = mailboxId.value
  if (!mailbox) return
  resetRun()
  selectedConversation = id
  stickToBottom = true
  saveAgentConversationId(mailbox, id)
  conversationId.value = id
  messages.value = []
  loadingConversation.value = true
  view.value = 'chat'
  menuOpen.value = false
  try {
    const response = await authFetch(`/api/agent/conversations/${id}?mailboxId=${encodeURIComponent(mailbox)}`)
    if (!response.ok) throw new Error(t('agent.panel.conversationLoadFailed'))
    const history = await response.json() as AgentHistoryResponse
    if (selectedConversation === id) messages.value = normalizeAgentHistory(history.messages ?? [])
  } catch (cause) {
    if (selectedConversation === id) error.value = cause instanceof Error ? cause.message : t('agent.panel.conversationLoadFailed')
  } finally {
    if (selectedConversation === id) loadingConversation.value = false
  }
}

async function deleteConversation(id: string) {
  if (deletingConversationId.value) return
  deletingConversationId.value = id
  try {
    const response = await authFetch(`/api/agent/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!response.ok) throw new Error(t('agent.panel.conversationDeleteFailed'))
    conversations.value = conversations.value.filter(item => item.id !== id)
    if (selectedConversation === id || conversationId.value === id) {
      resetRun()
      selectedConversation = null
      if (mailboxId.value) saveAgentConversationId(mailboxId.value, null)
      conversationId.value = null
      messages.value = []
      loadingConversation.value = false
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('agent.panel.conversationDeleteFailed')
  } finally {
    deletingConversationId.value = null
  }
}

function patchMessage(id: string, patch: (item: AgentMessage) => AgentMessage) {
  messages.value = messages.value.map(item => item.id === id ? patch(item) : item)
}

function adoptConversation(mailbox: string, id: string) {
  selectedConversation = id
  saveAgentConversationId(mailbox, id)
  conversationId.value = id
}

async function send(text: string, queued?: QueuedAgentMessage) {
  const mailbox = mailboxId.value
  if (!mailbox || !text.trim() || running || loadingConversation.value) return
  const current = new AbortController()
  const generation = queueGeneration
  const userMessageId = crypto.randomUUID()
  const assistantMessageId = crypto.randomUUID()
  const startedAt = Date.now()
  let accepted = false
  let streamErrored = false
  controller = current
  running = true
  busy.value = true
  error.value = null
  messages.value = [...messages.value, { id: userMessageId, role: 'user', content: text, createdAt: new Date(startedAt).toISOString() }, { id: assistantMessageId, role: 'assistant', content: '', pending: true }]
  const finish = () => patchMessage(assistantMessageId, item => ({ ...item, pending: false, durationMs: Date.now() - startedAt, createdAt: new Date().toISOString() }))
  try {
    const response = await authFetch('/api/agent/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mailboxId: mailbox, ...(selectedConversation ? { conversationId: selectedConversation } : {}), ...(openEmailId.value ? { currentMessageId: openEmailId.value } : {}), text, timeZone: getUserTimeZone() }),
      signal: current.signal,
    })
    if (!response.ok) throw new Error(await readError(response, t('agent.panel.unavailable')))
    accepted = true
    const responseConversationId = response.headers.get('X-Conversation-Id')
    if (responseConversationId && generation === queueGeneration) adoptConversation(mailbox, responseConversationId)
    await consumeAgentStream(response, (event: AgentEvent) => {
      if (generation !== queueGeneration) return
      if (event.type === 'conversation') adoptConversation(mailbox, event.conversationId)
      if (event.type === 'text') patchMessage(assistantMessageId, item => ({ ...item, content: item.content + event.text }))
      if (event.type === 'reasoning') messages.value = appendAgentReasoning(messages.value, assistantMessageId, event.text)
      if (event.type === 'reclassify') messages.value = appendAgentReasoning(messages.value, assistantMessageId, event.text, true)
      if (event.type === 'tool') {
        const toolId = `${assistantMessageId}:tool:${event.id}`
        const content = event.state === 'running' ? '' : typeof event.result === 'string' ? event.result : JSON.stringify(event.result) ?? ''
        const toolState = event.state === 'running' ? 'running' : event.state === 'failed' ? 'failed' : 'used'
        messages.value = messages.value.some(item => item.id === toolId)
          ? messages.value.map(item => item.id === toolId ? { ...item, toolState, content, recordId: event.recordId } : item)
          : [...messages.value, { id: toolId, role: 'tool', toolName: event.name, toolState, content, recordId: event.recordId }]
      }
      if (event.type === 'error') {
        streamErrored = true
        error.value = event.message
      }
    })
    if (generation === queueGeneration) {
      finish()
      void refresh()
    }
  } catch (cause) {
    if (generation !== queueGeneration) return
    if (!accepted) {
      messages.value = messages.value.filter(item => item.id !== userMessageId && item.id !== assistantMessageId)
      if (!current.signal.aborted) {
        if (queued) queuedMessages.value = [queued, ...queuedMessages.value]
        else input.value = input.value || text
      }
    } else {
      finish()
    }
    if (!current.signal.aborted) error.value = cause instanceof Error ? cause.message : t('agent.panel.failed')
    streamErrored = !current.signal.aborted
  } finally {
    if (controller === current) {
      controller = null
      running = false
      busy.value = false
      if (generation === queueGeneration && !streamErrored) sendNextQueued()
    }
  }
}

function sendNextQueued() {
  const [next, ...remaining] = queuedMessages.value
  if (!next) return
  queuedMessages.value = remaining
  void send(next.text, next)
}

function submitMessage(text: string) {
  if (!mailboxId.value || !text.trim() || !settings.value || !providerConfigured.value || loadingConversation.value) return
  input.value = ''
  if (running || queuedMessages.value.length) {
    queuedMessages.value = enqueueAgentMessage(queuedMessages.value, text)
    if (!running) sendNextQueued()
    return
  }
  void send(text.trim())
}

function onInputKeydown(event: KeyboardEvent) {
  if (!shouldSubmitAgentInput(event)) return
  event.preventDefault()
  submitMessage(input.value)
}

function steer(id: string) {
  queuedMessages.value = steerQueuedAgentMessage(queuedMessages.value, id)
  // Stopping the running reply lets the steered message go next.
  if (running) controller?.abort()
  else sendNextQueued()
}

async function saveSettings() {
  if (!settings.value) return
  busy.value = true
  error.value = null
  try {
    const response = await authFetch('/api/agent/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings.value) })
    if (!response.ok) throw new Error(await readError(response, t('agent.panel.saveFailed')))
    await refresh()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('agent.panel.saveFailed')
  } finally {
    busy.value = false
  }
}

async function retryJob(id: string) {
  const response = await authFetch(`/api/agent/jobs/${id}/retry`, { method: 'POST' })
  if (response.ok) await refresh()
  else error.value = await readError(response, t('agent.panel.retryFailed'))
}

async function discardJobDraft(draftId: string) {
  const response = await authFetch(`/api/drafts/${encodeURIComponent(draftId)}`, { method: 'DELETE' })
  if (response.ok) await refresh()
  else error.value = await readError(response, t('agent.panel.discardFailed'))
}

async function startDraftReview(draftId: string, revision: number) {
  approvingId.value = draftId
  error.value = null
  try {
    const result = await api<{ approvalId?: string, snapshot?: ReviewSnapshot }>('/api/agent/approvals', { method: 'POST', body: { draftId, expectedRevision: revision } })
    if (!result?.approvalId || !result.snapshot) throw new Error(t('agent.panel.reviewFailed'))
    draftReview.value = { approvalId: result.approvalId, snapshot: result.snapshot, draftId }
  } catch (cause) {
    error.value = cause instanceof Error && cause.message ? cause.message : t('agent.panel.reviewFailed')
  } finally {
    approvingId.value = null
  }
}

async function confirmAction(item: AgentMessage) {
  if (!item.recordId) return
  approvingId.value = item.id
  error.value = null
  try {
    const result = await api<Record<string, unknown>>('/api/agent/actions/confirm', { method: 'POST', body: { toolMessageId: item.recordId } })
    patchMessage(item.id, message => ({ ...message, content: JSON.stringify(result) }))
    window.dispatchEvent(new Event('mailflare:messages-changed'))
  } catch (cause) {
    error.value = cause instanceof Error && cause.message ? cause.message : t('agent.panel.approveFailed')
  } finally {
    approvingId.value = null
  }
}

function onDraftSent() {
  const review = draftReview.value
  if (review) messages.value = markAgentDraftSent(messages.value, review.draftId)
  draftReview.value = null
  void refresh()
}

const turns = computed(() => groupAgentMessages(messages.value))
const draftActions = computed(() => uniqueAgentDraftActions(messages.value))
const activeTool = computed(() => busy.value ? activeAgentTool(messages.value) : null)
const readyJobs = computed(() => jobs.value.filter(job => job.status === 'completed' && job.draftId).slice(0, 5))
const problemJobs = computed(() => jobs.value.filter(job => job.status === 'failed' || job.status === 'skipped').slice(0, 5))
const inputDisabled = computed(() => !settings.value || !providerConfigured.value || loadingConversation.value)
const reviewerItems = computed(() => reviewers.value.map(reviewer => ({ label: `${reviewer.name} (${reviewer.email})`, value: reviewer.id })))
const modelItems = computed(() => availableModels.value.map(model => ({ label: model, value: model })))
</script>

<template>
  <section id="email-assistant-panel" class="flex size-full min-w-0 flex-col overflow-hidden bg-default text-default" :aria-label="t('agent.panel.label')">
    <header class="flex h-(--ui-header-height) shrink-0 items-center justify-between gap-2 border-b border-default pl-4 pr-2">
      <div class="flex min-w-0 items-center gap-2.5">
        <UButton
          v-if="view === 'settings'"
          icon="i-lucide-arrow-left"
          color="neutral"
          variant="ghost"
          class="-ml-2"
          :aria-label="t('agent.panel.backToAssistant')"
          :title="t('agent.panel.backToAssistant')"
          @click="view = 'chat'"
        />
        <UIcon v-else name="i-lucide-sparkles" class="size-5 shrink-0 text-primary" aria-hidden="true" />
        <strong class="block truncate text-sm font-semibold">{{ view === 'settings' ? t('agent.panel.settings') : t('agent.panel.assistant') }}</strong>
      </div>
      <div class="flex shrink-0 items-center gap-0.5">
        <UPopover v-model:open="menuOpen" :content="{ align: 'end' }">
          <UButton icon="i-lucide-settings-2" :color="view === 'settings' ? 'primary' : 'neutral'" variant="ghost" :aria-label="t('agent.panel.menuLabel')" />
          <template #content>
            <div class="flex w-72 flex-col py-2 text-sm">
              <button type="button" class="flex items-center gap-2 px-4 py-2 text-left hover:bg-elevated" @click="startNewChat">
                <UIcon name="i-lucide-plus" class="size-4" /> {{ t('agent.panel.newChat') }}
              </button>
              <USeparator class="my-2 px-3" />
              <template v-if="conversations.length">
                <p class="px-4 pb-1 text-xs font-medium text-muted">{{ t('agent.panel.previousChats') }}</p>
                <div class="max-h-64 overflow-y-auto">
                  <div v-for="item in conversations" :key="item.id" class="group flex items-center hover:bg-elevated" :class="conversationId === item.id ? 'bg-primary/10 text-primary' : ''">
                    <button type="button" class="min-w-0 flex-1 truncate py-2 pl-4 pr-2 text-left" @click="selectConversation(item.id)">{{ item.title }}</button>
                    <UButton
                      icon="i-lucide-trash-2"
                      color="error"
                      variant="ghost"
                      size="sm"
                      class="mr-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                      :aria-label="t('agent.panel.deleteChatLabel', { title: item.title })"
                      :title="t('agent.panel.deleteChat')"
                      :disabled="deletingConversationId !== null"
                      @click="deleteConversation(item.id)"
                    />
                  </div>
                </div>
              </template>
              <p v-else class="px-4 py-3 text-muted">{{ t('agent.panel.noChats') }}</p>
              <USeparator class="my-2 px-3" />
              <button type="button" class="flex items-center gap-2 px-4 py-2 text-left hover:bg-elevated" @click="view = view === 'settings' ? 'chat' : 'settings'; menuOpen = false">
                <UIcon name="i-lucide-settings-2" class="size-4" /> {{ view === 'settings' ? t('agent.panel.backToChat') : t('agent.panel.settings') }}
              </button>
            </div>
          </template>
        </UPopover>
        <UButton
          :icon="fullSize ? 'i-lucide-minimize-2' : 'i-lucide-maximize-2'"
          color="neutral"
          variant="ghost"
          :aria-label="fullSize ? t('agent.panel.exitFull') : t('agent.panel.expandFull')"
          :aria-pressed="fullSize"
          :title="fullSize ? t('agent.panel.exitFullTitle') : t('agent.panel.fullTitle')"
          @click="emit('toggleFullSize')"
        />
        <UButton icon="i-lucide-x" color="neutral" variant="ghost" :aria-label="t('agent.panel.close')" @click="emit('close')" />
      </div>
    </header>

    <p v-if="error" role="alert" class="mx-4 mt-3 break-words rounded-xl border border-error/20 bg-error/10 p-3 text-sm text-error">{{ error }}</p>

    <template v-if="view === 'chat'">
      <div ref="chatScroll" class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 text-sm sm:px-5" @scroll="stickToBottom = isAgentScrollAtBottom($event.target as HTMLElement)">
        <div class="mx-auto max-w-3xl space-y-5">
          <p v-if="settings && !providerConfigured" class="rounded-2xl border border-warning/20 bg-warning/10 p-3 text-warning">{{ t('agent.panel.configureProvider') }}</p>
          <AgentConversationSkeleton v-if="loadingConversation" />
          <div v-if="!loadingConversation && !messages.length && settings" class="pt-3">
            <p class="agent-welcome-heading mt-1 text-2xl font-medium leading-tight text-highlighted">{{ t('agent.panel.welcome') }}</p>
            <div class="mt-7 space-y-2">
              <button
                v-for="item in welcomePrompts"
                :key="item.label"
                type="button"
                class="agent-welcome-prompt flex w-full items-center gap-3 rounded-2xl bg-elevated px-3 py-3 text-left transition-colors hover:bg-accented disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="!providerConfigured || busy"
                @click="submitMessage(item.prompt)"
              >
                <span class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-default text-highlighted"><UIcon :name="item.icon" class="size-[18px]" /></span>
                <span class="min-w-0">
                  <span class="block font-medium text-highlighted">{{ item.label }}</span>
                  <span class="block text-xs text-muted">{{ item.detail }}</span>
                </span>
              </button>
            </div>
          </div>
          <AgentTurn
            v-for="turn in turns"
            :key="turn.id"
            :turn="turn"
            :draft-actions="draftActions"
            :approving-id="approvingId"
            @open-draft="openDraftComposer"
            @approve-draft="startDraftReview"
            @approve-action="confirmAction"
          />
          <div v-for="job in readyJobs" :key="job.id" class="rounded-2xl border border-default p-3">
            <p>{{ t('agent.panel.autoDraftReady') }}</p>
            <div class="mt-2 flex gap-3">
              <UButton variant="link" size="sm" class="px-0" :label="t('agent.panel.openDraft')" @click="openDraftComposer(job.draftId!)" />
              <UButton variant="link" size="sm" class="px-0" :disabled="busy" :label="t('agent.panel.regenerate')" @click="submitMessage(`Read the thread containing email ${job.sourceMessageId} and draft another reply. Preserve the existing draft.`)" />
              <UButton variant="link" color="error" size="sm" class="px-0" :label="t('agent.panel.discard')" @click="discardJobDraft(job.draftId!)" />
            </div>
          </div>
        </div>
      </div>
      <AgentQueuedMessages
        :messages="queuedMessages"
        :running="busy"
        @remove="(id) => queuedMessages = removeQueuedAgentMessage(queuedMessages, id)"
        @edit="(id, text) => queuedMessages = editQueuedAgentMessage(queuedMessages, id, text)"
        @steer="steer"
      />
      <div v-if="busy" role="status" aria-live="polite" class="mx-auto w-full max-w-3xl space-y-1 px-5 py-2 text-sm text-muted">
        <div v-if="activeTool" class="flex items-center gap-2"><UIcon name="i-lucide-loader-circle" class="size-3.5 shrink-0 animate-spin" aria-hidden="true" /><span>{{ activeAgentToolLabel(activeTool.toolName, t) }}</span></div>
        <div class="flex items-center gap-2"><UIcon name="i-lucide-loader-circle" class="size-3.5 shrink-0 animate-spin" aria-hidden="true" /><span>{{ t('agent.panel.working') }}</span></div>
      </div>
      <div v-if="openEmailId" class="mx-auto flex w-full max-w-3xl px-4 pb-1.5">
        <span class="inline-flex max-w-full items-center gap-1.5 rounded-full bg-elevated py-1 pl-3 pr-1 text-xs text-muted">
          <UIcon name="i-lucide-file-text" class="size-3 shrink-0" aria-hidden="true" />
          <span class="truncate">{{ t('agent.panel.currentEmail', { subject: openEmailSubjects[openEmailId] || t('list.noSubject') }) }}</span>
          <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="xs" class="rounded-full" :aria-label="t('agent.panel.removeCurrentEmail')" :title="t('agent.panel.removeCurrentEmail')" @click="dismissedMessageId = openEmailId" />
        </span>
      </div>
      <form class="relative mx-auto w-full max-w-3xl px-3 pb-2" @submit.prevent="submitMessage(input)">
        <textarea
          ref="inputRef"
          v-model="input"
          rows="1"
          name="message"
          class="block w-full resize-none rounded-3xl bg-primary/5 px-4 py-3 pr-14 text-sm leading-5 text-highlighted outline-none placeholder:text-dimmed focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-50"
          :placeholder="t('agent.panel.promptPlaceholder')"
          :disabled="inputDisabled"
          @keydown="onInputKeydown"
        />
        <div class="absolute bottom-3.5 right-5 flex justify-end gap-2">
          <UButton v-if="busy" icon="i-lucide-pause" color="neutral" variant="soft" size="sm" class="rounded-full" :aria-label="t('agent.panel.stop')" :title="t('agent.panel.stop')" @click="controller?.abort()" />
          <UButton v-else type="submit" icon="i-lucide-send" color="neutral" variant="ghost" size="sm" :disabled="!input.trim() || inputDisabled" :aria-label="t('agent.panel.send')" :title="t('agent.panel.send')" />
        </div>
      </form>
    </template>

    <div v-else class="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 text-sm">
      <p v-if="!canManage">{{ t('agent.panel.needPermission') }}</p>
      <template v-if="settings">
        <UFormField :label="t('agent.panel.reviewer')">
          <USelect v-model="settings.reviewerUserId as string" :items="reviewerItems" class="w-full" :disabled="!canManage" />
        </UFormField>
        <UFormField :label="t('agent.panel.model')">
          <USelect v-model="settings.modelId as string" :items="modelItems" class="w-full" :disabled="!canManage || !availableModels.length" :placeholder="availableModels.length ? undefined : t('agent.panel.noModels')" />
        </UFormField>
        <div class="flex items-center justify-between gap-3">
          <span>{{ t('agent.panel.autoDraft') }}</span>
          <USwitch v-model="settings.autoDraftEnabled" :disabled="!canManage || autoReplyEnabled" :aria-label="t('agent.panel.autoDraft')" />
        </div>
        <p v-if="autoReplyEnabled" class="text-warning">{{ t('agent.panel.disableOoo') }}</p>
        <UFormField :label="t('agent.panel.instructions')">
          <UTextarea v-model="settings.instructions" :rows="6" class="w-full" :disabled="!canManage" />
        </UFormField>
        <UFormField :label="t('agent.panel.dailyLimit')">
          <UInputNumber v-model="settings.dailyLimit" :min="1" :max="100" class="w-full" :disabled="!canManage" />
        </UFormField>
        <UButton size="sm" :disabled="!canManage || busy" :label="t('agent.panel.save')" @click="saveSettings" />
      </template>
      <p class="text-xs text-muted">{{ t('agent.panel.privacy') }}</p>
      <p v-for="job in problemJobs" :key="job.id" class="text-xs">
        {{ job.status }}: {{ job.reason }}
        <UButton v-if="job.status === 'failed'" variant="link" size="xs" :label="t('agent.panel.retry')" @click="retryJob(job.id)" />
      </p>
    </div>

    <AgentSendReview v-if="draftReview" :approval-id="draftReview.approvalId" :snapshot="draftReview.snapshot" @close="draftReview = null" @sent="onDraftSent" />
  </section>
</template>

<style scoped>
@keyframes agent-welcome-enter {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
.agent-welcome-heading, .agent-welcome-prompt { animation: agent-welcome-enter 360ms ease-out both; }
.agent-welcome-prompt:nth-child(1) { animation-delay: 100ms; }
.agent-welcome-prompt:nth-child(2) { animation-delay: 200ms; }
.agent-welcome-prompt:nth-child(3) { animation-delay: 300ms; }
@media (prefers-reduced-motion: reduce) {
  .agent-welcome-heading, .agent-welcome-prompt { animation: none; }
}
</style>
