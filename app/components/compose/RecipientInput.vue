<script setup lang="ts">
// A To/Cc/Bcc row, ported from legacy/src/components/compose/recipient-input.tsx. Addresses become
// chips as soon as the user types a comma, presses Enter or Tab, pastes a list, or leaves the field;
// Backspace on an empty field pulls the last chip back out for editing.
import { getEmailAddress } from '#lib/email/address'
import { getRecipientLabel, isValidRecipient, parseRecipientEntries } from '~/utils/compose/recipient-utils'

const props = defineProps<{
  id: string
  label: string
  placeholder?: string
  disabled?: boolean
  required?: boolean
  /** Focus the field when it first appears, e.g. after the Cc/Bcc toggle reveals it. */
  autofocus?: boolean
}>()
const model = defineModel<string[]>({ required: true })
const { t } = useLanguage()
const draft = ref('')
const input = useTemplateRef<HTMLInputElement>('input')

function commit(raw = draft.value) {
  const entries = parseRecipientEntries(raw, model.value)
  if (entries.length > 0) model.value = [...model.value, ...entries]
  draft.value = ''
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === ',' || event.key === ';' || event.key === 'Enter' || (event.key === 'Tab' && draft.value.trim())) {
    if (event.key !== 'Tab') event.preventDefault()
    commit()
    return
  }
  if (event.key === 'Backspace' && !draft.value && model.value.length > 0) {
    event.preventDefault()
    const last = model.value[model.value.length - 1]!
    model.value = model.value.slice(0, -1)
    draft.value = last
  }
}

function onInput(event: Event) {
  const value = (event.target as HTMLInputElement).value
  // A pasted list should split immediately instead of waiting for a comma.
  if (/[,;]/.test(value) && value.length - draft.value.length > 1) {
    commit(value)
    ;(event.target as HTMLInputElement).value = ''
    return
  }
  draft.value = value
}

function remove(entry: string) {
  model.value = model.value.filter(item => item !== entry)
}

onMounted(() => {
  if (props.autofocus) input.value?.focus()
})
defineExpose({ focus: () => input.value?.focus() })
</script>

<template>
  <div class="flex min-h-9 items-center gap-2 border-b border-default px-4 py-1" @click="input?.focus()">
    <label :for="id" class="w-8 shrink-0 text-sm text-muted">{{ label }}</label>
    <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
      <span
        v-for="entry in model"
        :key="entry"
        :title="getEmailAddress(entry)"
        class="inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs"
        :class="isValidRecipient(entry) ? 'border-default bg-elevated text-default' : 'border-error/40 bg-error/10 text-error'"
      >
        <span class="truncate">{{ getRecipientLabel(entry) }}</span>
        <button
          v-if="!disabled"
          type="button"
          :aria-label="t('recipient.remove', { address: getEmailAddress(entry) })"
          class="rounded-full p-0.5 text-muted hover:bg-accented hover:text-default"
          @click.stop="remove(entry)"
        >
          <UIcon name="i-lucide-x" class="size-3" />
        </button>
      </span>
      <!-- Native `required` would block submit while chips exist; the form checks itself. -->
      <input
        :id="id"
        ref="input"
        :value="draft"
        type="text"
        autocomplete="off"
        spellcheck="false"
        :placeholder="model.length === 0 ? placeholder : undefined"
        :disabled="disabled"
        :aria-required="required || undefined"
        class="h-7 min-w-32 flex-1 border-0 bg-transparent p-0 text-sm text-default outline-none placeholder:text-dimmed disabled:cursor-not-allowed"
        @input="onInput"
        @keydown="onKeydown"
        @blur="commit()"
      >
    </div>
    <!-- Toggles live inside the clickable row; keep their clicks from refocusing this field. -->
    <div v-if="$slots.trailing" class="flex shrink-0 items-center gap-1 text-xs text-muted" @click.stop>
      <slot name="trailing" />
    </div>
  </div>
</template>
