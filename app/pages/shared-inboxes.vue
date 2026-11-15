<script setup lang="ts">
// Fork-only. Every shared inbox on the instance. Shared inboxes hold themselves, so an admin may have no access
// to some of them; this is where they find them, see who manages them, and restore a deleted one.
import { fetchSharedInboxes, restoreSharedInbox } from '~/utils/admin/email/shared-inboxes'

definePageMeta({ layout: 'dashboard', nav: 'admin', auth: { role: 'admin', requireMailbox: true } })

const { t, locale } = useLanguage()
const formatDate = (value: string) => new Date(value).toLocaleDateString(locale.value, { dateStyle: 'medium' })
useHead({ title: () => t('sharedInboxes.title') })

const { data, status, error, refresh } = useAsyncData('shared-inboxes', fetchSharedInboxes)
const active = computed(() => (data.value?.inboxes ?? []).filter(inbox => !inbox.deleted))
const deleted = computed(() => (data.value?.inboxes ?? []).filter(inbox => inbox.deleted))

const restoring = ref<string | null>(null)
const restoreError = ref<string | null>(null)
async function restore(id: string) {
  restoring.value = id
  restoreError.value = null
  try {
    await restoreSharedInbox(id)
    await refresh()
  } catch (cause) {
    restoreError.value = cause instanceof Error ? cause.message : t('sharedInboxes.restoreFailed')
  } finally {
    restoring.value = null
  }
}
</script>

<template>
  <AdminSystemPage id="shared-inboxes" :title="t('sharedInboxes.title')" :description="t('sharedInboxes.description')">
    <template #actions>
      <UButton to="/mailboxes" icon="i-lucide-plus" :label="t('sharedInboxes.new')" />
    </template>

    <UAlert v-if="error" role="alert" color="error" variant="subtle" :title="t('sharedInboxes.loadFailed')" />
    <div v-else-if="status === 'pending' && !data" class="space-y-2">
      <USkeleton v-for="index in 2" :key="index" class="h-16 w-full rounded-lg" />
    </div>
    <template v-else>
      <p v-if="!active.length" class="rounded-lg border border-default bg-default px-5 py-4 text-sm text-muted">
        {{ t('sharedInboxes.none') }}
      </p>
      <ul v-else class="divide-y divide-default overflow-hidden rounded-lg border border-default bg-default">
        <li v-for="inbox in active" :key="inbox.id">
          <NuxtLink :to="`/mailboxes/${inbox.id}`" class="flex items-center gap-4 px-5 py-4 hover:bg-elevated/50">
            <UAvatar icon="i-lucide-inbox" color="primary" size="xl" />
            <span class="min-w-0 flex-1 space-y-0.5">
              <strong class="block truncate text-sm font-semibold text-highlighted">{{ inbox.displayName || inbox.address }}</strong>
              <span class="block truncate text-xs text-muted">{{ inbox.address }}</span>
              <span v-if="inbox.managers.length" class="block truncate text-xs text-muted">
                {{ t('sharedInboxes.managedBy', { names: inbox.managers.map(manager => manager.name).join(', ') }) }}
              </span>
            </span>
            <span class="hidden shrink-0 text-sm text-muted sm:block">{{ t('sharedInboxes.groupCount', { count: inbox.groupCount }) }}</span>
            <span class="shrink-0 text-sm text-muted">{{ t('sharedInboxes.peopleCount', { count: inbox.peopleCount }) }}</span>
            <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-muted" />
          </NuxtLink>
        </li>
      </ul>

      <section v-if="deleted.length" class="space-y-3">
        <h2 class="text-sm font-semibold text-highlighted">
          {{ t('sharedInboxes.deletedTitle') }}
        </h2>
        <ul class="divide-y divide-default overflow-hidden rounded-lg border border-default bg-default">
          <li v-for="inbox in deleted" :key="inbox.id" class="flex items-center gap-4 px-5 py-4">
            <span class="min-w-0 flex-1 space-y-0.5">
              <strong class="block truncate text-sm font-semibold text-highlighted">{{ inbox.displayName || inbox.address }}</strong>
              <span class="block truncate text-xs text-muted">
                {{ inbox.purgeAt ? t('sharedInboxes.removedOn', { date: formatDate(inbox.purgeAt) }) : inbox.address }}
              </span>
            </span>
            <UButton color="neutral" variant="outline" :loading="restoring === inbox.id" :disabled="!!restoring" :label="t('sharedInboxes.restore')" @click="restore(inbox.id)" />
          </li>
        </ul>
        <UAlert v-if="restoreError" role="alert" color="error" variant="subtle" :title="restoreError" />
      </section>
    </template>
  </AdminSystemPage>
</template>
