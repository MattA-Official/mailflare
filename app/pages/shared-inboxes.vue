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
      <UEmpty v-if="!active.length" variant="outline" icon="i-lucide-inbox" :description="t('sharedInboxes.none')" />
      <AppList v-else>
        <AppListItem v-for="inbox in active" :key="inbox.id" :to="`/mailboxes/${inbox.id}`" icon="i-lucide-inbox" :name="inbox.displayName || inbox.address">
          <template #description>
            {{ inbox.address }}
            <template v-if="inbox.managers.length">
              · {{ t('sharedInboxes.managedBy', { names: inbox.managers.map(manager => manager.name).join(', ') }) }}
            </template>
          </template>
          <span class="hidden shrink-0 text-sm text-muted sm:block">{{ t('sharedInboxes.groupCount', { count: inbox.groupCount }) }}</span>
          <span class="shrink-0 text-sm text-muted">{{ t('sharedInboxes.peopleCount', { count: inbox.peopleCount }) }}</span>
        </AppListItem>
      </AppList>

      <section v-if="deleted.length" class="space-y-3">
        <h2 class="text-sm font-semibold text-highlighted">
          {{ t('sharedInboxes.deletedTitle') }}
        </h2>
        <AppList>
          <AppListItem v-for="inbox in deleted" :key="inbox.id" :name="inbox.displayName || inbox.address" :description="inbox.purgeAt ? t('sharedInboxes.removedOn', { date: formatDate(inbox.purgeAt) }) : inbox.address">
            <UButton color="neutral" variant="outline" :loading="restoring === inbox.id" :disabled="!!restoring" :label="t('sharedInboxes.restore')" @click="restore(inbox.id)" />
          </AppListItem>
        </AppList>
        <UAlert v-if="restoreError" role="alert" color="error" variant="subtle" :title="restoreError" />
      </section>
    </template>
  </AdminSystemPage>
</template>
