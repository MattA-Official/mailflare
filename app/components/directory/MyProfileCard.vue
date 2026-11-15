<script setup lang="ts">
// Fork-only. Your own directory profile, in Settings -> Account.
import { fetchMyProfile, updateMyProfile } from '~/utils/directory/directory'

const { t } = useLanguage()
const { data, error } = useAsyncData('directory-my-profile', fetchMyProfile)
</script>

<template>
  <UCard>
    <div class="space-y-4">
      <div>
        <h3 class="text-lg font-semibold text-highlighted">
          {{ t('directory.profileTitle') }}
        </h3>
        <p class="mt-1 text-sm text-muted">
          {{ t('directory.profileDescription') }}
          <ULink to="/directory" class="text-highlighted hover:underline">{{ t('directory.openDirectory') }}</ULink>
        </p>
      </div>
      <UAlert v-if="error" role="alert" color="error" variant="subtle" :title="t('directory.loadFailed')" />
      <UAlert v-else-if="data && !data.available" color="neutral" variant="subtle" icon="i-lucide-database" :title="t('directory.needsMigration')" />
      <DirectoryProfileForm
        v-else-if="data"
        :initial="data.profile"
        :manager-options="data.managerOptions"
        :can-edit-org="data.canEditOrg"
        :save="updateMyProfile"
      />
      <USkeleton v-else class="h-48 w-full" />
    </div>
  </UCard>
</template>
