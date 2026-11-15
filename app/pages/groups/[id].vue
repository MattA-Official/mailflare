<script setup lang="ts">
// Fork-only. One group: its name, its members and the shared inboxes it can reach.
import { addSubgroup, deleteGroup, fetchGroup, getGroupMailboxAddress, removeSubgroup, updateGroup } from '~/utils/admin/system/groups'

definePageMeta({ layout: 'dashboard', nav: 'admin', auth: { role: 'admin', requireMailbox: true } })

const { t } = useLanguage()
const route = useRoute()
const id = computed(() => String(route.params.id))
const { data, error, refresh } = useAsyncData(() => `group-${id.value}`, () => fetchGroup(id.value))
const canManage = computed(() => data.value?.canManage === true)
useHead({ title: () => data.value?.group.name ?? t('groups.title') })

const name = ref('')
const description = ref('')
watch(() => data.value?.group, (group) => {
  if (!group) return
  name.value = group.name
  description.value = group.description ?? ''
}, { immediate: true })

const saving = ref(false)
const message = ref<{ ok: boolean, text: string } | null>(null)
async function save() {
  if (!name.value.trim()) return
  saving.value = true
  message.value = null
  try {
    await updateGroup(id.value, { name: name.value.trim(), description: description.value.trim() || null })
    await refresh()
    message.value = { ok: true, text: t('groups.saved') }
  } catch (cause) {
    message.value = { ok: false, text: cause instanceof Error ? cause.message : t('groups.saveFailed') }
  } finally {
    saving.value = false
  }
}

// Fork-only (nested groups): groups inside this one get everything shared with it.
const subgroupId = ref<string | undefined>()
const subgroupItems = computed(() => (data.value?.group.subgroupOptions ?? []).map(group => ({ label: group.name, value: group.id, icon: 'i-lucide-network' })))
const subgroupBusy = ref(false)
const subgroupError = ref<string | null>(null)
async function changeSubgroup(action: 'add' | 'remove', groupId: string) {
  subgroupBusy.value = true
  subgroupError.value = null
  try {
    if (action === 'add') await addSubgroup(id.value, groupId)
    else await removeSubgroup(id.value, groupId)
    subgroupId.value = undefined
    await refresh()
  } catch (cause) {
    subgroupError.value = cause instanceof Error && cause.message ? cause.message : t('groups.subgroupFailed')
  } finally {
    subgroupBusy.value = false
  }
}

