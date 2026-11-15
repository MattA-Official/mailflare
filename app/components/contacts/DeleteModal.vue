<script setup lang="ts">
// Confirms removing a contact. Ported from legacy/src/components/contacts/contact-delete-dialog.tsx.
// Fork-only: the contact row also holds the block and the image consent. A saved contact that has either
// moves to Other unless the person ticks "also forget"; deleting from Other always forgets them, and says so.
import { contactHasPreferences, deleteContact, type ContactListItem } from '~/utils/contacts/contacts-page-utils'

const props = defineProps<{ mailboxId: string, contact: ContactListItem | null }>()
const emit = defineEmits<{ close: [], deleted: [contact: ContactListItem] }>()

const { t } = useLanguage()
const deleting = ref(false)
const error = ref<string | null>(null)
const forget = ref(false)

const flagged = computed(() => !!props.contact && contactHasPreferences(props.contact))
const saved = computed(() => props.contact?.source === 'manual')
const preferences = computed(() => {
  const contact = props.contact
  if (!contact) return ''
  if (contact.blocked && contact.remoteContentAllowed) return t('contacts.deletePreferences.both')
  return t(contact.blocked ? 'contacts.deletePreferences.blocked' : 'contacts.deletePreferences.images')
})

watch(() => props.contact, () => {
  deleting.value = false
  error.value = null
  forget.value = false
})

async function confirm() {
  const contact = props.contact
  if (!contact) return
  deleting.value = true
  error.value = null
  try {
    // Deleting an Other entry has nothing to move it to, so its settings go with it.
    await deleteContact(props.mailboxId, contact.email, { forget: forget.value || !saved.value })
    emit('deleted', contact)
    emit('close')
  }
  catch (deleteError) {
    error.value = deleteError instanceof Error ? deleteError.message : t('contacts.deleteFailed')
  }
  finally {
    deleting.value = false
  }
}
</script>

<template>
  <UModal
    :open="contact !== null"
    :title="t('contacts.deleteTitle')"
    :description="t('contacts.deleteDescription', { name: contact?.displayName ?? contact?.email ?? '' })"
    @update:open="value => !value && emit('close')"
  >
    <template v-if="error || flagged" #body>
      <div class="space-y-4">
        <template v-if="flagged">
          <UAlert
            v-if="saved"
            color="neutral"
            variant="subtle"
            icon="i-lucide-info"
            :title="t('contacts.deleteKeeps', { settings: preferences })"
          />
          <UCheckbox v-if="saved" v-model="forget" :label="t('contacts.deleteForget', { settings: preferences })" />
          <UAlert
            v-else
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            :title="t('contacts.deleteForgets', { settings: preferences })"
          />
        </template>
        <UAlert v-if="error" role="alert" color="error" variant="subtle" :title="error" />
      </div>
    </template>
    <template #footer>
      <UButton color="neutral" variant="outline" :label="t('common.cancel')" @click="emit('close')" />
      <UButton color="error" :disabled="deleting" :label="deleting ? t('contacts.deleting') : t('common.delete')" @click="confirm" />
    </template>
  </UModal>
</template>
