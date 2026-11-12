<script setup lang="ts">
// Choose when a message comes back to the inbox. Ported from message-snooze-dialog.tsx and the
// identical dialog in message-list-row-actions.tsx.
import { getUserTimeZone } from '#lib/time/utils'
import { getSnoozePresets, snoozeMessage } from '~/utils/messages/row-actions-utils'

const props = defineProps<{ messageId: string }>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useLanguage()
const presets = ref(getSnoozePresets())
const snoozedUntil = ref(presets.value[0]!.value)
const snoozing = ref(false)
const error = ref<string | null>(null)
const inputId = useId()

watch(open, (isOpen) => {
  if (!isOpen) return
  presets.value = getSnoozePresets()
  error.value = null
})

async function handleSnooze() {
  snoozing.value = true
  error.value = null
  try {
    await snoozeMessage(props.messageId, snoozedUntil.value)
    open.value = false
  }
  catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : t('snooze.failed')
  }
  finally {
    snoozing.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="t('snooze.title')" :description="t('snooze.description')">
    <template #body>
      <div class="space-y-4" @click.stop>
        <div class="grid gap-2 sm:grid-cols-3">
          <UButton
            v-for="preset in presets"
            :key="preset.labelKey"
            color="neutral"
            :variant="snoozedUntil === preset.value ? 'subtle' : 'outline'"
            size="sm"
            block
            :aria-pressed="snoozedUntil === preset.value"
            :label="t(preset.labelKey)"
            @click="snoozedUntil = preset.value"
          />
        </div>
        <UFormField :label="t('snooze.selectDateTime', { timeZone: getUserTimeZone() })" :name="inputId">
          <UInput :id="inputId" v-model="snoozedUntil" type="datetime-local" class="w-full" />
        </UFormField>
        <p v-if="error" role="alert" class="text-sm text-error">{{ error }}</p>
        <UButton :loading="snoozing" :label="snoozing ? t('common.snoozing') : t('common.snooze')" @click="handleSnooze" />
      </div>
    </template>
  </UModal>
</template>
