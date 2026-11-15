<script setup lang="ts">
// Fork-only: everything about one contact, opened from a row on the Contacts page. A slideover from the right,
// which fills the screen on a phone. Rename, change the photo, save an automatically collected address,
// block or unblock, find their mail, write to them, or delete.
import { formatEmailAddress } from '#lib/email/address'
import type { TranslationKey } from '#lib/i18n/types'
import { formatUserDate } from '#lib/time/utils'
import { createContact, renameContact, setContactBlocked, type ContactListItem } from '~/utils/contacts/contacts-page-utils'

const props = defineProps<{ mailboxId: string, contact: ContactListItem | null }>()
const emit = defineEmits<{ close: [], changed: [], delete: [contact: ContactListItem] }>()

const { t } = useLanguage()
const toast = useToast()
const { openComposer } = useCompose()
const { setQuery } = useMailSearch()
const displayName = ref('')
const hasAvatar = ref(false)
const saving = ref(false)
const blocking = ref(false)
const error = ref<string | null>(null)

const current = computed(() => props.contact)
const saved = computed(() => current.value?.source === 'manual')
const nameChanged = computed(() => !!current.value && displayName.value.trim() !== (current.value.displayName ?? ''))

watch(current, (contact) => {
  displayName.value = contact?.displayName ?? ''
  hasAvatar.value = contact?.hasAvatar ?? false
  error.value = null
}, { immediate: true })

function label(contact: ContactListItem) {
  return contact.displayName ?? contact.email
}

// Saving the name is also how an automatically collected address becomes a saved contact.
async function save() {
  const contact = current.value
  const name = displayName.value.trim()
  // A saved contact always keeps a name; an address being saved for the first time may have none.
  if (!contact || (saved.value && !name)) return
  saving.value = true
  error.value = null
  try {
    if (saved.value) await renameContact(props.mailboxId, contact.email, name)
    else await createContact(props.mailboxId, { address: contact.email, displayName: name || undefined })
    toast.add({ title: t(saved.value ? 'contacts.panel.renamed' : 'contacts.panel.saved'), color: 'success', icon: 'i-lucide-check' })
    emit('changed')
  }
  catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('contacts.saveFailed')
  }
  finally {
    saving.value = false
  }
}

async function toggleBlocked() {
  const contact = current.value
  if (!contact) return
  blocking.value = true
  error.value = null
  try {
    await setContactBlocked(props.mailboxId, contact.email, !contact.blocked)
    toast.add({ title: t(contact.blocked ? 'contacts.panel.unblocked' : 'contacts.panel.blockedToast', { name: label(contact) }), color: 'success', icon: 'i-lucide-check' })
    emit('changed')
  }
  catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('contact.updateFailed')
  }
  finally {
    blocking.value = false
  }
}

function sendEmail() {
  const contact = current.value
  if (!contact) return
  openComposer({ to: [formatEmailAddress(contact.email, contact.displayName)] })
}

function findMail() {
  const contact = current.value
  if (!contact) return
  setQuery(contact.email)
  emit('close')
  void navigateTo('/inbox')
}
</script>

<template>
  <USlideover
    :open="contact !== null"
    :title="contact ? label(contact) : ''"
    :description="contact?.displayName ? contact.email : undefined"
    @update:open="value => !value && emit('close')"
  >
    <template v-if="contact" #body>
      <div class="space-y-6">
        <div class="flex flex-wrap gap-2">
          <UButton icon="i-lucide-send" :label="t('contacts.panel.write')" @click="sendEmail" />
          <UButton icon="i-lucide-search" color="neutral" variant="outline" :label="t('contacts.panel.findMail')" @click="findMail" />
        </div>

        <div class="flex flex-wrap gap-2">
          <UBadge :color="saved ? 'primary' : 'neutral'" variant="soft" :icon="saved ? 'i-lucide-bookmark' : 'i-lucide-inbox'" :label="t(saved ? 'contacts.tabs.saved' : 'contacts.tabs.other')" />
          <UBadge v-if="contact.blocked" color="error" variant="soft" icon="i-lucide-ban" :label="t('contact.blocked')" />
          <UBadge v-if="contact.remoteContentAllowed" color="neutral" variant="soft" icon="i-lucide-image" :label="t('contacts.panel.imagesAllowed')" />
        </div>

        <form class="space-y-4" @submit.prevent="save">
          <ContactsContactAvatarForm
            :mailbox-id="mailboxId"
            :address="contact.email"
            :name="displayName"
            :has-avatar="hasAvatar"
            @avatar-change="(value: boolean) => { hasAvatar = value; emit('changed') }"
          />
          <UFormField :label="t('contact.name')" name="displayName">
            <UInput v-model="displayName" :disabled="saving" class="w-full" />
          </UFormField>
          <UFormField :label="t('contact.email')" name="email">
            <UInput :model-value="contact.email" disabled class="w-full" />
          </UFormField>
          <UButton
            v-if="!saved || nameChanged"
            type="submit"
            :icon="saved ? 'i-lucide-check' : 'i-lucide-bookmark-plus'"
            :loading="saving"
            :disabled="saved && !displayName.trim()"
            :label="t(saved ? 'contact.save' : 'contacts.panel.saveToContacts')"
          />
        </form>

        <dl class="grid gap-3 rounded-lg bg-muted p-3 text-sm sm:grid-cols-2">
          <div>
            <dt class="text-xs font-medium uppercase text-muted">{{ t('contact.source') }}</dt>
            <dd class="mt-1 text-default">{{ t(`contacts.source.${contact.source}` as TranslationKey) }}</dd>
          </div>
          <div>
            <dt class="text-xs font-medium uppercase text-muted">{{ t('contact.lastSeen') }}</dt>
            <dd class="mt-1 text-default">
              {{ contact.lastSeenAt ? formatUserDate(contact.lastSeenAt, { month: 'short', day: 'numeric', year: 'numeric' }) : t('contact.unknown') }}
            </dd>
          </div>
        </dl>

        <UAlert v-if="error" role="alert" color="error" variant="subtle" :title="error" />
      </div>
    </template>
    <template v-if="contact" #footer>
      <UButton
        :icon="contact.blocked ? 'i-lucide-circle-check' : 'i-lucide-ban'"
        color="neutral"
        variant="outline"
        :loading="blocking"
        :label="t(contact.blocked ? 'contacts.panel.unblock' : 'contacts.panel.block')"
        @click="toggleBlocked"
      />
      <UButton icon="i-lucide-trash-2" color="error" variant="soft" :label="t('contacts.delete')" @click="emit('delete', contact)" />
    </template>
  </USlideover>
</template>
