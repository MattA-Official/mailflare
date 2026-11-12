<script setup lang="ts">
// Ported from legacy/src/app/(admin)/general/page.tsx.
import { loadGeneralSettings, saveGeneralSettings } from '~/utils/admin/system/settings'

definePageMeta({ layout: 'dashboard', nav: 'admin', auth: { role: 'admin', primary: true, requireMailbox: true } })

const { t } = useLanguage()
useHead({ title: () => t('general.title') })

const maxMb = ref(25)
const unlimited = ref(true)
const limitGb = ref(10)
const loaded = ref(false)
const saving = ref(false)
const status = ref('')
const driveSaving = ref(false)
const driveStatus = ref('')

onMounted(async () => {
  try {
    const settings = await loadGeneralSettings()
    maxMb.value = settings.outboundAttachmentMaxMb
    unlimited.value = settings.driveStorageLimitGb === null
    if (settings.driveStorageLimitGb !== null) limitGb.value = settings.driveStorageLimitGb
    loaded.value = true
  } catch (error) {
    status.value = error instanceof Error ? error.message : t('general.loadFailed')
  }
})

const maxMbValid = computed(() => Number.isInteger(maxMb.value) && maxMb.value >= 1 && maxMb.value <= 25)

async function save() {
  saving.value = true
  status.value = ''
  try {
    const settings = await saveGeneralSettings({ outboundAttachmentMaxMb: maxMb.value })
    maxMb.value = settings.outboundAttachmentMaxMb
    status.value = t('general.saved')
  } catch (error) {
    status.value = error instanceof Error ? error.message : t('general.saveFailed')
  } finally {
    saving.value = false
  }
}

async function saveDrive() {
  driveSaving.value = true
  driveStatus.value = ''
  try {
    const settings = await saveGeneralSettings({ driveStorageLimitGb: unlimited.value ? null : limitGb.value })
    unlimited.value = settings.driveStorageLimitGb === null
    if (settings.driveStorageLimitGb !== null) limitGb.value = settings.driveStorageLimitGb
    driveStatus.value = t('general.driveSaved')
  } catch (error) {
    driveStatus.value = error instanceof Error ? error.message : t('general.saveFailed')
  } finally {
    driveSaving.value = false
  }
}
</script>

<template>
  <AdminSystemPage id="general" :title="t('general.title')" :description="t('general.description')">
    <UCard>
      <template #header>
        <h2 class="font-semibold text-highlighted">
          {{ t('general.attachments') }}
        </h2>
      </template>
      <form class="space-y-4" @submit.prevent="save">
        <UFormField :label="t('general.maxAttachments')" :help="t('general.appliesTo')">
          <UInputNumber v-model="maxMb" :min="1" :max="25" :step="1" :disabled="!loaded || saving" class="max-w-40" />
        </UFormField>
        <div class="space-y-2 rounded-lg bg-elevated/50 p-4 text-sm text-toned">
          <p>{{ t('general.cloudflareLimit') }}</p>
          <p>{{ t('general.largeFiles') }}</p>
        </div>
        <p v-if="status" role="status" class="text-sm text-toned">
          {{ status }}
        </p>
        <UButton type="submit" :loading="saving" :disabled="!loaded || !maxMbValid" :label="saving ? t('common.saving') : t('general.save')" />
      </form>
    </UCard>
    <UCard>
      <template #header>
        <h2 class="font-semibold text-highlighted">
          {{ t('general.drive') }}
        </h2>
      </template>
      <form class="space-y-4" @submit.prevent="saveDrive">
        <USwitch v-model="unlimited" :label="t('general.driveUnlimited')" :disabled="!loaded || driveSaving" />
        <UFormField v-if="!unlimited" :label="t('general.driveLimit')">
          <UInputNumber v-model="limitGb" :min="0.01" :max="1000000" :step="0.01" :disabled="!loaded || driveSaving" class="max-w-40" />
        </UFormField>
        <p class="text-sm text-muted">
          {{ t('general.driveHint') }}
        </p>
        <p v-if="driveStatus" role="status" class="text-sm text-toned">
          {{ driveStatus }}
        </p>
        <UButton type="submit" :loading="driveSaving" :disabled="!loaded || (!unlimited && !(limitGb > 0))" :label="driveSaving ? t('common.saving') : t('general.save')" />
      </form>
    </UCard>
  </AdminSystemPage>
</template>
