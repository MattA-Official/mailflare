<script setup lang="ts">
// The send toast: undo countdown, delivery status poll and the subject link, ported from
// ComposeNoticeToast in legacy/src/components/compose/floating-composer.tsx. Nuxt UI's useToast
// cannot host a live countdown with a link inside the text, so this stays custom markup.
import type { ComposeNotice, ComposeNoticeAction } from '~/types/compose/notice'

const STATUS_POLL_MS = 1000

const props = defineProps<{ notice: ComposeNotice }>()

const now = ref(Date.now())
const pendingAction = ref<string | null>(null)
let countdownEnded = false
let countdownTimer: number | undefined
let pollTimer: number | undefined
let cancelled = false

const secondsLeft = computed(() => props.notice.countdown ? Math.max(0, Math.ceil((props.notice.countdown.endAt - now.value) / 1000)) : null)
const ticker = computed(() => props.notice.parts?.ticker && secondsLeft.value !== null ? props.notice.parts.ticker(secondsLeft.value) : null)

watch(now, (value) => {
  const { countdown, onCountdownEnd } = props.notice
  if (!countdown || !onCountdownEnd || countdownEnded || value < countdown.endAt) return
  countdownEnded = true
  onCountdownEnd()
})

// Delivery is asynchronous after the countdown; watch the persisted status instead of guessing.
async function check() {
  const poll = props.notice.poll
  if (!poll || cancelled) return
  try {
    const response = await authFetch(`/api/messages/${poll.messageId}/send-status`)
    if (cancelled) return
    if (response.ok) {
      const data = await response.json() as { status?: string }
      if (data.status === 'sent') return poll.onStatus('sent')
      if (data.status === 'failed') return poll.onStatus('failed')
      if (data.status === 'draft') return poll.onStatus('cancelled')
    }
  } catch {
    // A transient poll failure keeps the toast waiting until the next attempt.
  }
  if (!cancelled) pollTimer = window.setTimeout(() => void check(), STATUS_POLL_MS)
}

onMounted(() => {
  if (props.notice.countdown) countdownTimer = window.setInterval(() => { now.value = Date.now() }, 250)
  void check()
})
onBeforeUnmount(() => {
  cancelled = true
  if (countdownTimer) window.clearInterval(countdownTimer)
  if (pollTimer) window.clearTimeout(pollTimer)
})

async function runAction(action: ComposeNoticeAction) {
  if (pendingAction.value) return
  const result = action.onClick()
  if (!(result instanceof Promise)) return
  pendingAction.value = action.label
  try {
    await result
  } finally {
    pendingAction.value = null
  }
}
</script>

<template>
  <div
    role="status"
    aria-atomic="false"
    class="fixed right-6 top-6 z-[60] flex max-w-[calc(100vw-3rem)] items-center gap-4 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg"
    :class="notice.tone === 'error' ? 'bg-red-600' : notice.tone === 'loading' ? 'bg-neutral-800' : 'bg-green-600'"
  >
    <UIcon v-if="notice.tone === 'loading'" name="i-lucide-loader-2" class="size-4 shrink-0 animate-spin" aria-hidden="true" />
    <span class="min-w-0 break-words">
      <template v-if="notice.parts">
        {{ notice.parts.before }}<NuxtLink
          v-if="notice.parts.link"
          :to="notice.parts.link.href"
          class="underline decoration-current underline-offset-2"
        >{{ notice.parts.link.label }}</NuxtLink>{{ notice.parts.after }}<span v-if="ticker !== null" aria-live="off">{{ ticker }}</span>
      </template>
      <template v-else>{{ notice.message }}</template>
    </span>
    <button
      v-for="action in notice.actions"
      :key="action.label"
      type="button"
      :disabled="pendingAction !== null"
      class="shrink-0 rounded-md bg-white/20 px-2.5 py-1 font-semibold hover:bg-white/30 disabled:cursor-wait disabled:opacity-60"
      @click="runAction(action)"
    >
      {{ action.label }}
    </button>
  </div>
</template>
