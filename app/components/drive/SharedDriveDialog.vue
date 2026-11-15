<script setup lang="ts">
// Fork-only: a shared drive's members and settings. Every member can see who has access; managers add,
// change and remove people and groups, rename the drive or delete it; only admins set its storage limit.
import { ACCOUNT_RESTORE_DAYS } from '#lib/accounts/deletion-utils'
import { formatDriveSize } from '#lib/drive/utils'
import type { SharedDriveRole } from '~/types/drive/drive'
import { confirmDestructive } from '~/utils/confirm-dialog'
import { errorMessage } from '~/utils/drive/drive-utils'

type Member = { id: string, kind: 'user' | 'group', memberId: string, name: string, email: string | null, role: SharedDriveRole }
type Candidate = { id: string, name: string, email?: string }
type MemberState = { role?: SharedDriveRole, members: Member[], availableUsers?: Candidate[], availableGroups?: Candidate[] }
type DriveDetail = { id: string, name: string, role: SharedDriveRole, storageLimitBytes: number | null, storageUsed: number, canSetLimit: boolean }

const props = defineProps<{ driveId: string | null }>()
const emit = defineEmits<{ close: [], changed: [], deleted: [] }>()
const { t } = useLanguage()
const toast = useToast()
const GB = 1024 ** 3

const drive = ref<DriveDetail | null>(null)
const members = ref<Member[]>([])
const availableUsers = ref<Candidate[]>([])
const availableGroups = ref<Candidate[]>([])
const personId = ref<string | undefined>()
const groupId = ref<string | undefined>()
const newRole = ref<SharedDriveRole>('edit')
const name = ref('')
const limitGb = ref('')
const busy = ref(false)

const canManage = computed(() => drive.value?.role === 'manage')
const roles = computed(() => [
  { label: t('sharedDrives.roleView'), value: 'view' },
  { label: t('sharedDrives.roleEdit'), value: 'edit' },
  { label: t('sharedDrives.roleManage'), value: 'manage' },
])
const roleLabel = (role: SharedDriveRole) => roles.value.find(entry => entry.value === role)?.label ?? role
const personItems = computed(() => availableUsers.value.map(person => ({ label: person.name, description: person.email, value: person.id })))
const groupItems = computed(() => availableGroups.value.map(group => ({ label: group.name, value: group.id })))

function applyMembers(state: MemberState) {
  members.value = state.members
  availableUsers.value = state.availableUsers ?? []
  availableGroups.value = state.availableGroups ?? []
}
function applyDrive(detail: DriveDetail) {
  drive.value = detail
  name.value = detail.name
  limitGb.value = detail.storageLimitBytes ? String(Math.round((detail.storageLimitBytes / GB) * 100) / 100) : ''
}

watch(() => props.driveId, async (id) => {
  drive.value = null
  members.value = []
  personId.value = undefined
  groupId.value = undefined
  if (!id) return
  try {
    const [detail, state] = await Promise.all([
      api<{ drive: DriveDetail }>(`/api/drives/${id}`),
      api<MemberState>(`/api/drives/${id}/members`),
    ])
    if (props.driveId !== id) return
    applyDrive(detail.drive)
    applyMembers(state)
  } catch (error) {
    toast.add({ title: errorMessage(error, t('sharedDrives.failed')), color: 'error' })
    emit('close')
  }
}, { immediate: true })

async function send<T>(url: string, method: string, body?: unknown): Promise<T | null> {
  busy.value = true
  try {
    return await api<T>(url, { method, body })
  } catch (error) {
    toast.add({ title: errorMessage(error, t('sharedDrives.failed')), color: 'error' })
    return null
  } finally {
    busy.value = false
  }
}

async function setMember(body: { userId?: string, groupId?: string, role: SharedDriveRole }) {
  if (!drive.value) return
  const state = await send<MemberState>(`/api/drives/${drive.value.id}/members`, 'POST', body)
  if (state) {
    applyMembers(state)
    emit('changed')
  }
}
async function addPerson() {
  if (!personId.value) return
  await setMember({ userId: personId.value, role: newRole.value })
  personId.value = undefined
}
async function addGroup() {
  if (!groupId.value) return
  await setMember({ groupId: groupId.value, role: newRole.value })
  groupId.value = undefined
}
function changeRole(member: Member, role: SharedDriveRole) {
  if (role !== member.role) void setMember(member.kind === 'user' ? { userId: member.memberId, role } : { groupId: member.memberId, role })
}
async function removeMember(member: Member) {
  if (!drive.value) return
  const state = await send<MemberState>(`/api/drives/${drive.value.id}/members?memberId=${encodeURIComponent(member.id)}`, 'DELETE')
  if (state) {
    applyMembers(state)
    emit('changed')
  }
}

async function saveSettings() {
  if (!drive.value) return
  const body: { name?: string, storageLimitBytes?: number | null } = {}
  if (name.value.trim() && name.value.trim() !== drive.value.name) body.name = name.value.trim()
  if (drive.value.canSetLimit) {
    const value = Number.parseFloat(limitGb.value)
    body.storageLimitBytes = limitGb.value.trim() && value > 0 ? Math.round(value * GB) : null
  }
  const result = await send<{ drive: DriveDetail }>(`/api/drives/${drive.value.id}`, 'PATCH', body)
  if (result) {
    applyDrive(result.drive)
    toast.add({ title: t('sharedDrives.saved'), color: 'success' })
    emit('changed')
  }
}

