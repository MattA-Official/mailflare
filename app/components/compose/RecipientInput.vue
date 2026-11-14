<script setup lang="ts">
// A To/Cc/Bcc row, ported from legacy/src/components/compose/recipient-input.tsx. Addresses become
// chips as soon as the user types a comma, presses Enter or Tab, pastes a list, or leaves the field;
// Backspace on an empty field pulls the last chip back out for editing. With a mailboxId the field
// also offers matching contacts as suggestions (recipient-suggestions.tsx).
import { getEmailAddress } from '#lib/email/address'
import { getRecipientLabel, isValidRecipient, parseRecipientEntries } from '~/utils/compose/recipient-utils'
import { fetchContactSuggestions, filterContactSuggestions, formatContactSuggestion, type ContactSuggestion } from '~/utils/compose/recipient-suggestions-utils'

const SUGGESTIONS_DEBOUNCE_MS = 180

const props = defineProps<{
  id: string
  label: string
  placeholder?: string
  disabled?: boolean
  required?: boolean
  /** Focus the field when it first appears, e.g. after the Cc/Bcc toggle reveals it. */
  autofocus?: boolean
  /** Enables contact suggestions while typing; suggestions come from the mailbox owner's contacts. */
  mailboxId?: string
}>()
const model = defineModel<string[]>({ required: true })
const { t } = useLanguage()
const draft = ref('')
const input = useTemplateRef<HTMLInputElement>('input')
const suggestions = shallowRef<ContactSuggestion[]>([])
const suggestionsOpen = ref(false)
const activeIndex = ref(-1)
let request = 0

const visibleSuggestions = computed(() => (suggestionsOpen.value ? filterContactSuggestions(suggestions.value, model.value) : []))
const activeSuggestion = computed(() => (activeIndex.value >= 0 ? visibleSuggestions.value[activeIndex.value] : undefined))

watch([draft, () => props.disabled, () => props.mailboxId], ([value, disabled, mailboxId], _previous, onCleanup) => {
  const query = value.trim()
  if (!mailboxId || disabled || !query) return
  const current = ++request
  const timer = setTimeout(() => {
    fetchContactSuggestions(mailboxId, query)
      .then((list) => {
        if (request !== current) return
        suggestions.value = list
        suggestionsOpen.value = list.length > 0
        activeIndex.value = -1
      })
      .catch(() => {
        // Suggestions are a convenience; a failed lookup just shows none.
      })
  }, SUGGESTIONS_DEBOUNCE_MS)
  onCleanup(() => clearTimeout(timer))
})

function closeSuggestions() {
  suggestionsOpen.value = false
  activeIndex.value = -1
}

function updateDraft(next: string) {
  draft.value = next
  if (!next.trim()) closeSuggestions()
}

function commit(raw = draft.value) {
  const entries = parseRecipientEntries(raw, model.value)
  if (entries.length > 0) model.value = [...model.value, ...entries]
  draft.value = ''
  closeSuggestions()
}

function pickSuggestion(suggestion: ContactSuggestion) {
  const entries = parseRecipientEntries(formatContactSuggestion(suggestion), model.value)
  if (entries.length > 0) model.value = [...model.value, ...entries]
  draft.value = ''
  closeSuggestions()
  input.value?.focus()
}

function onKeydown(event: KeyboardEvent) {
  const visible = visibleSuggestions.value
  if (visible.length > 0) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      activeIndex.value = (activeIndex.value + step + visible.length) % visible.length
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      closeSuggestions()
      return
    }
    if ((event.key === 'Enter' || event.key === 'Tab') && activeSuggestion.value) {
      event.preventDefault()
      pickSuggestion(activeSuggestion.value)
      return
    }
  }
  if (event.key === ',' || event.key === ';' || event.key === 'Enter' || (event.key === 'Tab' && draft.value.trim())) {
    if (event.key !== 'Tab') event.preventDefault()
    commit()
    return
  }
  if (event.key === 'Backspace' && !draft.value && model.value.length > 0) {
    event.preventDefault()
    const last = model.value[model.value.length - 1]!
    model.value = model.value.slice(0, -1)
    updateDraft(last)
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
  updateDraft(value)
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
    <div class="relative flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
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
        role="combobox"
        :aria-expanded="visibleSuggestions.length > 0"
        :aria-controls="`${id}-suggestions`"
        :aria-activedescendant="activeSuggestion ? `${id}-suggestion-${activeIndex}` : undefined"
        aria-autocomplete="list"
        class="h-7 min-w-32 flex-1 border-0 bg-transparent p-0 text-sm text-default outline-none placeholder:text-dimmed disabled:cursor-not-allowed"
        @input="onInput"
        @keydown="onKeydown"
        @blur="commit()"
      >
      <!-- Options keep focus on the input by preventing mousedown. -->
      <ul
        v-if="mailboxId && visibleSuggestions.length > 0"
        :id="`${id}-suggestions`"
        role="listbox"
        class="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-default bg-default py-1 shadow-lg"
      >
        <li
          v-for="(suggestion, index) in visibleSuggestions"
          :id="`${id}-suggestion-${index}`"
          :key="suggestion.email"
          role="option"
          :aria-selected="index === activeIndex"
          class="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-left"
          :class="index === activeIndex ? 'bg-primary/10' : 'hover:bg-elevated'"
          @mousedown.prevent="pickSuggestion(suggestion)"
          @mouseenter="activeIndex = index"
        >
          <ContactsContactAvatar
            :mailbox-id="mailboxId"
            :address="suggestion.email"
            :name="suggestion.displayName ?? ''"
            :has-managed-avatar="suggestion.hasAvatar"
            class="size-7 text-xs"
          />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm text-highlighted">{{ suggestion.displayName ?? suggestion.email }}</span>
            <span v-if="suggestion.displayName" class="block truncate text-xs text-muted">{{ suggestion.email }}</span>
          </span>
        </li>
      </ul>
    </div>
    <!-- Toggles live inside the clickable row; keep their clicks from refocusing this field. -->
    <div v-if="$slots.trailing" class="flex shrink-0 items-center gap-1 text-xs text-muted" @click.stop>
      <slot name="trailing" />
    </div>
  </div>
</template>
