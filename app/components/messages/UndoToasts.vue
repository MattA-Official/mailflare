<script setup lang="ts">
// Undo notifications for reversible message actions, bottom left beside the sidebar.
// Ported from legacy/src/components/messages/undo-toasts.tsx.
import type { TranslationKey } from '#lib/i18n/types'
import type { ReversibleMessageAction } from '#lib/messages/actions/types'
import {
  dismissUndoToast,
  pauseUndoToast,
  pauseUndoToasts,
  resetUndoToasts,
  resumeUndoToast,
  resumeUndoToasts,
  runUndo,
  undoToastState,
  type UndoAnnouncement,
  type UndoToastEntry,
  type UndoToastFailureKind,
} from '~/utils/messages/message-action-client'
import { AUTH_SESSION_CHANGED_EVENT } from '~/utils/auth-client'

const { t } = useLanguage()

const ACTION_LABELS: Record<ReversibleMessageAction, TranslationKey> = {
  archive: 'undo.label.archive',
  trash: 'undo.label.trash',
  spam: 'undo.label.spam',
  inbox: 'undo.label.inbox',
  folder: 'undo.label.folder',
  read: 'undo.label.read',
  unread: 'undo.label.unread',
  star: 'undo.label.star',
  unstar: 'undo.label.unstar',
  snooze: 'undo.label.snooze',
  unsnooze: 'undo.label.unsnooze',
}

const FAILURE_LABELS: Record<UndoToastFailureKind, TranslationKey> = {
  expired: 'undo.failed.expired',
  unavailable: 'undo.failed.unavailable',
  stale: 'undo.failed.stale',
  network: 'undo.failed.network',
  server: 'undo.failed.server',
}

function appliedText(entry: UndoToastEntry) {
  const label = t(ACTION_LABELS[entry.action])
  const count = entry.records.length
  const text = count > 1 ? t('undo.bulk', { action: label, count }) : label
  return entry.skipped > 0 ? `${text}. ${t('undo.partial', { applied: count, total: count + entry.skipped })}` : text
}

function mainText(entry: UndoToastEntry) {
  if (entry.status === 'failed') return t('undo.failed')
  if (entry.status === 'partial') return t('undo.partialRestored', { restored: entry.restored ?? 0, total: entry.records.length })
  return appliedText(entry)
}

function announcementText(announcement: UndoAnnouncement) {
  const { entry } = announcement
  if (announcement.kind === 'undo-success') return t('undo.successAnnouncement', { action: t(ACTION_LABELS[entry.action]) })
  if (announcement.kind === 'undo-partial') return t('undo.partialRestored', { restored: entry.restored ?? 0, total: entry.records.length })
  if (announcement.kind === 'undo-failed') return entry.failure ? t(FAILURE_LABELS[entry.failure.kind]) : t('undo.failed')
  return appliedText(entry)
}

const polite = computed(() => {
  const announcement = undoToastState.announcement
  return announcement && !announcement.assertive ? announcementText(announcement) : ''
})
const assertive = computed(() => {
  const announcement = undoToastState.announcement
  return announcement?.assertive ? announcementText(announcement) : ''
})

function onFocusOut(event: FocusEvent) {
  const next = event.relatedTarget as Node | null
  if (!next || !(event.currentTarget as HTMLElement).contains(next)) resumeUndoToasts('region')
}

function onSessionChanged() {
  resetUndoToasts()
}
onMounted(() => window.addEventListener(AUTH_SESSION_CHANGED_EVENT, onSessionChanged))
onBeforeUnmount(() => window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, onSessionChanged))
</script>

<template>
  <div role="status" aria-live="polite" aria-atomic="true" class="sr-only">
    {{ polite }}
  </div>
  <div role="alert" aria-live="assertive" aria-atomic="true" class="sr-only">
    {{ assertive }}
  </div>
  <section
    v-if="undoToastState.visible.length > 0"
    role="region"
    :aria-label="t('undo.region')"
    tabindex="0"
    data-undo-region
    class="pointer-events-none fixed inset-x-6 bottom-[max(5rem,calc(env(safe-area-inset-bottom,0px)+4.5rem))] z-30 flex max-h-[calc(100dvh-6rem)] flex-col gap-2 overflow-y-auto overscroll-contain rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 md:bottom-6 md:inset-x-auto md:start-[calc(var(--sidebar-width,260px)+1.5rem)] md:w-[min(24rem,calc(100vw-var(--sidebar-width,260px)-3rem))]"
    @focusin="pauseUndoToasts('region')"
    @focusout="onFocusOut"
  >
    <div
      v-for="entry in undoToastState.visible"
      :key="entry.id"
      role="group"
      :aria-labelledby="`undo-toast-${entry.id}-message`"
      :aria-busy="entry.status === 'undoing' || undefined"
      :data-undo-toast-id="entry.id"
      class="pointer-events-auto flex items-start gap-3 rounded-xl px-3 py-2.5 text-sm font-medium shadow-lg ring-1 ring-default/10 focus-within:ring-2"
      :class="entry.status === 'failed' ? 'bg-error text-inverted' : entry.status === 'partial' ? 'bg-warning text-inverted' : 'bg-inverted text-inverted'"
      @pointerenter="pauseUndoToast(entry.id, 'hover')"
      @pointerleave="resumeUndoToast(entry.id, 'hover')"
    >
      <div :id="`undo-toast-${entry.id}-message`" class="min-w-0 flex-1 py-0.5">
        <p class="break-words">
          {{ mainText(entry) }}
        </p>
        <p v-if="entry.context && entry.status !== 'failed' && entry.status !== 'partial'" class="mt-0.5 break-words text-xs font-normal opacity-80">
          {{ entry.context }}
        </p>
        <p v-if="entry.status === 'failed' && entry.failure" class="mt-0.5 text-xs font-normal opacity-85">
          {{ t(FAILURE_LABELS[entry.failure.kind]) }}
        </p>
        <p v-if="entry.status === 'partial'" class="mt-0.5 text-xs font-normal opacity-85">
          {{ t(ACTION_LABELS[entry.action]) }}
        </p>
      </div>
      <UButton
        v-if="entry.status === 'idle' || entry.status === 'undoing' || (entry.status === 'failed' && entry.failure?.retryable)"
        size="xs"
        color="neutral"
        variant="subtle"
        class="shrink-0"
        :loading="entry.status === 'undoing'"
        :aria-disabled="entry.status === 'undoing' || undefined"
        :aria-describedby="`undo-toast-${entry.id}-message`"
        :label="entry.status === 'undoing' ? t('undo.undoing') : entry.status === 'failed' ? t('undo.retry') : t('undo.button')"
        @click="entry.status !== 'undoing' && runUndo(entry.id)"
      />
      <UButton
        size="xs"
        color="neutral"
        variant="link"
        icon="i-lucide-x"
        class="-m-1 shrink-0 text-inverted/75 hover:text-inverted"
        :aria-label="entry.status === 'undoing' ? t('undo.hidePending') : t('undo.dismiss')"
        :title="entry.status === 'undoing' ? t('undo.hidePending') : undefined"
        :aria-describedby="`undo-toast-${entry.id}-message`"
        data-undo-dismiss
        @click="dismissUndoToast(entry.id)"
      />
    </div>
  </section>
</template>
