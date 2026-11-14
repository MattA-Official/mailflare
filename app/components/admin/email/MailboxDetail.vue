<script setup lang="ts">
// Settings for one mailbox: name, avatar, aliases, shared access and deletion.
// Ported from legacy/src/app/(admin)/mailboxes/[id]/page.tsx. Mounted by /mailboxes/[id] and
// /settings/mailboxes/[id].
import type { MailboxDetail } from '~/types/admin/email/mailboxes'
import { errorMessage } from '~/utils/admin/email/domains'
import { useAdminConfirm } from '~/utils/admin/email/confirm'
import {
  createMailboxAlias, deleteMailbox, deleteMailboxAlias, fetchMailbox, fetchMailboxAliases, fetchSharedInboxAccess,
  getMailboxAddress, getMailboxesBase, grantSharedInboxAccess, revokeSharedInboxAccess, updateMailboxSettings,
} from '~/utils/admin/email/mailboxes'
import type { AccessRoute, AccessSummaryPerson } from '~/utils/admin/system/groups'
import { addMailboxManager, fetchMailboxAccessSummary, fetchMailboxGroupAccess, grantMailboxGroupAccess, removeMailboxManager, revokeMailboxGroupAccess } from '~/utils/admin/system/groups'

const props = defineProps<{ mailboxId: string }>()
const { t } = useLanguage()
const route = useRoute()
const { confirm } = useAdminConfirm()

const { data: mailbox, error: loadError, status: loadStatus } = useAsyncData(`mailbox-${props.mailboxId}`, () => fetchMailbox(props.mailboxId), { watch: [() => props.mailboxId] })
const loading = computed(() => loadStatus.value === 'pending')
const address = computed(() => mailbox.value ? getMailboxAddress(mailbox.value) : '')
// The page shows the address as its title.
const emit = defineEmits<{ loaded: [address: string] }>()
watch(address, value => value && emit('loaded', value), { immediate: true })
// Fork-only: a shared inbox held by its own hidden account has settings of its own.
const heldByInbox = computed(() => mailbox.value?.type === 'shared' && mailbox.value.userId === `inbox_${mailbox.value.id}`)

const displayName = ref('')
const useAllDomains = ref(true)
const aliasLocalPart = ref('')
const aliasDomainId = ref<string | undefined>()
const selectedUserId = ref<string | undefined>()

watch(mailbox, (value) => {
  if (!value) return
  displayName.value = value.displayName ?? ''
  useAllDomains.value = value.useAllDomains
  aliasDomainId.value ||= value.domainId
}, { immediate: true })

// Settings form
const saving = ref(false)
const saveState = ref<{ ok: boolean, text: string } | null>(null)
async function save() {
  saving.value = true
  saveState.value = null
  try {
    mailbox.value = await updateMailboxSettings(props.mailboxId, { displayName: displayName.value, useAllDomains: useAllDomains.value }) as MailboxDetail
    saveState.value = { ok: true, text: t('mailbox.saved') }
  } catch (error) {
    saveState.value = { ok: false, text: errorMessage(error, t('mailbox.updateFailed')) }
  } finally {
    saving.value = false
  }
}

// Aliases
const { data: aliases, status: aliasesStatus, error: aliasesError, refresh: refreshAliases } = useAsyncData(`mailbox-${props.mailboxId}-aliases`, () => fetchMailboxAliases(props.mailboxId), { watch: [() => props.mailboxId] })
const aliasDomainItems = computed(() => (aliases.value?.availableDomains ?? []).map(domain => ({ label: `@${domain.hostname}`, value: domain.id })))
const aliasBusy = ref<'add' | 'remove' | null>(null)
const aliasError = ref<string | null>(null)
async function addAlias() {
  if (!aliasLocalPart.value.trim() || !aliasDomainId.value) return
  aliasBusy.value = 'add'
  aliasError.value = null
  try {
    await createMailboxAlias(props.mailboxId, { domainId: aliasDomainId.value, localPart: aliasLocalPart.value.trim() })
    aliasLocalPart.value = ''
    await refreshAliases()
  } catch (error) {
    aliasError.value = errorMessage(error, t('mailbox.aliasAddFailed'))
  } finally {
    aliasBusy.value = null
  }
}
async function removeAlias(aliasId: string) {
  aliasBusy.value = 'remove'
  aliasError.value = null
  try {
    await deleteMailboxAlias(props.mailboxId, aliasId)
    await refreshAliases()
  } catch (error) {
    aliasError.value = errorMessage(error, t('mailbox.aliasRemoveFailed'))
  } finally {
    aliasBusy.value = null
  }
}

