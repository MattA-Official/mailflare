<script setup lang="ts">
// The address book: search, add, rename, delete, change a photo, and start an email.
// Ported from legacy/src/components/contacts/contacts-page.tsx and contact-row.tsx.
// Fork-only: Saved and Other tabs, paging, a detail panel per contact and a row menu instead of hover buttons.
import type { DropdownMenuItem, TabsItem } from '@nuxt/ui'
import { formatEmailAddress } from '#lib/email/address'
import { formatUserDate } from '#lib/time/utils'
import { CONTACT_COLUMNS, fetchContacts, type ContactListItem, type ContactsFilter, type ContactsPage } from '~/utils/contacts/contacts-page-utils'

definePageMeta({ layout: 'dashboard', nav: 'mail' })

const SEARCH_DEBOUNCE_MS = 250

const { t } = useLanguage()
const { selectedMailbox } = useSelectedMailbox()
const { openComposer } = useCompose()
const mailboxId = computed(() => selectedMailbox.value?.id ?? '')
const input = ref('')
const query = ref('')
const filter = ref<ContactsFilter>('saved')
const createOpen = ref(false)
const selectedEmail = ref<string | null>(null)
const deleting = ref<ContactListItem | null>(null)
const more = shallowRef<ContactListItem[]>([])
const nextCursor = ref<string | null>(null)
const loadingMore = ref(false)
const loadMoreFailed = ref(false)

const tabs = computed<TabsItem[]>(() => [
  { label: t('contacts.tabs.saved'), value: 'saved', icon: 'i-lucide-bookmark' },
  { label: t('contacts.tabs.other'), value: 'other', icon: 'i-lucide-inbox' },
])

watch(input, (value, _previous, onCleanup) => {
  const timer = setTimeout(() => { query.value = value.trim() }, SEARCH_DEBOUNCE_MS)
  onCleanup(() => clearTimeout(timer))
})

const emptyPage = (): ContactsPage => ({ contacts: [], nextCursor: null })

// One key for the page, so the current list stays on screen while a search, tab or mailbox switch loads.
const { data: firstPage, status, error, refresh } = useAsyncData(
  'contacts-page',
  () => mailboxId.value ? fetchContacts(mailboxId.value, query.value, filter.value) : Promise.resolve(emptyPage()),
  { watch: [mailboxId, query, filter], default: emptyPage },
)

// Later pages are appended by "Show more" and dropped whenever the first page reloads.
watch(firstPage, (page) => {
  more.value = []
  nextCursor.value = page.nextCursor
  loadMoreFailed.value = false
}, { immediate: true })

const contacts = computed(() => [...firstPage.value.contacts, ...more.value])
const selected = computed(() => contacts.value.find(contact => contact.email === selectedEmail.value) ?? null)
const loading = computed(() => status.value === 'pending')
const failed = computed(() => Boolean(error.value))

async function loadMore() {
  if (!nextCursor.value || loadingMore.value) return
  loadingMore.value = true
  loadMoreFailed.value = false
  try {
    const page = await fetchContacts(mailboxId.value, query.value, filter.value, nextCursor.value)
    more.value = [...more.value, ...page.contacts]
    nextCursor.value = page.nextCursor
  }
  catch {
    loadMoreFailed.value = true
  }
  finally {
    loadingMore.value = false
  }
}

function load() {
  return refresh()
}

function label(contact: ContactListItem) {
  return contact.displayName ?? contact.email
}

function sendEmail(contact: ContactListItem) {
  openComposer({ to: [formatEmailAddress(contact.email, contact.displayName)] })
}

function onCreated(contact: ContactListItem) {
  filter.value = 'saved'
  void load()
  selectedEmail.value = contact.email
}

function onDeleted(contact: ContactListItem) {
  if (selectedEmail.value === contact.email) selectedEmail.value = null
  void load()
}

