<script setup lang="ts">
// The address book: search, add, rename, delete, change a photo, and start an email.
// Ported from legacy/src/components/contacts/contacts-page.tsx and contact-row.tsx.
import { formatEmailAddress } from '#lib/email/address'
import { formatUserDate } from '#lib/time/utils'
import { CONTACT_COLUMNS, fetchContacts, type ContactListItem } from '~/utils/contacts/contacts-page-utils'

definePageMeta({ layout: 'dashboard', nav: 'mail' })

const SEARCH_DEBOUNCE_MS = 250

const { t } = useLanguage()
useHead({ title: () => t('navigation.contacts') })
const { selectedMailbox } = useSelectedMailbox()
const { openComposer } = useCompose()
const mailboxId = computed(() => selectedMailbox.value?.id ?? '')
const input = ref('')
const query = ref('')
const editOpen = ref(false)
const editing = ref<ContactListItem | null>(null)
const deleting = ref<ContactListItem | null>(null)
const contacts = shallowRef<ContactListItem[]>([])
const loading = ref(false)
const failed = ref(false)
let request = 0

watch(input, (value, _previous, onCleanup) => {
  const timer = setTimeout(() => { query.value = value.trim() }, SEARCH_DEBOUNCE_MS)
  onCleanup(() => clearTimeout(timer))
})

async function load() {
  const id = mailboxId.value
  if (!id) return
  const current = ++request
  loading.value = true
  failed.value = false
  try {
    const list = await fetchContacts(id, query.value)
    if (current === request) contacts.value = list
  }
  catch {
    if (current === request) failed.value = true
  }
  finally {
    if (current === request) loading.value = false
  }
}
watch([mailboxId, query], load, { immediate: true })

function openCreate() {
  editing.value = null
  editOpen.value = true
}

function openEdit(contact: ContactListItem) {
  editing.value = contact
  editOpen.value = true
}

function onSaved(contact: ContactListItem) {
  if (editing.value?.email === contact.email) editing.value = contact
  void load()
}

function label(contact: ContactListItem) {
  return contact.displayName ?? contact.email
}

function sendEmail(contact: ContactListItem) {
  openComposer({ to: [formatEmailAddress(contact.email, contact.displayName)] })
}
</script>

<template>
  <UDashboardPanel id="contacts">
    <template #header>
      <AppNavbar :title="t('contacts.title')" />
    </template>
    <template #body>
      <div class="mx-auto w-full max-w-3xl space-y-6">
        <div class="flex items-center justify-between gap-4">
          <h1 class="text-2xl font-medium text-highlighted md:text-3xl">
            {{ t('contacts.title') }}
          </h1>
          <UButton icon="i-lucide-plus" :label="t('contacts.add')" :disabled="!mailboxId" @click="openCreate" />
        </div>

        <UInput
          v-model="input"
          type="search"
          icon="i-lucide-search"
          :placeholder="t('contacts.search')"
          :aria-label="t('contacts.search')"
          class="w-full"
        />

        <section>
          <div v-if="loading && contacts.length === 0" class="space-y-2">
            <USkeleton v-for="n in 3" :key="n" class="h-16 w-full rounded-lg" />
          </div>
          <p v-else-if="failed" role="alert" class="rounded-lg border border-default bg-default px-5 py-4 text-sm text-error">
            {{ t('contacts.loadFailed') }}
          </p>
          <div v-else-if="contacts.length === 0" class="flex flex-col items-center gap-2 rounded-lg border border-default bg-default px-5 py-12 text-center">
            <UIcon name="i-lucide-users-round" class="size-8 text-dimmed" />
            <p class="text-sm font-medium text-default">
              {{ query ? t('contacts.emptySearch') : t('contacts.empty') }}
            </p>
            <p v-if="!query" class="text-xs text-muted">
              {{ t('contacts.emptyHint') }}
            </p>
          </div>
          <div v-else class="overflow-hidden rounded-lg border border-default bg-default">
            <div :class="CONTACT_COLUMNS" class="border-b border-default px-5 py-3 text-xs font-medium uppercase text-muted">
              <span class="w-9" />
              <span>{{ t('common.name') }}</span>
              <span class="hidden md:block">{{ t('contact.lastSeen') }}</span>
              <span class="w-[6.5rem]" />
            </div>
            <div
              v-for="contact in contacts"
              :key="contact.id"
              :class="CONTACT_COLUMNS"
              class="group border-b border-default px-5 py-4 transition-colors last:border-b-0 hover:bg-primary/5"
            >
              <ContactsContactAvatar :mailbox-id="mailboxId" :address="contact.email" :name="contact.displayName ?? ''" :has-managed-avatar="contact.hasAvatar" />
              <div class="min-w-0">
                <p class="flex items-center gap-2 truncate text-sm font-semibold text-highlighted">
                  <span class="truncate">{{ label(contact) }}</span>
                  <UBadge v-if="contact.blocked" color="error" variant="soft" size="sm" icon="i-lucide-ban" :label="t('contact.blocked')" />
                </p>
                <p v-if="contact.displayName" class="truncate text-sm text-muted">
                  {{ contact.email }}
                </p>
              </div>
              <span class="hidden text-sm text-muted md:block">
                {{ contact.lastSeenAt ? formatUserDate(contact.lastSeenAt, { month: 'short', day: 'numeric', year: 'numeric' }) : '—' }}
              </span>
              <div class="flex shrink-0 items-center gap-1 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                <UTooltip :text="t('contacts.sendEmail', { name: label(contact) })">
                  <UButton icon="i-lucide-send" color="neutral" variant="ghost" size="sm" :aria-label="t('contacts.sendEmail', { name: label(contact) })" @click="sendEmail(contact)" />
                </UTooltip>
                <UTooltip :text="t('contacts.edit')">
                  <UButton icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" :aria-label="t('contacts.edit')" @click="openEdit(contact)" />
                </UTooltip>
                <UTooltip :text="t('contacts.delete')">
                  <UButton icon="i-lucide-trash-2" color="neutral" variant="ghost" size="sm" class="hover:text-error" :aria-label="t('contacts.delete')" @click="deleting = contact" />
                </UTooltip>
              </div>
            </div>
          </div>
        </section>
      </div>

      <ContactsEditModal v-model:open="editOpen" :mailbox-id="mailboxId" :contact="editing" @saved="onSaved" />
      <ContactsDeleteModal :mailbox-id="mailboxId" :contact="deleting" @close="deleting = null" @deleted="load" />
    </template>
  </UDashboardPanel>
</template>