// Shared access
const canManageSharing = computed(() => mailbox.value?.canManageSharing === true)
const { data: sharedAccess, status: sharedStatus, error: sharedError, refresh: refreshShared } = useAsyncData(
  `mailbox-${props.mailboxId}-access`,
  () => canManageSharing.value ? fetchSharedInboxAccess(props.mailboxId) : Promise.resolve(null),
  { watch: [canManageSharing] },
)
// Fork-only: shared inboxes can also be given to a group; the picker offers groups and people together.
const { data: groupAccess, refresh: refreshGroups } = useAsyncData(
  `mailbox-${props.mailboxId}-group-access`,
  () => canManageSharing.value ? fetchMailboxGroupAccess(props.mailboxId) : Promise.resolve(null),
  { watch: [canManageSharing] },
)
const accountItems = computed(() => (sharedAccess.value?.availableUsers ?? [])
  .filter(account => !sharedAccess.value?.members.some(member => member.userId === account.id))
  .map(account => ({ label: `${account.name} (${account.email})`, value: `user:${account.id}`, icon: 'i-lucide-user' })))
const groupItems = computed(() => (groupAccess.value?.availableGroups ?? [])
  .filter(group => !groupAccess.value?.groups.some(grant => grant.groupId === group.id))
  .map(group => ({ label: `${group.name} (${t('groups.memberCount', { count: group.memberCount })})`, value: `group:${group.id}`, icon: 'i-lucide-network' })))
const memberItems = computed(() => [
  ...(groupItems.value.length ? [[{ type: 'label' as const, label: t('groups.title') }, ...groupItems.value]] : []),
  ...(accountItems.value.length ? [[{ type: 'label' as const, label: t('groups.people') }, ...accountItems.value]] : []),
])
// Nobody left to add: either no other accounts exist yet, or every account already has access.
const noAccountsToAdd = computed(() => !!sharedAccess.value && accountItems.value.length === 0 && groupItems.value.length === 0)
const memberBusy = ref(false)
const memberError = ref<string | null>(null)
async function addMember() {
  if (!selectedUserId.value) return
  memberBusy.value = true
  memberError.value = null
  const [kind, id] = selectedUserId.value.split(/:(.*)/s) as ['user' | 'group', string]
  try {
    if (kind === 'group') {
      await grantMailboxGroupAccess(props.mailboxId, id)
      await refreshGroups()
    } else {
      await grantSharedInboxAccess(props.mailboxId, id)
      await refreshShared()
    }
    selectedUserId.value = undefined
  } catch (error) {
    memberError.value = errorMessage(error, t('mailbox.accountAddFailed'))
  } finally {
    memberBusy.value = false
  }
}
// Fork-only: everyone who can use the inbox and how, loaded when opened and after each change.
const summaryOpen = ref(false)
const summary = ref<AccessSummaryPerson[] | null>(null)
const summaryError = ref(false)
async function loadSummary() {
  if (!summaryOpen.value) return
  summaryError.value = false
  try {
    summary.value = (await fetchMailboxAccessSummary(props.mailboxId)).people
  } catch {
    summaryError.value = true
  }
}
watch(summaryOpen, loadSummary)
watch([sharedAccess, groupAccess], loadSummary)
const permissionLabels = computed<Record<AccessSummaryPerson['permission'], string>>(() => ({
  read_only: t('groups.permission.readOnly'),
  send_on_behalf: t('groups.permission.sendOnBehalf'),
  send_as: t('groups.permission.sendAs'),
  full_access: t('groups.permission.fullAccess'),
}))
function routeLabel(route: AccessRoute) {
  if (route.kind === 'owner') return t('groups.via.owner')
  if (route.kind === 'direct') return t('groups.via.direct')
  // Fork-only (nested groups): a member of a sub-group reaches the inbox through the group above it.
  if (route.memberGroupName) return t('groups.via.subgroup', { name: route.memberGroupName, parent: route.groupName ?? '' })
  if (route.managesInbox) return t('groups.via.managerGroup', { name: route.groupName ?? '' })
  return t('groups.via.group', { name: route.groupName ?? '' })
}

