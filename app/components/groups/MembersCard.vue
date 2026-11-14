<script setup lang="ts">
// Fork-only. A group's members, shared by the Groups admin page and Settings -> Groups. Account managers
// add and remove anyone and choose managers; a group's managers add and remove ordinary members.
import type { GroupResponse } from '~/utils/admin/system/groups'
import { addGroupMember, fetchGroupCandidates, removeGroupMember, setGroupMemberRole } from '~/utils/admin/system/groups'

const props = defineProps<{ data: GroupResponse, accountLinks?: boolean }>()
const emit = defineEmits<{ changed: [] }>()
const { t } = useLanguage()
const groupId = computed(() => props.data.group.id)
const nameTag = props.accountLinks ? resolveComponent('NuxtLink') : 'span'

const { data: candidates, refresh: refreshCandidates } = useAsyncData(
  () => `group-${groupId.value}-candidates`,
  () => props.data.canManageMembers ? fetchGroupCandidates(groupId.value) : Promise.resolve(null),
  { watch: [() => props.data.canManageMembers] },
)
const candidateItems = computed(() => (candidates.value?.candidates ?? [])
  .map(account => ({ label: `${account.name} (${account.email})`, value: account.id })))

const selectedUserId = ref<string | undefined>()
const busy = ref(false)
const error = ref<string | null>(null)

async function run(action: () => Promise<void>, fallback: string) {
  busy.value = true
  error.value = null
  try {
    await action()
    emit('changed')
    await refreshCandidates()
  } catch (cause) {
    error.value = cause instanceof Error && cause.message ? cause.message : fallback
  } finally {
    busy.value = false
  }
}

function add() {
  const userId = selectedUserId.value
  if (!userId) return
  return run(async () => {
    await addGroupMember(groupId.value, userId)
    selectedUserId.value = undefined
  }, t('groups.memberAddFailed'))
}

const remove = (userId: string) => run(() => removeGroupMember(groupId.value, userId), t('groups.memberRemoveFailed'))
const setRole = (userId: string, role: 'member' | 'manager') => run(() => setGroupMemberRole(groupId.value, userId, role), t('groups.roleFailed'))

function canRemove(role: 'member' | 'manager') {
  return props.data.canManage || (props.data.canManageMembers && role === 'member')
}
</script>

<template>
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
        <component :is="nameTag" :to="accountLinks ? `/accounts/${member.userId}` : undefined" class="min-w-0 flex-1" :class="accountLinks ? 'hover:underline' : ''">
          <span class="block truncate text-sm font-medium text-highlighted">{{ member.name }}</span>
          <span class="block truncate text-xs text-muted">{{ member.email }}</span>
        </component>
        <UBadge v-if="member.disabled" color="warning" variant="subtle" :label="t('groups.disabled')" />
        <USelect
          v-if="data.canManage"
          :model-value="member.role"
          :items="[{ label: t('groups.roleMember'), value: 'member' }, { label: t('groups.roleManager'), value: 'manager' }]"
          size="sm"
          class="w-32"
          :disabled="busy"
          :aria-label="t('groups.roleFor', { name: member.name })"
          @update:model-value="(role) => setRole(member.userId, role as 'member' | 'manager')"
        />
        <UBadge v-else-if="member.role === 'manager'" color="primary" variant="subtle" :label="t('groups.roleManager')" />
        <UButton
          v-if="canRemove(member.role)"
          icon="i-lucide-user-minus"
          color="error"
          variant="ghost"
          :aria-label="t('groups.removeMember', { name: member.name })"
          :disabled="busy"
          @click="remove(member.userId)"
        />
      </li>
    </ul>
    <template v-if="data.canManageMembers" #footer>
      <form class="flex gap-2" @submit.prevent="add">
        <USelectMenu
          v-model="selectedUserId"
          :items="candidateItems"
          value-key="value"
          :placeholder="candidateItems.length ? t('groups.chooseAccount') : t('groups.noAccountsToAdd')"
          :disabled="!candidateItems.length"
          class="min-w-0 flex-1"
        />
        <UButton type="submit" icon="i-lucide-user-plus" :disabled="!selectedUserId || busy" :label="t('groups.addMember')" />
      </form>
      <p v-if="error" role="alert" class="mt-2 text-sm text-error">
        {{ error }}
      </p>
    </template>
  </UCard>
</template>
