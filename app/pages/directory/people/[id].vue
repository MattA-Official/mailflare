<script setup lang="ts">
// Fork-only. A colleague's directory entry as a page: where phones open it, and where links from mail, the
// org chart and other people's entries go.
import { fetchDirectoryPerson } from '~/utils/directory/directory'

definePageMeta({ layout: 'dashboard', nav: 'apps' })

const { t } = useLanguage()
const route = useRoute()
const id = computed(() => String(route.params.id))
const { data, error, refresh } = useAsyncData(() => `directory-person-${id.value}`, () => fetchDirectoryPerson(id.value))
</script>

<template>
  <AppPage id="directory-person" :title="data?.person.name ?? t('directory.person')">
    <template #actions>
      <UButton color="neutral" variant="ghost" icon="i-lucide-arrow-left" to="/directory" :label="t('directory.back')" />
    </template>
    <UAlert v-if="error" role="alert" color="error" variant="subtle" :title="error.message || t('directory.loadFailed')" />
    <UCard v-else-if="data">
      <DirectoryPersonView :data="data" @changed="refresh()" />
    </UCard>
    <USkeleton v-else class="h-64 w-full rounded-lg" />
  </AppPage>
</template>