// Fork-only: groups can manage the inbox. Their members always have full access and can manage who has it
// (server/lib/groups/managers.ts).
const managerGroupIds = computed(() => new Set(groupAccess.value?.managerGroupIds ?? []))
const managerBusy = ref(false)
async function toggleManager(groupId: string) {
  managerBusy.value = true
  memberError.value = null
  try {
    if (managerGroupIds.value.has(groupId)) await removeMailboxManager(props.mailboxId, groupId)
    else await addMailboxManager(props.mailboxId, groupId)
    await refreshGroups()
  } catch (error) {
    memberError.value = errorMessage(error, t('groups.managerFailed'))
  } finally {
    managerBusy.value = false
  }
}

async function removeGroup(groupId: string) {
  memberBusy.value = true
  memberError.value = null
  try {
    await revokeMailboxGroupAccess(props.mailboxId, groupId)
    await refreshGroups()
  } catch (error) {
    memberError.value = errorMessage(error, t('mailbox.accountAddFailed'))
  } finally {
    memberBusy.value = false
  }
}
async function removeMember(userId: string) {
  memberBusy.value = true
  try {
    await revokeSharedInboxAccess(props.mailboxId, userId)
    await refreshShared()
  } catch (error) {
    memberError.value = errorMessage(error, t('mailbox.accountAddFailed'))
  } finally {
    memberBusy.value = false
  }
}

