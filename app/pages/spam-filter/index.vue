<script setup lang="ts">
// Admin settings for the spam filter's external lookups and the installation's own brand list.
// Ported from legacy/src/app/(admin)/spam-filter/page.tsx.
import type { SpamFilterSettingsResponse } from '~/types/admin/email/spam-filter'
import { errorMessage } from '~/utils/admin/email/domains'
import { ABUSECH_SIGNUP_URL, SPAMHAUS_SIGNUP_URL, formatBrandLines, loadSpamFilterSettings, parseBrandLines, saveSpamFilterSettings } from '~/utils/admin/email/spam-filter'

definePageMeta({ layout: 'dashboard', nav: 'admin', auth: { role: 'admin', primary: true, requireMailbox: true } })
const { t } = useLanguage()
useHead({ title: () => t('spamFilter.title') })

const settings = ref<SpamFilterSettingsResponse | null>(null)
const loadError = ref('')
const brandText = ref('')
const brandStatus = ref('')
const brandSaving = ref(false)
const ageSaving = ref(false)
const ageStatus = ref('')

onMounted(async () => {
  try {
    settings.value = await loadSpamFilterSettings()
    brandText.value = formatBrandLines(settings.value.brands)
  } catch (error) {
    loadError.value = errorMessage(error, t('spamFilter.loadFailed'))
  }
})

const editable = computed(() => Boolean(settings.value?.available))
const parsedBrands = computed(() => parseBrandLines(brandText.value))

async function saveBrands() {
  if (parsedBrands.value.invalidLines.length) return
  brandSaving.value = true
  brandStatus.value = ''
  try {
    settings.value = await saveSpamFilterSettings({ brands: parsedBrands.value.brands })
    brandText.value = formatBrandLines(settings.value.brands)
    brandStatus.value = t('spamFilter.saved')
  } catch (error) {
    brandStatus.value = errorMessage(error, t('spamFilter.saveFailed'))
  } finally {
    brandSaving.value = false
  }
}

async function toggleDomainAge(checked: boolean) {
  ageSaving.value = true
  ageStatus.value = ''
  try {
    settings.value = await saveSpamFilterSettings({ domainAge: checked })
  } catch (error) {
    ageStatus.value = errorMessage(error, t('spamFilter.saveFailed'))
  } finally {
    ageSaving.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="spam-filter">
    <template #header>
      <UDashboardNavbar :title="t('spamFilter.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <div class="mx-auto w-full max-w-3xl space-y-6">
        <p class="text-sm text-muted">
          {{ t('spamFilter.description') }}
        </p>
        <p v-if="loadError" role="alert" class="text-sm text-error">
          {{ loadError }}
        </p>
        <UAlert v-if="settings && !settings.available" role="status" color="warning" variant="subtle" :description="t('spamFilter.needsUpdate')" />

        <UCard>
          <template #header>
            <h2 class="font-semibold text-highlighted">
              {{ t('spamFilter.blocklists') }}
            </h2>
            <p class="mt-1 text-sm text-muted">
              {{ t('spamFilter.blocklistsHint') }}
            </p>
          </template>
          <div class="space-y-6">
            <AdminEmailSpamKeyRow field="spamhausDqsKey" env-name="SPAMHAUS_DQS_KEY" :title="t('spamFilter.spamhaus')" :hint="t('spamFilter.spamhausHint')" :signup-url="SPAMHAUS_SIGNUP_URL" :source="settings?.spamhaus.source ?? null" :disabled="!editable" @saved="value => settings = value" />
            <AdminEmailSpamKeyRow field="abuseChAuthKey" env-name="ABUSECH_AUTH_KEY" :title="t('spamFilter.abusech')" :hint="t('spamFilter.abusechHint')" :signup-url="ABUSECH_SIGNUP_URL" :source="settings?.abusech.source ?? null" :disabled="!editable" @saved="value => settings = value" />
          </div>
        </UCard>

        <UCard>
          <div class="flex items-center justify-between gap-4">
            <div>
              <p class="font-medium text-highlighted">
                {{ t('spamFilter.domainAge') }}
              </p>
              <p class="mt-1 text-sm text-muted">
                {{ t('spamFilter.domainAgeHint') }}
              </p>
              <p v-if="settings?.domainAgeForcedOff" class="mt-1 text-sm text-warning">
                {{ t('spamFilter.domainAgeForcedOff') }}
              </p>
            </div>
            <USwitch
              :model-value="Boolean(settings?.domainAge && !settings.domainAgeForcedOff)"
              :disabled="!editable || ageSaving || settings?.domainAgeForcedOff"
              :aria-label="t('spamFilter.domainAge')"
              @update:model-value="toggleDomainAge"
            />
          </div>
          <p v-if="ageStatus" role="status" class="mt-3 text-sm text-error">
            {{ ageStatus }}
          </p>
        </UCard>

        <UCard>
          <template #header>
            <h2 class="font-semibold text-highlighted">
              {{ t('spamFilter.brands') }}
            </h2>
            <p class="mt-1 text-sm text-muted">
              {{ t('spamFilter.brandsHint') }}
            </p>
          </template>
          <form class="space-y-4" @submit.prevent="saveBrands">
            <UFormField :label="t('spamFilter.brandsLabel')" :help="t('spamFilter.brandsBuiltIn')" :error="parsedBrands.invalidLines.length ? t('spamFilter.brandsInvalid', { lines: parsedBrands.invalidLines.join(', ') }) : undefined">
              <UTextarea v-model="brandText" :rows="6" :disabled="!editable || brandSaving" :placeholder="'PostFinance = postfinance.ch\nSwisscom = swisscom.ch, swisscom.com'" class="w-full font-mono text-sm" />
            </UFormField>
            <p v-if="brandStatus" role="status" class="text-sm text-toned">
              {{ brandStatus }}
            </p>
            <UButton type="submit" :disabled="!editable || brandSaving || parsedBrands.invalidLines.length > 0" :label="brandSaving ? t('common.saving') : t('spamFilter.saveBrands')" />
          </form>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