async function deleteDrive() {
  if (!drive.value) return
  if (!(await confirmDestructive(t('sharedDrives.confirmDelete', { name: drive.value.name, days: ACCOUNT_RESTORE_DAYS })))) return
  const result = await send<{ ok: boolean }>(`/api/drives/${drive.value.id}`, 'DELETE')
  if (result) {
    toast.add({ title: t('sharedDrives.deleted'), color: 'success' })
    emit('deleted')
  }
}
</script>

<template>
  <UModal
    :open="!!driveId"
    :title="t('sharedDrives.membersTitle', { name: drive?.name ?? '' })"
    :ui="{ content: 'max-h-[calc(100vh-4rem)] overflow-y-auto', title: 'truncate pr-6' }"
    @update:open="(open: boolean) => { if (!open) emit('close') }"
  >
    <template #body>
      <div v-if="!drive" class="space-y-3" aria-hidden="true">
        <USkeleton class="h-9 w-full" />
        <USkeleton class="h-9 w-full" />
        <USkeleton class="h-9 w-2/3" />
      </div>
      <template v-else>
        <template v-if="canManage">
          <div class="space-y-2">
            <div class="flex gap-2">
              <USelectMenu
                v-model="personId"
                :items="personItems"
                value-key="value"
                class="min-w-0 flex-1"
                :placeholder="t('sharedDrives.choosePerson')"
                :aria-label="t('sharedDrives.choosePerson')"
              />
              <USelect v-model="newRole" :items="roles" class="w-28" :aria-label="t('sharedDrives.roleLabel')" />
              <UButton :disabled="busy || !personId" :label="t('sharedDrives.add')" @click="addPerson" />
            </div>
            <div v-if="groupItems.length" class="flex gap-2">
              <USelect v-model="groupId" :items="groupItems" class="min-w-0 flex-1" :placeholder="t('sharedDrives.chooseGroup')" :aria-label="t('sharedDrives.chooseGroup')" />
              <USelect v-model="newRole" :items="roles" class="w-28" :aria-label="t('sharedDrives.roleLabel')" />
              <UButton :disabled="busy || !groupId" :label="t('sharedDrives.add')" @click="addGroup" />
            </div>
            <p class="text-xs text-muted">{{ t('sharedDrives.roleHelp') }}</p>
          </div>
        </template>

        <h3 class="mb-2 mt-6 text-sm font-medium text-highlighted">{{ t('sharedDrives.members') }}</h3>
        <ul class="space-y-1">
          <li v-for="member in members" :key="member.id" class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-elevated">
            <UIcon v-if="member.kind === 'group'" name="i-lucide-network" class="size-4 shrink-0 text-muted" :aria-label="t('sharedDrives.group')" />
            <UIcon v-else name="i-lucide-user-round" class="size-4 shrink-0 text-muted" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-highlighted">{{ member.name }}</span>
              <span v-if="member.email" class="block truncate text-xs text-muted">{{ member.email }}</span>
            </span>
            <USelect
              v-if="canManage"
              :model-value="member.role"
              :items="roles"
              size="xs"
              class="w-24"
              :disabled="busy"
              :aria-label="t('sharedDrives.roleLabel')"
              @update:model-value="(value: string) => changeRole(member, value as SharedDriveRole)"
            />
            <span v-else class="shrink-0 text-xs text-muted">{{ roleLabel(member.role) }}</span>
            <UButton v-if="canManage" icon="i-lucide-x" color="neutral" variant="ghost" size="xs" class="rounded-full" :disabled="busy" :aria-label="t('sharedDrives.remove')" @click="removeMember(member)" />
          </li>
        </ul>
        <p class="mt-2 text-xs text-muted">{{ t('sharedDrives.adminNote') }}</p>

        <template v-if="canManage">
          <h3 class="mb-2 mt-6 text-sm font-medium text-highlighted">{{ t('sharedDrives.settings') }}</h3>
          <form class="space-y-3" @submit.prevent="saveSettings">
            <UFormField :label="t('sharedDrives.renameLabel')">
              <UInput v-model="name" :maxlength="100" />
            </UFormField>
            <UFormField :label="t('sharedDrives.storageLimit')" :help="t('sharedDrives.storageLimitHelp')">
              <UInput v-model="limitGb" type="number" min="0" step="any" inputmode="decimal" :disabled="!drive.canSetLimit" />
            </UFormField>
            <p class="text-xs text-muted">{{ t('sharedDrives.storageUsed', { size: formatDriveSize(drive.storageUsed) }) }}</p>
            <div class="flex justify-end">
              <UButton type="submit" :disabled="busy || !name.trim()" :label="t('sharedDrives.save')" />
            </div>
          </form>
          <div class="mt-6 flex items-center gap-3 rounded-lg border border-error/40 p-3">
            <p class="min-w-0 flex-1 text-xs text-muted">{{ t('sharedDrives.deleteHelp', { days: ACCOUNT_RESTORE_DAYS }) }}</p>
            <UButton color="error" variant="soft" :disabled="busy" :label="t('sharedDrives.delete')" @click="deleteDrive" />
          </div>
        </template>
      </template>
    </template>
  </UModal>
</template>