// Danger zone
const deleting = ref(false)
const deleteError = ref<string | null>(null)
async function remove() {
  if (!(await confirm({ title: t('mailbox.delete'), description: t('mailbox.deleteConfirm', { address: address.value }), color: 'error', confirmLabel: t('mailbox.delete') }))) return
  deleting.value = true
  deleteError.value = null
  try {
    await deleteMailbox(props.mailboxId)
    await navigateTo(getMailboxesBase(route.path))
  } catch (error) {
    deleteError.value = errorMessage(error, t('mailbox.deleteFailed'))
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div v-if="mailbox?.type === 'shared' || mailbox?.isPrimary" class="flex items-center gap-2">
      <UBadge v-if="mailbox?.type === 'shared'" color="neutral" variant="soft" :label="t('mailboxes.shared')" />
      <UBadge v-if="mailbox?.isPrimary" color="neutral" variant="soft" :label="t('mailbox.primary')" />
    </div>

    <UAlert v-if="loadError" color="error" variant="subtle" :title="errorMessage(loadError, t('mailbox.loadFailed'))" />

    <UCard>
      <template #header>
        <h2 class="font-semibold text-highlighted">
          {{ t('mailbox.account') }}
        </h2>
      </template>
      <form class="space-y-4" @submit.prevent="save">
        <AdminEmailMailboxAvatarForm v-if="mailbox" :mailbox-id="mailbox.id" :has-avatar="!!mailbox.hasAvatar" :name="mailbox.displayName || mailbox.localPart" />
        <USkeleton v-else class="size-24 rounded-full" />
        <UFormField :label="t('common.name')">
          <UInput v-model="displayName" :placeholder="mailbox?.localPart ?? t('mailboxes.namePlaceholder')" :disabled="loading || saving" class="w-full" />
        </UFormField>
        <div class="rounded-lg bg-elevated/60 p-4">
          <UCheckbox v-model="useAllDomains" :disabled="loading || saving" :label="t('aliases.useAll')" :description="t('mailbox.useAllHint')" />
        </div>
        <p v-if="saveState" class="text-sm" :class="saveState.ok ? 'text-success' : 'text-error'">
          {{ saveState.text }}
        </p>
        <UButton type="submit" icon="i-lucide-save" :disabled="loading || saving" :label="saving ? t('common.saving') : t('settings.mailbox.saveChanges')" />
      </form>
    </UCard>

    <AdminEmailSharedInboxSettings v-if="heldByInbox" :mailbox-id="mailboxId" />

    <UCard>
      <template #header>
        <h2 class="font-semibold text-highlighted">
          {{ t('mailbox.aliases') }}
        </h2>
        <p class="mt-1 text-sm text-muted">
          {{ t('mailbox.aliasesDescription') }}
        </p>
      </template>
      <div class="space-y-3">
        <USkeleton v-if="aliasesStatus === 'pending' && !aliases" class="h-12 w-full rounded-lg" />
        <div v-for="alias in aliases?.aliases ?? []" :key="alias.id" class="flex items-center justify-between gap-3 rounded-lg bg-elevated/60 px-4 py-3">
          <div class="flex min-w-0 items-center gap-2">
            <UIcon name="i-lucide-at-sign" class="size-4 shrink-0 text-dimmed" />
            <p class="truncate text-sm font-medium text-highlighted">
              {{ alias.localPart }}@{{ alias.hostname }}
            </p>
          </div>
          <UButton
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            :aria-label="t('mailbox.removeAddress', { address: `${alias.localPart}@${alias.hostname}` })"
            :disabled="aliasBusy === 'remove'"
            @click="removeAlias(alias.id)"
          />
        </div>
        <p v-if="aliases && aliases.aliases.length === 0" class="rounded-lg bg-elevated/60 px-4 py-3 text-sm text-muted">
          {{ t('mailbox.noAliases') }}
        </p>
        <p v-if="aliasesError" class="text-sm text-error">
          {{ errorMessage(aliasesError, t('mailbox.aliasesLoadFailed')) }}
        </p>
        <form class="flex flex-wrap gap-2 sm:flex-nowrap" @submit.prevent="addAlias">
          <UInput v-model="aliasLocalPart" :placeholder="t('mailbox.aliasPlaceholder')" class="min-w-0 flex-1" :disabled="aliasBusy === 'add'" autocomplete="off" spellcheck="false" />
          <USelect v-model="aliasDomainId" :items="aliasDomainItems" class="min-w-0 flex-1" :disabled="aliasBusy === 'add'" />
          <UButton type="submit" icon="i-lucide-at-sign" :disabled="!aliasLocalPart.trim() || !aliasDomainId || aliasBusy === 'add'" :label="aliasBusy === 'add' ? t('account.mailboxes.adding') : t('mailbox.addAlias')" />
        </form>
        <p v-if="aliasError" class="text-sm text-error">
          {{ aliasError }}
        </p>
      </div>
    </UCard>

    <UCard v-if="canManageSharing">
      <template #header>
        <h2 class="font-semibold text-highlighted">
          {{ t('mailbox.sharedAccess') }}
        </h2>
        <p class="mt-1 text-sm text-muted">
          {{ t('mailbox.sharedAccessDescription') }}
        </p>
      </template>
      <div class="space-y-3">
        <p v-if="groupAccess?.groups.length" class="text-xs text-muted">
          {{ t('groups.managerHint') }}
        </p>
        <USkeleton v-if="sharedStatus === 'pending' && !sharedAccess" class="h-16 w-full rounded-lg" />
        <div v-for="grant in groupAccess?.groups ?? []" :key="grant.groupId" class="flex items-center justify-between gap-3 rounded-lg bg-elevated/60 px-4 py-3">
          <NuxtLink :to="`/groups/${grant.groupId}`" class="flex min-w-0 items-center gap-2 hover:underline">
            <UIcon name="i-lucide-network" class="size-4 shrink-0 text-dimmed" />
            <span class="min-w-0">
              <span class="block truncate text-sm font-semibold text-highlighted">{{ grant.groupName }}</span>
              <span class="block truncate text-xs text-muted">{{ t('groups.memberCount', { count: grant.memberCount }) }}</span>
            </span>
          </NuxtLink>
          <div class="flex shrink-0 items-center gap-2">
            <UBadge v-if="managerGroupIds.has(grant.groupId)" color="primary" variant="subtle" :label="t('groups.managesInbox')" />
            <UBadge v-else color="neutral" variant="soft" :label="t('groups.group')" />
            <UButton
              :icon="managerGroupIds.has(grant.groupId) ? 'i-lucide-shield-off' : 'i-lucide-shield-check'"
              color="neutral"
              variant="ghost"
              :aria-label="managerGroupIds.has(grant.groupId) ? t('groups.stopManaging', { name: grant.groupName }) : t('groups.makeManager', { name: grant.groupName })"
              :title="managerGroupIds.has(grant.groupId) ? t('groups.stopManaging', { name: grant.groupName }) : t('groups.makeManager', { name: grant.groupName })"
              :disabled="managerBusy || memberBusy"
              @click="toggleManager(grant.groupId)"
            />
            <UButton v-if="!managerGroupIds.has(grant.groupId)" icon="i-lucide-trash-2" color="error" variant="ghost" :aria-label="t('mailbox.removeAddress', { address: grant.groupName })" :disabled="memberBusy" @click="removeGroup(grant.groupId)" />
          </div>
        </div>
        <div v-for="member in sharedAccess?.members ?? []" :key="member.userId" class="flex items-center justify-between gap-3 rounded-lg bg-elevated/60 px-4 py-3">
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold text-highlighted">
              {{ member.userName }}
            </p>
            <p class="truncate text-xs text-muted">
              {{ member.userEmail }}
            </p>
          </div>
          <UButton icon="i-lucide-trash-2" color="error" variant="ghost" :aria-label="t('mailbox.removeAddress', { address: member.userName })" :disabled="memberBusy" @click="removeMember(member.userId)" />
        </div>
        <p v-if="sharedAccess && sharedAccess.members.length === 0 && !groupAccess?.groups.length" class="rounded-lg bg-elevated/60 px-4 py-3 text-sm text-muted">
          {{ t('mailbox.noMembers') }}
        </p>
        <p v-if="sharedError" class="text-sm text-error">
          {{ errorMessage(sharedError, t('mailbox.sharedLoadFailed')) }}
        </p>
        <form class="flex gap-2" @submit.prevent="addMember">
          <USelect v-model="selectedUserId" :items="memberItems" :placeholder="noAccountsToAdd ? t('mailbox.noAccountsToAdd') : t('groups.chooseAccountOrGroup')" :disabled="noAccountsToAdd" class="min-w-0 flex-1" />
          <UButton type="submit" icon="i-lucide-user-plus" :disabled="!selectedUserId || memberBusy" :label="memberBusy ? t('account.mailboxes.adding') : t('groups.addMember')" />
        </form>
        <p v-if="memberError" class="text-sm text-error">
          {{ memberError }}
        </p>
        <UCollapsible v-model:open="summaryOpen" class="rounded-lg border border-default">
          <UButton color="neutral" variant="ghost" block class="justify-between px-4 py-3" trailing-icon="i-lucide-chevron-down" :label="t('groups.whoHasAccess')" :ui="{ trailingIcon: 'transition-transform group-data-[state=open]:rotate-180' }" />
          <template #content>
            <p v-if="summaryError" class="px-4 pb-3 text-sm text-error">
              {{ t('groups.whoHasAccessFailed') }}
            </p>
            <USkeleton v-else-if="!summary" class="mx-4 mb-3 h-10 rounded-lg" />
            <ul v-else class="divide-y divide-default border-t border-default">
              <li v-for="person in summary" :key="person.userId" class="flex items-center gap-3 px-4 py-2.5">
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium text-highlighted">{{ person.name }}</span>
                  <span class="block truncate text-xs text-muted">{{ person.routes.map(routeLabel).join(' · ') }}</span>
                </span>
                <UBadge v-if="person.disabled" color="warning" variant="subtle" :label="t('groups.disabled')" />
                <UBadge color="neutral" variant="outline" :label="permissionLabels[person.permission]" />
              </li>
            </ul>
          </template>
        </UCollapsible>
        <div v-if="noAccountsToAdd" class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-default px-4 py-3">
          <p class="text-sm text-muted">
            {{ sharedAccess?.availableUsers.length || groupAccess?.groups.length ? t('mailbox.allAccountsAdded') : t('mailbox.noOtherAccounts') }}
          </p>
          <UButton to="/accounts?new=1" icon="i-lucide-plus" color="neutral" variant="outline" size="sm" :label="t('mailbox.createAccount')" />
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="font-semibold text-error">
          {{ t('mailbox.dangerZone') }}
        </h2>
        <p class="mt-1 text-sm text-muted">
          {{ t('mailbox.dangerDescription', { address: address || t('mailbox.thisAddress') }) }}
        </p>
      </template>
      <UAlert v-if="deleteError" class="mb-4" color="error" variant="subtle" :title="deleteError" />
      <UButton color="error" icon="i-lucide-trash-2" :disabled="!mailbox || deleting" :label="deleting ? t('mailbox.deleting') : t('mailbox.delete')" @click="remove" />
    </UCard>
  </div>
</template>
