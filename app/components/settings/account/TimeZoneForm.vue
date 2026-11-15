<script setup lang="ts">
// Ported from legacy/src/components/settings/time-zone-form.tsx.
import { formatCurrentTimeInZone, listTimeZones, saveUserTimeZonePreference, updateUserTimeZone } from '~/utils/settings/account/time-zone'

const props = defineProps<{ userId: string, initialTimeZone: string | null }>()
const { t } = useLanguage()
const toast = useToast()

const timeZone = ref(props.initialTimeZone ?? '')
const savedTimeZone = ref(props.initialTimeZone ?? '')
const saving = ref(false)
const status = ref<string | null>(null)
const deviceTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
const zones = listTimeZones(deviceTimeZone)

const currentTime = computed(() => {
  try {
    return formatCurrentTimeInZone(timeZone.value.trim() || deviceTimeZone)
  } catch {
    return null
  }
})

watch(timeZone, () => { status.value = null })

async function submit() {
  saving.value = true
  status.value = null
  try {
    const saved = await updateUserTimeZone(timeZone.value)
    timeZone.value = saved ?? ''
    savedTimeZone.value = saved ?? ''
    saveUserTimeZonePreference(props.userId, saved)
    toast.add({ title: t('common.saved'), color: 'success' })
  } catch (error) {
    status.value = error instanceof Error ? error.message : t('settings.timeZone.failed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <form class="space-y-4" @submit.prevent="submit">
    <div>
      <h3 class="text-lg font-semibold text-highlighted">
        {{ t('settings.timeZone.title') }}
      </h3>
      <p class="mt-1 text-sm text-muted">
        {{ t('settings.timeZone.description', { zone: deviceTimeZone }) }}
      </p>
    </div>
    <UFormField :label="t('settings.timeZone.title')" :help="currentTime ? t('settings.timeZone.current', { time: currentTime }) : undefined" name="account-time-zone">
      <!-- An empty value means "follow this device", so the field is free text with suggestions. -->
      <UInput
        id="account-time-zone"
        v-model="timeZone"
        list="account-time-zone-options"
        :placeholder="t('settings.timeZone.placeholder', { zone: deviceTimeZone })"
        autocomplete="off"
      />
      <datalist id="account-time-zone-options">
        <option v-for="zone in zones" :key="zone" :value="zone" />
      </datalist>
    </UFormField>
    <UAlert v-if="status" role="alert" color="error" variant="subtle" :title="status" />
    <div class="flex items-center gap-3">
      <UButton
        type="submit"
        :disabled="saving || timeZone.trim() === savedTimeZone || !currentTime"
        :label="saving ? t('common.saving') : t('settings.timeZone.save')"
      />
    </div>
  </form>
</template>
