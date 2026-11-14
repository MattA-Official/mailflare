<script setup lang="ts">
// Create or rename a contact. Editing also allows changing the photo; creating collects email and name.
// Ported from legacy/src/components/contacts/contact-edit-dialog.tsx.
import { parseAddress } from '#lib/utils'
import { createContact, renameContact, type ContactListItem } from '~/utils/contacts/contacts-page-utils'

const props = defineProps<{
  mailboxId: string
  /** Set for renaming an existing contact; unset creates a new one. */
  contact: ContactListItem | null
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [contact: ContactListItem] }>()

const { t } = useLanguage()
const editing = computed(() => props.contact !== null)
const email = ref('')
const displayName = ref('')
const saving = ref(false)
const error = ref<string | null>(null)

// Every open starts clean.
watch(open, (value) => {
  if (!value) return
  email.value = props.contact?.email ?? ''
  displayName.value = props.contact?.displayName ?? ''
  error.value = null
}, { immediate: true })

const canSave = computed(() => !saving.value && (editing.value ? !!displayName.value.trim() : !!email.value.trim()))

async function submit() {
  const name = displayName.value.trim()
  const contact = props.contact
  if (contact) {
    if (!name) return
  }
  else if (!parseAddress(email.value)) {
    error.value = t('contacts.invalidEmail')
    return
  }
  saving.value = true
  error.value = null
  try {
    const saved = contact
      ? await renameContact(props.mailboxId, contact.email, name)
      : await createContact(props.mailboxId, { address: email.value.trim(), displayName: name || undefined })
    emit('saved', saved)
    open.value = false
  }
  catch (saveError) {
    error.value = saveError instanceof Error ? saveError.message : t('contacts.saveFailed')
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="editing ? t('contacts.edit') : t('contacts.new')" :description="t('contacts.dialogDescription')">
    <template #body>
      <form id="contact-edit-form" class="space-y-4" @submit.prevent="canSave && submit()">
        <ContactsContactAvatarForm
          v-if="contact"
          :mailbox-id="mailboxId"
          :address="contact.email"
          :name="displayName"
          :has-avatar="contact.hasAvatar"
          @avatar-change="hasAvatar => emit('saved', { ...contact!, hasAvatar })"
        />
        <UFormField :label="t('contact.name')">
          <UInput v-model="displayName" :disabled="saving" :autofocus="editing" class="w-full" />
        </UFormField>
        <UFormField :label="t('contact.email')">
          <UInput
            v-model="email"
            type="email"
            :placeholder="t('contacts.emailPlaceholder')"
            :disabled="saving || editing"
            :autofocus="!editing"
            :required="!editing"
            class="w-full"
          />
        </UFormField>
        <p v-if="error" role="alert" class="text-sm text-error">
          {{ error }}
        </p>
      </form>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="outline" :label="t('common.cancel')" @click="open = false" />
        <UButton type="submit" form="contact-edit-form" :disabled="!canSave" :loading="saving" :label="saving ? t('common.saving') : t('common.save')" />
      </div>
    </template>
  </UModal>
</template>
