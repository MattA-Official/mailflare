<script setup lang="ts">
// The send toast: undo countdown, delivery status poll and the subject link, ported from
// ComposeNoticeToast in legacy/src/components/compose/floating-composer.tsx. It renders nothing
// itself: it drives one Nuxt UI toast (id "compose-notice") and updates it in place as the notice
// changes, so "Sending…", "Sent" and "Failed" replace each other instead of stacking. The title is
// a render function, so the countdown and the subject link stay live inside the toast.
import type { ToastProps } from '@nuxt/ui'
import { NuxtLink } from '#components'
import type { ComposeNotice, ComposeNoticeAction } from '~/types/compose/notice'
import { COMPOSE_NOTICE_TOAST_ID } from '~/utils/compose/notice-toast'

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

const toast = useToast()

function title() {
  const { parts, message } = props.notice
  if (!parts) return h('span', { class: 'break-words' }, message)
  return h('span', { class: 'break-words' }, [
    parts.before,
    parts.link ? h(NuxtLink, { to: parts.link.href, class: 'underline decoration-current underline-offset-2' }, () => parts.link!.label) : null,
    parts.after,
    ticker.value !== null ? h('span', { 'aria-live': 'off' }, ticker.value) : null,
  ])
}

function toastProps(): Partial<ToastProps> & { id: string } {
  const { tone, countdown, actions } = props.notice
  return {
    id: COMPOSE_NOTICE_TOAST_ID,
    title,
    color: tone === 'error' ? 'error' : tone === 'loading' ? 'neutral' : 'success',
    icon: tone === 'error' ? 'i-lucide-circle-alert' : tone === 'loading' ? 'i-lucide-loader-2' : 'i-lucide-circle-check',
    // The notice decides when it ends (useCompose clears it), so the toast never times out itself.
    duration: 0,
    // An undo countdown or a pending action can't be dismissed by accident.
    close: tone !== 'loading' && !countdown,
    actions: actions.map(action => ({
      label: action.label,
      color: 'neutral' as const,
      variant: 'outline' as const,
      size: 'xs' as const,
      disabled: pendingAction.value !== null,
      loading: pendingAction.value === action.label,
      // The action replaces the notice itself (Sending…, Cancelled), so the toast stays open for it.
      closeOnClick: false,
      onClick: () => void runAction(action),
    })),
    progress: false,
    orientation: 'horizontal',
    ui: tone === 'loading' ? { icon: 'animate-spin' } : undefined,
  }
}

function show() {
  const next = toastProps()
  if (toast.toasts.value.some(item => item.id === COMPOSE_NOTICE_TOAST_ID)) toast.update(COMPOSE_NOTICE_TOAST_ID, next)
  else toast.add(next)
}

onMounted(show)
watch(pendingAction, show)

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
  <!-- The notice shows through useToast(); this element only anchors the component. -->
  <span hidden />
</template>
