<script setup lang="ts">
// A contact's name that opens their details: picture, display name, source and last seen.
// Ported from legacy/src/components/contacts/contact-details.tsx.
import { formatUserDate } from '#lib/time/utils'
import type { ContactChangedDetail, ContactDetailsRecord } from '~/types/contacts/contacts'
import { CONTACT_CHANGED_EVENT, fetchContactDetails, updateContactName } from '~/utils/contacts/contact-utils'

defineOptions({ inheritAttrs: false })
const props = defineProps<{
  mailboxId: string | null
  address: string
  /** Contact name. Not the formatted Name <mailbox> label. */
  name: string
  /** Visible text. Falls back to name. */
  label?: string
}>()

const { t } = useLanguage()
const open = ref(false)
const visibleLabel = computed(() => props.label ?? props.name)
const renamed = ref<{ from: string, value: string } | null>(null)
const shownName = computed(() => renamed.value?.from === visibleLabel.value ? renamed.value.value : visibleLabel.value)
const contact = ref<ContactDetailsRecord | null>(null)
const displayName = ref(props.name)
const loading = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)
let generation = 0

watch(open, async (isOpen) => {
  const mailboxId = props.mailboxId
  if (!isOpen || !mailboxId) return
  const current = ++generation
  loading.value = true
  error.value = null
  try {
    const next = await fetchContactDetails(mailboxId, props.address)
    if (current !== generation) return
    contact.value = next
    displayName.value = next.displayName ?? props.name
  } catch (cause) {
    if (current === generation) error.value = cause instanceof Error ? cause.message : t('contact.loadFailed')
  } finally {
    if (current === generation) loading.value = false
  }
})

async function save() {
  if (!props.mailboxId || !displayName.value.trim()) return
  saving.value = true
  error.value = null
  try {
    const updated = await updateContactName(props.mailboxId, props.address, displayName.value)
    const nextName = updated.displayName ?? displayName.value.trim()
    contact.value = updated
    if (!props.label) renamed.value = { from: visibleLabel.value, value: nextName }
    open.value = false
    window.dispatchEvent(new CustomEvent<ContactChangedDetail>(CONTACT_CHANGED_EVENT, { detail: { email: updated.email, displayName: nextName } }))
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('contact.updateFailed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <span v-if="!mailboxId" v-bind="$attrs">{{ shownName }}</span>
  <template v-else>
    <button
      type="button"
      v-bind="$attrs"
      class="rounded-sm text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      @click="open = true"
    >
      {{ shownName }}
    </button>
    <UModal v-model:open="open" :title="t('contact.title')" :description="t('contact.description')" :ui="{ content: 'max-h-[calc(100vh-4rem)] overflow-y-auto' }">
      <template #body>
        <form class="space-y-5" @submit.prevent="save">
          <ContactsContactAvatarForm
            :mailbox-id="mailboxId"
            :address="address"
            :name="displayName"
            :has-avatar="contact?.hasAvatar ?? false"
            @avatar-change="(hasAvatar) => { if (contact) contact = { ...contact, hasAvatar } }"
          />
          <UFormField :label="t('contact.name')" name="displayName">
            <UInput v-model="displayName" class="w-full" :disabled="loading || saving" />
          </UFormField>
          <UFormField :label="t('contact.email')" name="email">
            <UInput :model-value="contact?.email ?? address" class="w-full" disabled />
          </UFormField>
          <div class="grid gap-3 rounded-lg bg-muted p-3 text-sm sm:grid-cols-2">
            <div>
              <p class="text-xs font-medium uppercase text-muted">{{ t('contact.source') }}</p>
              <p class="mt-1 capitalize text-default">{{ contact?.source ?? t('contact.sourceEmail') }}</p>
            </div>
            <div>
              <p class="text-xs font-medium uppercase text-muted">{{ t('contact.lastSeen') }}</p>
              <p class="mt-1 text-default">
                {{ contact?.lastSeenAt ? formatUserDate(contact.lastSeenAt, { month: 'short', day: '2-digit', year: 'numeric' }) : t('contact.unknown') }}
              </p>
            </div>
            <p v-if="contact?.blocked" class="text-sm font-medium text-error">{{ t('contact.blocked') }}</p>
          </div>
          <p v-if="error" role="alert" class="text-sm text-error">{{ error }}</p>
          <UButton type="submit" :disabled="loading || saving || !displayName.trim()" :label="saving ? t('contact.saving') : t('contact.save')" />
        </form>
      </template>
    </UModal>
  </template>
</template>