function rowMenu(contact: ContactListItem): DropdownMenuItem[] {
  return [
    { label: t('contacts.panel.write'), icon: 'i-lucide-send', onSelect: () => sendEmail(contact) },
    { label: t('contacts.panel.open'), icon: 'i-lucide-panel-right-open', onSelect: () => { selectedEmail.value = contact.email } },
    { type: 'separator' },
    { label: t('contacts.delete'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => { deleting.value = contact } },
  ]
}
</script>

<template>
  <AppPage id="contacts" :title="t('contacts.title')">
    <template #actions>
      <UButton icon="i-lucide-plus" :label="t('contacts.add')" :disabled="!mailboxId" @click="createOpen = true" />
    </template>
    <!-- Room under the phone Compose button. -->
    <div class="space-y-6 max-md:pb-20">
      <div class="space-y-3">
        <UTabs v-model="filter" :items="tabs" :content="false" />
        <p class="text-sm text-muted">
          {{ t(filter === 'saved' ? 'contacts.tabs.savedHint' : 'contacts.tabs.otherHint') }}
        </p>
        <UInput
          v-model="input"
          type="search"
          icon="i-lucide-search"
          class="w-full"
          :placeholder="t('contacts.search')"
          :aria-label="t('contacts.search')"
        />
      </div>

      <section>
        <div v-if="loading && contacts.length === 0" class="space-y-2">
          <USkeleton v-for="n in 3" :key="n" class="h-16 w-full rounded-lg" />
        </div>
        <UAlert v-else-if="failed" role="alert" color="error" variant="subtle" :title="t('contacts.loadFailed')" />
        <UEmpty
          v-else-if="contacts.length === 0"
          variant="outline"
          icon="i-lucide-users-round"
          :title="query ? t('contacts.emptySearch') : t(filter === 'saved' ? 'contacts.emptySaved' : 'contacts.emptyOther')"
          :description="query ? undefined : t(filter === 'saved' ? 'contacts.emptySavedHint' : 'contacts.emptyHint')"
        />
        <template v-else>
          <div class="overflow-hidden rounded-lg border border-default bg-default">
            <div :class="CONTACT_COLUMNS" class="border-b border-default px-5 py-3 text-xs font-medium uppercase text-muted">
              <span class="w-9" />
              <span>{{ t('common.name') }}</span>
              <span class="hidden md:block">{{ t('contact.lastSeen') }}</span>
              <span class="w-8" />
            </div>
            <div
              v-for="contact in contacts"
              :key="contact.id"
              :class="CONTACT_COLUMNS"
              class="relative border-b border-default px-5 py-3 transition-colors last:border-b-0 hover:bg-primary/5"
            >
              <ContactsContactAvatar :mailbox-id="mailboxId" :address="contact.email" :name="contact.displayName ?? ''" :has-managed-avatar="contact.hasAvatar" />
              <!-- The name opens the contact; the whole row is the target on a phone. -->
              <button
                type="button"
                class="min-w-0 py-1 text-left after:absolute after:inset-0 md:after:hidden"
                :aria-label="t('contacts.panel.openFor', { name: label(contact) })"
                @click="selectedEmail = contact.email"
              >
                <span class="flex items-center gap-2 truncate text-sm font-semibold text-highlighted">
                  <span class="truncate">{{ label(contact) }}</span>
                  <UBadge v-if="contact.blocked" color="error" variant="soft" size="sm" icon="i-lucide-ban" :label="t('contact.blocked')" />
                </span>
                <span v-if="contact.displayName" class="block truncate text-sm text-muted">
                  {{ contact.email }}
                </span>
              </button>
              <span class="hidden text-sm text-muted md:block">
                {{ contact.lastSeenAt ? formatUserDate(contact.lastSeenAt, { month: 'short', day: 'numeric', year: 'numeric' }) : '—' }}
              </span>
              <UDropdownMenu :items="rowMenu(contact)" :content="{ align: 'end' }">
                <UButton
                  icon="i-lucide-ellipsis"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  class="relative"
                  :aria-label="t('contacts.panel.actionsFor', { name: label(contact) })"
                />
              </UDropdownMenu>
            </div>
          </div>
          <div v-if="nextCursor || loadMoreFailed" class="mt-4 flex flex-col items-center gap-2">
            <UAlert v-if="loadMoreFailed" role="alert" color="error" variant="subtle" :title="t('contacts.loadFailed')" />
            <UButton
              v-if="nextCursor"
              color="neutral"
              variant="outline"
              icon="i-lucide-chevrons-down"
              :loading="loadingMore"
              :label="t('contacts.showMore')"
              @click="loadMore"
            />
          </div>
        </template>
      </section>
    </div>

    <ContactsEditModal v-model:open="createOpen" :mailbox-id="mailboxId" :contact="null" @saved="onCreated" />
    <ContactsDetailPanel
      :mailbox-id="mailboxId"
      :contact="selected"
      @close="selectedEmail = null"
      @changed="load()"
      @delete="contact => { deleting = contact }"
    />
    <ContactsDeleteModal :mailbox-id="mailboxId" :contact="deleting" @close="deleting = null" @deleted="onDeleted" />
  </AppPage>
</template>
