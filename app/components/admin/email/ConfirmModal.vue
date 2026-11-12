<script setup lang="ts">
// A confirmation dialog opened through useOverlay(), standing in for upstream's window.confirm
// and window.prompt. With `requireText`, the user must type that text to confirm.
const props = defineProps<{
  title: string
  description?: string
  /** Shown as a list below the description, e.g. MX records about to be replaced. */
  details?: string[]
  confirmLabel?: string
  color?: 'primary' | 'error' | 'warning'
  requireText?: string
}>()
const emit = defineEmits<{ close: [boolean] }>()
const { t } = useLanguage()
const typed = ref('')
const canConfirm = computed(() => !props.requireText || typed.value.trim().toLowerCase() === props.requireText.toLowerCase())
</script>

<template>
  <UModal :title="title" :description="description" :close="false" :ui="{ footer: 'justify-end' }" @update:open="open => !open && emit('close', false)">
    <template v-if="details?.length || requireText" #body>
      <ul v-if="details?.length" class="mb-3 space-y-1 rounded-md bg-elevated px-3 py-2 font-mono text-xs">
        <li v-for="line in details" :key="line">
          {{ line }}
        </li>
      </ul>
      <form v-if="requireText" @submit.prevent="canConfirm && emit('close', true)">
        <UInput v-model="typed" :placeholder="requireText" autofocus class="w-full" autocomplete="off" spellcheck="false" />
      </form>
    </template>
    <template #footer>
      <UButton color="neutral" variant="outline" :label="t('common.cancel')" @click="emit('close', false)" />
      <UButton :color="color ?? 'primary'" :label="confirmLabel ?? t('common.continue')" :disabled="!canConfirm" @click="emit('close', true)" />
    </template>
  </UModal>
</template>
