<script setup lang="ts">
// Ported from legacy/src/app/(settings)/settings/security/page.tsx.
definePageMeta({ layout: 'dashboard', nav: 'settings' })

const { t } = useLanguage()
useHead({ title: () => t('settingsPage.security.title') })
</script>

<template>
  <UDashboardPanel id="settings-security">
    <template #header>
      <AppNavbar :title="t('settingsPage.security.title')" />
    </template>
    <template #body>
      <div class="mx-auto w-full max-w-3xl space-y-4">
        <p class="text-sm text-muted">
          {{ t('settingsPage.security.description') }}
        </p>

        <UCard>
          <div class="space-y-6">
            <div>
              <h2 class="text-lg font-semibold text-highlighted">
                {{ t('signIn.methodsTitle') }}
              </h2>
              <p class="mt-1 text-sm text-muted">
                {{ t('signIn.methodsDescription') }}
              </p>
            </div>
            <div class="space-y-4">
              <h3 class="text-sm font-semibold text-highlighted">
                {{ t('signIn.passwordTitle') }}
              </h3>
              <SettingsAccountPasswordSettings />
            </div>
            <div id="passkeys" class="scroll-mt-6 space-y-4 border-t border-default pt-6">
              <div>
                <h3 class="text-sm font-semibold text-highlighted">
                  {{ t('passkey.settingsTitle') }}
                </h3>
                <p class="mt-1 text-sm text-muted">
                  {{ t('passkey.settingsDescription') }}
                </p>
              </div>
              <SettingsAccountPasskeySettings />
            </div>
          </div>
        </UCard>

        <UCard>
          <SettingsAccountTwoStepSettings />
        </UCard>

        <UCard>
          <div class="space-y-4">
            <div>
              <h2 class="text-lg font-semibold text-highlighted">
                {{ t('settingsPage.security.devices') }}
              </h2>
              <p class="mt-1 text-sm text-muted">
                {{ t('settingsPage.security.devicesDescription') }}
              </p>
            </div>
            <SettingsAccountDeviceSettings />
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
