<script setup lang="ts">
// Fork-only: the event editor's guest list. Each guest is a tag; typing suggests people from the calendar
// mailbox's contacts, in the same order as compose, and any other address can be added as typed.
import { getEmailAddress } from '#lib/email/address'
import { isValidRecipient, parseRecipientEntries } from '~/utils/compose/recipient-utils'
import { fetchContactSuggestions, type ContactSuggestion } from '~/utils/compose/recipient-suggestions-utils'

const SUGGESTIONS_DEBOUNCE_MS = 180

const props = defineProps<{ mailboxId?: string, placeholder?: string, ariaLabel?: string }>()
const model = defineModel<string[]>({ required: true })
const { t } = useLanguage()
const searchTerm = ref('')
const suggestions = shallowRef<ContactSuggestion[]>([])
let request = 0

watch([searchTerm, () => props.mailboxId], ([value, mailboxId], _previous, onCleanup) => {
  const query = value.trim()
  if (!mailboxId || !query) {
    suggestions.value = []
    return
  }
  const current = ++request
  const timer = setTimeout(() => {
    fetchContactSuggestions(mailboxId, query)
      .then((list) => {
        if (request === current) suggestions.value = list
      })
      .catch(() => {
        // Suggestions are a convenience; a failed lookup just shows none.
      })
  }, SUGGESTIONS_DEBOUNCE_MS)
  onCleanup(() => clearTimeout(timer))
})

const names = computed(() => new Map(suggestions.value.map(suggestion => [suggestion.email, suggestion.displayName])))
// Guests already on the list are kept as items so their tags stay; new matches follow.
const items = computed(() => {
  const picked = new Set(model.value.map(entry => getEmailAddress(entry).toLowerCase()))
  return [...model.value, ...suggestions.value.map(suggestion => suggestion.email).filter(email => !picked.has(email.toLowerCase()))]
})

// Typed or pasted text may hold several addresses; each valid one becomes a guest, as a bare address
// because invitations are sent to bare addresses.
function create(value: string) {
  const entries = parseRecipientEntries(value, model.value).filter(isValidRecipient).map(getEmailAddress)
  if (entries.length > 0) model.value = [...model.value, ...entries]
  searchTerm.value = ''
}
</script>

<template>
  <UInputMenu
    v-model="model"
    v-model:search-term="searchTerm"
    multiple
    ignore-filter
    create-item
    variant="ghost"
    :items="items"
    :trailing-icon="false"
    :placeholder="placeholder"
    :aria-label="ariaLabel"
    :content="{ hideWhenEmpty: true }"
    :reset-search-term-on-blur="false"
    @create="create"
    @blur="create(searchTerm)"
  >
    <template #item-label="{ item }">
      <span class="block truncate">{{ names.get(String(item)) ?? item }}</span>
      <span v-if="names.get(String(item))" class="block truncate text-xs text-muted">{{ item }}</span>
    </template>
    <template #create-item-label="{ item }">
      {{ t('calendar.addGuest', { address: item }) }}
    </template>
  </UInputMenu>
</template>
