<script setup lang="ts">
// Fork-only. One group: its name, its members and the shared inboxes it can reach.
import { fetchAccounts } from '~/utils/admin/system/accounts'
import { addGroupMember, deleteGroup, fetchGroup, getGroupMailboxAddress, removeGroupMember, updateGroup } from '~/utils/admin/system/groups'

definePageMeta({ layout: 'dashboard', nav: 'admin', auth: { role: 'admin', requireMailbox: true } })

const { t } = useLanguage()
const route = useRoute()
const id = computed(() => String(route.params.id))
const { data, error, refresh } = useAsyncData(() => `group-${id.value}`, () => fetchGroup(id.value))
const canManage = computed(() => data.value?.canManage === true)
const { data: accounts } = useAsyncData('group-candidate-accounts', () => canManage.value ? fetchAccounts() : Promise.resolve(null), { watch: [canManage] })
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

const memberIds = computed(() => new Set((data.value?.group.members ?? []).map(member => member.userId)))
const candidateItems = computed(() => (accounts.value?.accounts ?? [])
  .filter(account => !account.disabled && !account.deletedAt && !memberIds.value.has(account.id))
  .map(account => ({ label: `${account.name} (${account.email})`, value: account.id })))
const selectedUserId = ref<string | undefined>()
const memberBusy = ref(false)
const memberError = ref<string | null>(null)
async function addMember() {
  if (!selectedUserId.value) return
  memberBusy.value = true
  memberError.value = null
  try {
    await addGroupMember(id.value, selectedUserId.value)
    selectedUserId.value = undefined
    await refresh()
  } catch (cause) {
    memberError.value = cause instanceof Error ? cause.message : t('groups.memberAddFailed')
  } finally {
    memberBusy.value = false
  }
}
async function removeMember(userId: string) {
  memberBusy.value = true
  memberError.value = null
  try {
    await removeGroupMember(id.value, userId)
    await refresh()
  } catch (cause) {
    memberError.value = cause instanceof Error ? cause.message : t('groups.memberRemoveFailed')
  } finally {
    memberBusy.value = false
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

    <p v-if="error" role="alert" class="text-sm text-error">
      {{ error.message || t('groups.loadFailed') }}
    </p>

    <template v-if="data">
      <UCard v-if="canManage">
        <form class="space-y-4" @submit.prevent="save">
          <UFormField :label="t('groups.name')" required>
            <UInput v-model="name" class="w-full" />
          </UFormField>
          <UFormField :label="t('groups.descriptionLabel')" :hint="t('groups.optional')">
            <UTextarea v-model="description" :rows="2" class="w-full" />
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

      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <template #header>
          <h2 class="text-sm font-semibold text-highlighted">
            {{ t('groups.membersTitle') }}
          </h2>
          <p class="mt-1 text-xs text-muted">
            {{ t('groups.membersHint') }}
          </p>
        </template>
        <p v-if="!data.group.members.length" class="px-5 py-4 text-sm text-muted">
          {{ t('groups.noMembers') }}
        </p>
        <ul v-else class="divide-y divide-default">
          <li v-for="member in data.group.members" :key="member.userId" class="flex items-center gap-3 px-5 py-3">
            <AdminSystemAvatar :name="member.name" :email="member.email" />
            <NuxtLink :to="`/accounts/${member.userId}`" class="min-w-0 flex-1 hover:underline">
              <span class="block truncate text-sm font-medium text-highlighted">{{ member.name }}</span>
              <span class="block truncate text-xs text-muted">{{ member.email }}</span>
            </NuxtLink>
            <UBadge v-if="member.disabled" color="warning" variant="subtle" :label="t('groups.disabled')" />
            <UButton
              v-if="canManage"
              icon="i-lucide-user-minus"
              color="error"
              variant="ghost"
              :aria-label="t('groups.removeMember', { name: member.name })"
              :disabled="memberBusy"
              @click="removeMember(member.userId)"
            />
          </li>
        </ul>
        <template v-if="canManage" #footer>
          <form class="flex gap-2" @submit.prevent="addMember">
            <USelectMenu
              v-model="selectedUserId"
              :items="candidateItems"
              value-key="value"
              :placeholder="candidateItems.length ? t('groups.chooseAccount') : t('groups.noAccountsToAdd')"
              :disabled="!candidateItems.length"
              class="min-w-0 flex-1"
            />
            <UButton type="submit" icon="i-lucide-user-plus" :disabled="!selectedUserId || memberBusy" :label="t('groups.addMember')" />
          </form>
          <p v-if="memberError" role="alert" class="mt-2 text-sm text-error">
            {{ memberError }}
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
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" :disabled="deleting" :label="t('common.cancel')" @click="deleteOpen = false" />
          <UButton color="error" :loading="deleting" :label="t('groups.delete')" @click="remove" />
        </div>
      </template>
    </UModal>
  </AdminSystemPage>
</template>