const deleteOpen = ref(false)
const deleting = ref(false)
async function remove() {
  deleting.value = true
  try {
    await deleteGroup(id.value)
    await navigateTo('/groups', { replace: true })
  } catch {
    message.value = { ok: false, text: t('groups.deleteFailed') }
    deleteOpen.value = false
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <AdminSystemPage id="group" :title="data?.group.name ?? t('groups.title')">
    <template #actions>
      <UButton color="neutral" variant="ghost" icon="i-lucide-arrow-left" to="/groups" :label="t('groups.back')" />
    </template>

    <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="error.message || t('groups.loadFailed')" role="alert" />

    <template v-if="data">
      <p v-if="data.group.parents.length" class="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted">
        <span>{{ t('groups.inside') }}</span>
        <template v-for="(parent, index) in data.group.parents" :key="parent.id">
          <span v-if="index" aria-hidden="true">·</span>
          <NuxtLink :to="`/groups/${parent.id}`" class="text-highlighted hover:underline">{{ parent.name }}</NuxtLink>
        </template>
      </p>
      <UCard v-if="canManage">
        <form class="space-y-4" @submit.prevent="save">
          <UFormField :label="t('groups.name')" required>
            <UInput v-model="name" />
          </UFormField>
          <UFormField :label="t('groups.descriptionLabel')" :hint="t('groups.optional')">
            <UTextarea v-model="description" :rows="2" />
          </UFormField>
          <div class="flex items-center gap-3">
            <UButton type="submit" :loading="saving" :disabled="!name.trim()" :label="saving ? t('common.saving') : t('common.save')" />
            <p v-if="message" role="status" class="text-sm" :class="message.ok ? 'text-success' : 'text-error'">
              {{ message.text }}
            </p>
          </div>
        </form>
      </UCard>
      <p v-else-if="data.group.description" class="text-sm text-muted">
        {{ data.group.description }}
      </p>

      <GroupsMembersCard :data="data" account-links @changed="refresh()" />

      <UCard v-if="canManage || data.group.subgroups.length" :ui="{ body: 'p-0 sm:p-0', footer: 'p-4 sm:px-5' }">
        <template #header>
          <h2 class="text-sm font-semibold text-highlighted">
            {{ t('groups.subgroupsTitle') }}
          </h2>
          <p class="mt-1 text-xs text-muted">
            {{ t('groups.subgroupsHint') }}
          </p>
        </template>
        <p v-if="!data.group.subgroups.length" class="px-5 py-4 text-sm text-muted">
          {{ t('groups.noSubgroups') }}
        </p>
        <ul v-else class="divide-y divide-default">
          <li v-for="subgroup in data.group.subgroups" :key="subgroup.id" class="flex items-center gap-3 px-5 py-3">
            <NuxtLink :to="`/groups/${subgroup.id}`" class="flex min-w-0 flex-1 items-center gap-3 hover:underline">
              <UIcon name="i-lucide-network" class="size-4 shrink-0 text-dimmed" />
              <span class="min-w-0 flex-1 truncate text-sm font-medium text-highlighted">{{ subgroup.name }}</span>
            </NuxtLink>
            <span class="shrink-0 text-sm text-muted">{{ t('groups.memberCount', { count: subgroup.memberCount }) }}</span>
            <UButton v-if="canManage" icon="i-lucide-x" color="neutral" variant="ghost" size="sm" :aria-label="t('groups.removeSubgroup', { name: subgroup.name })" :disabled="subgroupBusy" @click="changeSubgroup('remove', subgroup.id)" />
          </li>
        </ul>
        <template v-if="canManage" #footer>
          <form class="flex gap-2" @submit.prevent="subgroupId && changeSubgroup('add', subgroupId)">
            <USelect v-model="subgroupId" :items="subgroupItems" :placeholder="subgroupItems.length ? t('groups.chooseSubgroup') : t('groups.noSubgroupOptions')" :disabled="!subgroupItems.length" class="min-w-0 flex-1" />
            <UButton type="submit" icon="i-lucide-plus" :disabled="!subgroupId || subgroupBusy" :label="t('groups.addSubgroup')" />
          </form>
          <p v-if="subgroupError" role="alert" class="mt-2 text-sm text-error">
            {{ subgroupError }}
          </p>
        </template>
      </UCard>

      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <template #header>
          <h2 class="text-sm font-semibold text-highlighted">
            {{ t('groups.inboxesTitle') }}
          </h2>
          <p class="mt-1 text-xs text-muted">
            {{ t('groups.inboxesHint') }}
          </p>
        </template>
        <p v-if="!data.group.mailboxes.length" class="px-5 py-4 text-sm text-muted">
          {{ t('groups.noInboxes') }}
        </p>
        <ul v-else class="divide-y divide-default">
          <li v-for="mailbox in data.group.mailboxes" :key="mailbox.id">
            <NuxtLink :to="`/mailboxes/${mailbox.id}`" class="flex items-center gap-3 px-5 py-3 hover:bg-elevated/50">
              <UIcon name="i-lucide-inbox" class="size-4 shrink-0 text-dimmed" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium text-highlighted">{{ mailbox.displayName || mailbox.localPart }}</span>
                <span class="block truncate text-xs text-muted">{{ getGroupMailboxAddress(mailbox) }}</span>
              </span>
              <UBadge v-if="mailbox.managed" color="primary" variant="subtle" :label="t('groups.managesInbox')" />
              <UBadge v-if="mailbox.inheritedFrom" color="neutral" variant="soft" :label="t('groups.inheritedFrom', { name: mailbox.inheritedFrom.name })" />
              <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-muted" />
            </NuxtLink>
          </li>
        </ul>
      </UCard>

      <div v-if="canManage">
        <UButton color="error" variant="outline" icon="i-lucide-trash-2" :label="t('groups.delete')" @click="deleteOpen = true" />
      </div>
    </template>

    <UModal v-model:open="deleteOpen" :dismissible="!deleting" :title="t('groups.delete')" :description="data ? t('groups.deleteConfirm', { name: data.group.name }) : ''">
      <template #footer>
        <UButton color="neutral" variant="outline" :disabled="deleting" :label="t('common.cancel')" @click="deleteOpen = false" />
        <UButton color="error" :loading="deleting" :label="t('groups.delete')" @click="remove" />
      </template>
    </UModal>
  </AdminSystemPage>
</template>
