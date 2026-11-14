<script setup lang="ts">
// Renders the dialogs confirmDialog / confirmDestructive / alertDialog request, one at a time.
// Ported from ConfirmDialogHost in legacy/src/components/ui/confirm-dialog.tsx.
import { setConfirmDialogHost, type ConfirmRequest } from '~/utils/confirm-dialog'

const { t } = useLanguage()
const queue = shallowRef<ConfirmRequest[]>([])
const typed = ref('')
const current = computed(() => queue.value[0])
const options = computed(() => current.value?.options)
const isAlert = computed(() => current.value?.kind === 'alert')
const canConfirm = computed(() => !options.value?.requireText || typed.value.trim().toLowerCase() === options.value.requireText.trim().toLowerCase())

onMounted(() => setConfirmDialogHost((request) => { queue.value = [...queue.value, request] }))
onBeforeUnmount(() => setConfirmDialogHost(null))

function settle(confirmed: boolean) {
  const request = current.value
  if (!request) return
  request.resolve(confirmed)
  typed.value = ''
  queue.value = queue.value.slice(1)
}
</script>

<template>
  <UModal
    :open="!!current"
    :title="options?.title ?? options?.message ?? ''"
    :description="options?.title ? options.message : undefined"
    :close="false"
    :ui="{ footer: 'justify-end', header: options?.title ? undefined : 'sr-only', description: 'whitespace-pre-line' }"
    @update:open="open => !open && settle(false)"
  >
    <template v-if="options && (!options.title || options.requireText)" #body>
      <p v-if="!options.title" class="text-sm whitespace-pre-line text-default">
        {{ options.message }}
      </p>
      <form v-if="options.requireText" :class="!options.title && 'mt-4'" @submit.prevent="canConfirm && settle(true)">
        <UInput v-model="typed" :placeholder="options.requireText" :aria-label="options.requireText" autofocus class="w-full" autocomplete="off" spellcheck="false" />
      </form>
    </template>
    <template #footer>
      <UButton v-if="!isAlert" color="neutral" variant="outline" :label="t('common.cancel')" @click="settle(false)" />
      <UButton
        :color="options?.destructive ? 'error' : 'primary'"
        :label="options?.confirmLabel ?? (isAlert ? t('navigation.close') : t('common.continue'))"
        :disabled="!canConfirm"
        @click="settle(true)"
      />
    </template>
  </UModal>
</template>
