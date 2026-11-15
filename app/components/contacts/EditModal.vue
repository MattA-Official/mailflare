<script setup lang="ts">
// Create or rename a contact. Editing also allows changing the photo; creating collects email and name.
// Ported from legacy/src/components/contacts/contact-edit-dialog.tsx.
import * as z from 'zod'
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
const state = reactive({ email: '', displayName: '' })
// Creating needs a valid address; renaming needs a name. The address cannot change once saved.
const schema = computed(() => z.object({
  email: editing.value ? z.string() : z.string().refine(value => !!parseAddress(value), t('contacts.invalidEmail')),
  displayName: editing.value ? z.string().trim().min(1) : z.string(),
}))
const saving = ref(false)
const error = ref<string | null>(null)

// Every open starts clean.
watch(open, (value) => {
  if (!value) return
  state.email = props.contact?.email ?? ''
  state.displayName = props.contact?.displayName ?? ''
  error.value = null
}, { immediate: true })

const canSave = computed(() => !saving.value && (editing.value ? !!state.displayName.trim() : !!state.email.trim()))

async function submit() {
  const name = state.displayName.trim()
  const contact = props.contact
  saving.value = true
  error.value = null
  try {
    const saved = contact
      ? await renameContact(props.mailboxId, contact.email, name)
      : await createContact(props.mailboxId, { address: state.email.trim(), displayName: name || undefined })
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
      <UForm id="contact-edit-form" :schema="schema" :state="state" class="space-y-4" @submit="canSave && submit()">
        <ContactsContactAvatarForm
          v-if="contact"
          :mailbox-id="mailboxId"
          :address="contact.email"
          :name="state.displayName"
          :has-avatar="contact.hasAvatar"
          @avatar-change="hasAvatar => emit('saved', { ...contact!, hasAvatar })"
        />
        <UFormField :label="t('contact.name')" name="displayName">
          <UInput v-model="state.displayName" :disabled="saving" :autofocus="editing" />
        </UFormField>
        <UFormField :label="t('contact.email')" name="email">
          <UInput
            v-model="state.email"
            type="email"
            :placeholder="t('contacts.emailPlaceholder')"
            :disabled="saving || editing"
            :autofocus="!editing"
            :required="!editing"
          />
        </UFormField>
        <UAlert v-if="error" role="alert" color="error" variant="subtle" :title="error" />
      </UForm>
    </template>
    <template #footer>
      <UButton color="neutral" variant="outline" :label="t('common.cancel')" @click="open = false" />
      <UButton type="submit" form="contact-edit-form" :disabled="!canSave" :loading="saving" :label="saving ? t('common.saving') : t('common.save')" />
    </template>
  </UModal>
</template>
