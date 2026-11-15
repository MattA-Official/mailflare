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

    <p v-if="error" role="alert" class="text-sm text-error">
      {{ t('groups.loadFailed') }}
    </p>
    <div v-else-if="status === 'pending' && !data" class="space-y-2">
      <USkeleton v-for="index in 2" :key="index" class="h-16 w-full rounded-lg" />
    </div>
    <p v-else-if="!data?.groups.length" class="rounded-lg border border-default bg-default px-5 py-4 text-sm text-muted">
      {{ data?.canManage ? t('groups.none') : t('groups.noneReadOnly') }}
    </p>
    <ul v-else class="divide-y divide-default overflow-hidden rounded-lg border border-default bg-default">
      <li v-for="group in data.groups" :key="group.id">
        <NuxtLink :to="`/groups/${group.id}`" class="flex items-center gap-4 px-5 py-4 hover:bg-elevated/50">
          <UAvatar icon="i-lucide-network" color="primary" size="xl" />
          <span class="min-w-0 flex-1 space-y-0.5">
            <strong class="block truncate text-sm font-semibold text-highlighted">{{ group.name }}</strong>
            <span v-if="group.description" class="block truncate text-xs text-muted">{{ group.description }}</span>
          </span>
          <span class="hidden shrink-0 text-sm text-muted sm:block">{{ t('groups.inboxCount', { count: group.mailboxCount }) }}</span>
          <span class="shrink-0 text-sm text-muted">{{ t('groups.memberCount', { count: group.memberCount }) }}</span>
          <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-muted" />
        </NuxtLink>
      </li>
    </ul>

    <UModal v-model:open="createOpen" :dismissible="!creating" :title="t('groups.createTitle')" :description="t('groups.createDescription')">
      <template #body>
        <form class="space-y-4" @submit.prevent="create">
          <UFormField :label="t('groups.name')" required>
            <UInput v-model="name" :placeholder="t('groups.namePlaceholder')" autofocus />
          </UFormField>
          <UFormField :label="t('groups.descriptionLabel')" :hint="t('groups.optional')">
            <UTextarea v-model="description" :rows="2" />
          </UFormField>
          <p v-if="createError" role="alert" class="text-sm text-error">
            {{ createError }}
          </p>
          <UButton type="submit" :loading="creating" :disabled="!name.trim()" :label="creating ? t('groups.creating') : t('groups.create')" />
        </form>
      </template>
    </UModal>
  </AdminSystemPage>
</template>
