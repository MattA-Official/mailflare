<script setup lang="ts">
// Ported from legacy/src/app/(settings)/settings/account/page.tsx and components/settings/account-settings.tsx.
import type { AccountSettingsUser } from '~/types/settings/account'
import { loadAccountSettings } from '~/utils/settings/account/account'

definePageMeta({ layout: 'dashboard', nav: 'settings' })

const { t } = useLanguage()

const { data: user, error: loadError } = useAsyncData<AccountSettingsUser>('settings-account', loadAccountSettings)
const error = computed(() => loadError.value ? loadError.value.message || t('settings.account.loadFailed') : null)
</script>

<template>
  <AppPage id="settings-account" :title="t('settings.nav.account')">
    <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="error" role="alert" />
    <div v-else-if="!user" class="space-y-6">
      <USkeleton class="h-9 w-40" />
      <USkeleton class="h-72 w-full rounded-lg" />
    </div>
    <div v-else class="space-y-8">
      <section class="space-y-4">
        <div>
          <h2 class="text-xl font-semibold text-highlighted">
            {{ t('settings.account.detailsTitle') }}
          </h2>
          <p class="mt-1 text-sm text-muted">
            {{ t('settings.account.detailsDescription') }}
          </p>
        </div>
        <SettingsAccountProfileForm :initial-reset-email="user.resetEmail ?? ''" />
        <DirectoryMyProfileCard />
        <UCard>
          <div class="space-y-4">
            <div>
              <h3 class="text-lg font-semibold text-highlighted">
                {{ t('settings.account.signatureTitle') }}
              </h3>
              <p class="mt-1 text-sm text-muted">
                {{ t('settings.account.signatureDescription') }}
              </p>
            </div>
            <SettingsAccountMailboxSignatureForm />
          </div>
        </UCard>
      </section>

      <section class="space-y-4">
        <div>
          <h2 class="text-xl font-semibold text-highlighted">
            {{ t('settings.account.generalTitle') }}
          </h2>
          <p class="mt-1 text-sm text-muted">
            {{ t('settings.account.generalDescription') }}
          </p>
        </div>
        <UCard>
          <h3 class="mb-3 text-lg font-semibold text-highlighted">
            {{ t('language.label') }}
          </h3>
          <AppLanguageSelect />
        </UCard>
        <UCard>
          <SettingsAccountTimeZoneForm :user-id="user.id" :initial-time-zone="user.timeZone" />
        </UCard>
      </section>
    </div>
  </AppPage>
</template>
