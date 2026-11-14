<script setup lang="ts">
// Confirms removing a contact. Ported from legacy/src/components/contacts/contact-delete-dialog.tsx.
import { deleteContact, type ContactListItem } from '~/utils/contacts/contacts-page-utils'

const props = defineProps<{ mailboxId: string, contact: ContactListItem | null }>()
const emit = defineEmits<{ close: [], deleted: [contact: ContactListItem] }>()

const { t } = useLanguage()
const deleting = ref(false)
const error = ref<string | null>(null)

watch(() => props.contact, () => {
  deleting.value = false
  error.value = null
})

async function confirm() {
  const contact = props.contact
  if (!contact) return
  deleting.value = true
  error.value = null
  try {
    await deleteContact(props.mailboxId, contact.email)
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
    <template v-if="error" #body>
      <p role="alert" class="text-sm text-error">
        {{ error }}
      </p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="outline" :label="t('common.cancel')" @click="emit('close')" />
        <UButton color="error" :disabled="deleting" :label="deleting ? t('contacts.deleting') : t('common.delete')" @click="confirm" />
      </div>
    </template>
  </UModal>
</template>
