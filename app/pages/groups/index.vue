<script setup lang="ts">
// Fork-only. Groups of accounts. A shared inbox granted to a group reaches every member.
import { createGroup, fetchGroups } from '~/utils/admin/system/groups'

definePageMeta({ layout: 'dashboard', nav: 'admin', auth: { role: 'admin', requireMailbox: true } })

const { t } = useLanguage()
useHead({ title: () => t('groups.title') })

const { data, status, error } = useAsyncData('groups', fetchGroups)

const createOpen = ref(false)
const name = ref('')
const description = ref('')
const creating = ref(false)
const createError = ref<string | null>(null)

watch(createOpen, (open) => {
  if (open) return
  name.value = ''
  description.value = ''
  createError.value = null
})

async function create() {
  if (!name.value.trim()) return
  creating.value = true
  createError.value = null
  try {
    const { group } = await createGroup({ name: name.value.trim(), description: description.value.trim() || null })
    createOpen.value = false
    await navigateTo(`/groups/${group.id}`)
  } catch (cause) {
    createError.value = cause instanceof Error ? cause.message : t('groups.saveFailed')
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <AdminSystemPage id="groups" :title="t('groups.title')" :description="t('groups.description')">
    <template v-if="data?.canManage" #actions>
      <UButton icon="i-lucide-plus" :label="t('groups.new')" @click="createOpen = true" />
    </template>

    <UAlert v-if="error" role="alert" color="error" variant="subtle" :title="t('groups.loadFailed')" />
    <div v-else-if="status === 'pending' && !data" class="space-y-2">
      <USkeleton v-for="index in 2" :key="index" class="h-16 w-full rounded-lg" />
    </div>
    <UEmpty
      v-else-if="!data?.groups.length"
      variant="outline"
      icon="i-lucide-network"
      :description="data?.canManage ? t('groups.none') : t('groups.noneReadOnly')"
      :actions="data?.canManage ? [{ label: t('groups.new'), icon: 'i-lucide-plus', color: 'neutral', variant: 'outline', onClick: () => { createOpen = true } }] : undefined"
    />
    <AppList v-else>
      <AppListItem v-for="group in data.groups" :key="group.id" :to="`/groups/${group.id}`" icon="i-lucide-network" :name="group.name" :description="group.description ?? undefined">
        <span class="hidden shrink-0 text-sm text-muted sm:block">{{ t('groups.inboxCount', { count: group.mailboxCount }) }}</span>
        <span class="shrink-0 text-sm text-muted">{{ t('groups.memberCount', { count: group.memberCount }) }}</span>
      </AppListItem>
    </AppList>

    <UModal v-model:open="createOpen" :dismissible="!creating" :title="t('groups.createTitle')" :description="t('groups.createDescription')">
      <template #body>
        <form class="space-y-4" @submit.prevent="create">
          <UFormField :label="t('groups.name')" required>
            <UInput v-model="name" :placeholder="t('groups.namePlaceholder')" autofocus />
          </UFormField>
          <UFormField :label="t('groups.descriptionLabel')" :hint="t('groups.optional')">
            <UTextarea v-model="description" :rows="2" />
          </UFormField>
          <UAlert v-if="createError" role="alert" color="error" variant="subtle" :title="createError" />
          <UButton type="submit" :loading="creating" :disabled="!name.trim()" :label="creating ? t('groups.creating') : t('groups.create')" />
        </form>
      </template>
    </UModal>
  </AdminSystemPage>
</template>
