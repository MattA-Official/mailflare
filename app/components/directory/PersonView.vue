<script setup lang="ts">
// Fork-only. A colleague's directory entry: contact details, groups, who they report to and who reports to
// them. Shown in a slideover from the directory on wide screens and as a page on phones.
import { useIntervalFn } from '@vueuse/core'
import { createContact } from '~/utils/contacts/contacts-page-utils'
import { formatEmailAddress } from '#lib/email/address'
import { localTimeIn, personSubtitle, type DirectoryPersonResponse } from '~/utils/directory/directory'

const props = defineProps<{ data: DirectoryPersonResponse }>()
const emit = defineEmits<{ changed: [], navigate: [] }>()

const { t } = useLanguage()
const toast = useToast()
const { copy } = useCopy()
const { openComposer } = useCompose()
const { selectedMailbox } = useSelectedMailbox()
const person = computed(() => props.data.person)
const editOpen = ref(false)

const now = ref(new Date())
useIntervalFn(() => { now.value = new Date() }, 60_000)
const localTime = computed(() => localTimeIn(person.value.timeZone, now.value))

const facts = computed(() => [
  { icon: 'i-lucide-phone', label: t('directory.phone'), value: person.value.phone, href: person.value.phone ? `tel:${person.value.phone.replace(/[^\d+]/g, '')}` : undefined },
  { icon: 'i-lucide-map-pin', label: t('directory.location'), value: person.value.location },
  { icon: 'i-lucide-clock', label: t('directory.localTime'), value: localTime.value ? t('directory.localTimeValue', { time: localTime.value, zone: person.value.timeZone ?? '' }) : null },
].filter(fact => fact.value))

const chain = computed(() => [...person.value.reportsTo].reverse().map(manager => ({ label: manager.name, to: `/directory/people/${manager.id}` })))

function email() {
  openComposer({ to: [formatEmailAddress(person.value.email, person.value.name)] })
  emit('navigate')
}

const adding = ref(false)
async function addToContacts() {
  const mailboxId = selectedMailbox.value?.id
  if (!mailboxId) return
  adding.value = true
  try {
    await createContact(mailboxId, { address: person.value.email, displayName: person.value.name })
    toast.add({ title: t('directory.addedToContacts', { name: person.value.name }), color: 'success' })
  } catch (cause) {
    toast.add({ title: cause instanceof Error ? cause.message : t('contacts.saveFailed'), color: 'error' })
  } finally {
    adding.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start gap-4">
      <DirectoryPersonAvatar :person="person" size="3xl" />
      <div class="min-w-0 flex-1 space-y-1">
        <h2 class="text-xl font-semibold text-highlighted">
          {{ person.name }}
          <span v-if="person.pronouns" class="text-sm font-normal text-muted">({{ person.pronouns }})</span>
        </h2>
        <p v-if="personSubtitle(person)" class="text-sm text-default">
          {{ personSubtitle(person) }}
        </p>
        <p class="truncate text-sm text-muted">
          {{ person.email }}
        </p>
      </div>
    </div>

    <div class="flex flex-wrap gap-2">
      <UButton icon="i-lucide-send" :label="t('directory.sendEmail')" @click="email" />
      <UButton v-if="person.bookingUrl" icon="i-lucide-calendar-plus" color="neutral" variant="outline" :label="t('directory.bookMeeting')" :to="person.bookingUrl" target="_blank" />
      <UButton icon="i-lucide-copy" color="neutral" variant="outline" :label="t('directory.copyAddress')" @click="copy(person.email, t('directory.addressCopied'))" />
      <UButton v-if="!data.isMe && selectedMailbox" icon="i-lucide-user-plus" color="neutral" variant="outline" :loading="adding" :label="t('directory.addToContacts')" @click="addToContacts" />
      <UButton v-if="data.canEdit" icon="i-lucide-pencil" color="neutral" variant="ghost" :label="data.isMe ? t('directory.editMyProfile') : t('directory.editProfile')" @click="editOpen = true" />
    </div>

    <dl v-if="facts.length" class="grid gap-3 sm:grid-cols-2">
      <div v-for="fact in facts" :key="fact.label" class="flex items-start gap-2">
        <UIcon :name="fact.icon" class="mt-0.5 size-4 shrink-0 text-dimmed" />
        <div class="min-w-0">
          <dt class="text-xs text-muted">
            {{ fact.label }}
          </dt>
          <dd class="text-sm text-default">
            <ULink v-if="fact.href" :to="fact.href" class="hover:underline">{{ fact.value }}</ULink>
            <template v-else>
              {{ fact.value }}
            </template>
          </dd>
        </div>
      </div>
    </dl>

    <p v-if="person.about" class="whitespace-pre-line text-sm text-default">
      {{ person.about }}
    </p>

    <section v-if="person.addresses.length > 1" class="space-y-2">
      <h3 class="text-sm font-semibold text-highlighted">
        {{ t('directory.addresses') }}
      </h3>
      <div class="flex flex-wrap gap-2">
        <UBadge v-for="address in person.addresses" :key="address" color="neutral" variant="soft" :label="address" />
      </div>
    </section>

    <section v-if="person.groups.length" class="space-y-2">
      <h3 class="text-sm font-semibold text-highlighted">
        {{ t('directory.groups') }}
      </h3>
      <div class="flex flex-wrap gap-2">
        <UButton
          v-for="group in person.groups"
          :key="group.id"
          :to="`/directory/groups/${group.id}`"
          size="sm"
          color="neutral"
          variant="soft"
          icon="i-lucide-network"
          :label="group.role === 'manager' ? t('directory.groupManager', { name: group.name }) : group.name"
          @click="emit('navigate')"
        />
      </div>
    </section>

    <section v-if="chain.length" class="space-y-2">
      <h3 class="text-sm font-semibold text-highlighted">
        {{ t('directory.reportsTo') }}
      </h3>
      <UBreadcrumb :items="chain" @click="emit('navigate')" />
    </section>

    <section v-if="person.directReports.length" class="space-y-2">
      <h3 class="text-sm font-semibold text-highlighted">
        {{ t('directory.directReports', { count: person.directReports.length }) }}
      </h3>
      <AppList>
        <DirectoryPersonRow v-for="report in person.directReports" :key="report.id" :person="report" :to="`/directory/people/${report.id}`" @click="emit('navigate')" />
      </AppList>
    </section>

    <UButton
      v-if="chain.length || person.directReports.length"
      icon="i-lucide-git-fork"
      color="neutral"
      variant="link"
      :label="t('directory.showInOrgChart')"
      :to="{ path: '/directory/org-chart', query: { person: person.id } }"
      @click="emit('navigate')"
    />

    <DirectoryProfileModal v-if="data.canEdit && data.profile" v-model:open="editOpen" :data="data" @saved="emit('changed')" />
  </div>
</template>
