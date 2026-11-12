<script setup lang="ts">
// Share a Drive item with people and by link. Ported from legacy/src/app/(drive)/drive-share-dialog.tsx.
import type { DriveItemDto, DriveShareDto, DriveShareRole } from '#lib/drive/types'

const props = defineProps<{ item: DriveItemDto | null }>()
const emit = defineEmits<{ close: [], changed: [] }>()
const { t } = useLanguage()
const toast = useToast()
const shares = ref<DriveShareDto[]>([])
const linkToken = ref<string | null>(null)
const email = ref('')
const role = ref<DriveShareRole>('view')
const busy = ref(false)
const roles = computed(() => [{ label: t('drive.canView'), value: 'view' }, { label: t('drive.canEdit'), value: 'edit' }])
const linkUrl = computed(() => linkToken.value ? `${window.location.origin}/d/${linkToken.value}` : '')

watch(() => props.item?.id, async (id) => {
  shares.value = []
  linkToken.value = null
  email.value = ''
  if (!id) return
  try {
    const data = await api<{ shares: DriveShareDto[], linkToken: string | null }>(`/api/drive/items/${id}/shares`)
    if (props.item?.id !== id) return
    shares.value = data.shares
    linkToken.value = data.linkToken
  } catch {
    toast.add({ title: t('drive.shareFailed'), color: 'error' })
  }
}, { immediate: true })

async function request(url: string, method: string, body?: unknown) {
  busy.value = true
  try {
    const data = await api<{ shares?: DriveShareDto[], linkToken?: string | null }>(url, { method, body })
    emit('changed')
    return data ?? {}
  } catch (error) {
    toast.add({ title: error instanceof Error && error.message ? error.message : t('drive.shareFailed'), color: 'error' })
    return null
  } finally {
    busy.value = false
  }
}

async function addPerson() {
  if (!props.item || !email.value.trim()) return
  const data = await request(`/api/drive/items/${props.item.id}/shares`, 'POST', { email: email.value, role: role.value })
  if (data?.shares) {
    shares.value = data.shares
    email.value = ''
  }
}

async function removePerson(shareId: string) {
  if (!props.item) return
  const data = await request(`/api/drive/items/${props.item.id}/shares?shareId=${encodeURIComponent(shareId)}`, 'DELETE')
  if (data?.shares) shares.value = data.shares
}

async function toggleLink() {
  if (!props.item) return
  const data = await request(`/api/drive/items/${props.item.id}/link`, 'POST', { enabled: !linkToken.value })
  if (data) linkToken.value = data.linkToken ?? null
}

async function copyLink() {
  await navigator.clipboard.writeText(linkUrl.value)
  toast.add({ title: t('drive.linkCopied'), color: 'success' })
}
</script>

<template>
  <UModal
    :open="!!item"
    :title="t('drive.shareTitle', { name: item?.name ?? '' })"
    :ui="{ content: 'max-h-[calc(100vh-4rem)] overflow-y-auto', title: 'truncate pr-6' }"
    @update:open="(open: boolean) => { if (!open) emit('close') }"
  >
    <template #body>
      <form class="flex gap-2" @submit.prevent="addPerson">
        <UInput v-model="email" type="email" class="min-w-0 flex-1" :placeholder="t('drive.shareEmail')" :aria-label="t('drive.shareEmail')" />
        <USelect v-model="role" :items="roles" class="w-32" :aria-label="t('drive.peopleWithAccess')" />
        <UButton type="submit" :disabled="busy || !email.trim()" :label="t('drive.shareAdd')" />
      </form>
      <h3 class="mb-2 mt-6 text-sm font-medium text-highlighted">{{ t('drive.peopleWithAccess') }}</h3>
      <p v-if="!shares.length" class="text-sm text-muted">{{ t('drive.noPeople') }}</p>
      <ul v-else class="space-y-1">
        <li v-for="share in shares" :key="share.id" class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-elevated">
          <span class="min-w-0 flex-1">
            <span class="block truncate text-highlighted">{{ share.name }}</span>
            <span class="block truncate text-xs text-muted">{{ share.email }}</span>
          </span>
          <span class="shrink-0 text-xs text-muted">{{ share.role === 'edit' ? t('drive.canEdit') : t('drive.canView') }}</span>
          <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="xs" class="rounded-full" :disabled="busy" :aria-label="t('drive.remove')" @click="removePerson(share.id)" />
        </li>
      </ul>
      <h3 class="mb-2 mt-6 text-sm font-medium text-highlighted">{{ t('drive.generalAccess') }}</h3>
      <div class="flex items-center gap-3 rounded-lg border border-default p-3 text-sm">
        <UIcon name="i-lucide-link-2" class="size-[18px] shrink-0 text-muted" />
        <span class="min-w-0 flex-1">{{ linkToken ? t('drive.linkOn') : t('drive.linkOff') }}</span>
        <UButton color="neutral" variant="outline" size="sm" :disabled="busy" :label="linkToken ? t('drive.linkDisable') : t('drive.linkEnable')" @click="toggleLink" />
      </div>
      <div v-if="linkToken" class="mt-2 flex gap-2">
        <UInput :model-value="linkUrl" readonly class="min-w-0 flex-1" :aria-label="t('drive.copyLink')" @focus="($event.target as HTMLInputElement).select()" />
        <UButton color="neutral" variant="outline" icon="i-lucide-copy" :label="t('drive.copyLink')" @click="copyLink" />
      </div>
    </template>
  </UModal>
</template>
