<script setup lang="ts">
// The app's one confirmation dialog, opened through useOverlay() by confirmDialog / alertDialog
// (utils/confirm-dialog) and useAdminConfirm. Stands in for upstream's window.confirm, window.alert
// and window.prompt. With `requireText`, the user must type that text to confirm.
const props = defineProps<{
  title?: string
  message?: string
  /** Shown as a list below the message, e.g. MX records about to be replaced. */
  details?: string[]
  confirmLabel?: string
  color?: 'primary' | 'error' | 'warning'
  requireText?: string
  /** An alert has one button and nothing to cancel. */
  alert?: boolean
}>()
const emit = defineEmits<{ close: [boolean] }>()
const { t } = useLanguage()
const typed = ref('')
const canConfirm = computed(() => !props.requireText || typed.value.trim().toLowerCase() === props.requireText.trim().toLowerCase())
</script>

<template>
  <UModal
    :title="title ?? message ?? ''"
    :description="title ? message : undefined"
    :close="false"
    :ui="{ header: title ? undefined : 'sr-only', description: 'whitespace-pre-line' }"
    @update:open="open => !open && emit('close', false)"
  >
    <template v-if="!title || details?.length || requireText" #body>
      <p v-if="!title" class="text-sm whitespace-pre-line text-default">
        {{ message }}
      </p>
      <ul v-if="details?.length" class="space-y-1 rounded-md bg-elevated px-3 py-2 font-mono text-xs" :class="!title && 'mt-3'">
        <li v-for="line in details" :key="line">
          {{ line }}
        </li>
      </ul>
      <form v-if="requireText" :class="{ 'mt-4': !title || !!details?.length }" @submit.prevent="canConfirm && emit('close', true)">
        <UInput v-model="typed" :placeholder="requireText" :aria-label="requireText" autofocus autocomplete="off" spellcheck="false" />
      </form>
    </template>
    <template #footer>
      <UButton v-if="!alert" color="neutral" variant="outline" :label="t('common.cancel')" @click="emit('close', false)" />
      <UButton
        :color="color ?? 'primary'"
        :label="confirmLabel ?? (alert ? t('navigation.close') : t('common.continue'))"
        :disabled="!canConfirm"
        @click="emit('close', true)"
      />
    </template>
  </UModal>
</template>
