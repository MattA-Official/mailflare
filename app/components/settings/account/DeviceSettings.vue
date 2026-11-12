<script setup lang="ts">
// Settings > Security card listing phones and tablets signed in with the mobile app. Each holds a
// device key; signing one out revokes the key and its push registration.
// Ported from legacy/src/components/settings/device-settings.tsx.
import { formatUserDate } from '#lib/time/utils'
import type { MobileDevice } from '~/types/settings/account'
import { loadDevices, signOutDevice } from '~/utils/settings/account/devices'

const { t } = useLanguage()
const devices = ref<MobileDevice[] | null>(null)
const error = ref<string | null>(null)
const busy = ref<string | null>(null)
const confirming = ref<MobileDevice | null>(null)

onMounted(async () => {
  try {
    devices.value = await loadDevices()
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('devices.loadFailed')
  }
})

async function remove(device: MobileDevice) {
  confirming.value = null
  busy.value = device.id
  try {
    await signOutDevice(device.id)
    devices.value = devices.value?.filter(item => item.id !== device.id) ?? null
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('devices.loadFailed')
  } finally {
    busy.value = null
  }
}

const confirmOpen = computed({ get: () => confirming.value !== null, set: (v) => { if (!v) confirming.value = null } })
</script>

<template>
  <p v-if="!devices" class="text-sm text-muted">
    {{ error ?? t('devices.loading') }}
  </p>
  <p v-else-if="devices.length === 0" class="text-sm text-muted">
    {{ t('devices.empty') }}
  </p>
  <div v-else class="space-y-3">
    <p v-if="error" class="text-sm text-error">
      {{ error }}
    </p>
    <ul class="divide-y divide-default rounded-lg bg-elevated/50">
      <li v-for="device in devices" :key="device.id" class="flex items-center gap-3 p-4">
        <UIcon name="i-lucide-smartphone" class="size-5 shrink-0 text-muted" />
        <div class="min-w-0 flex-1">
          <p class="flex items-center gap-2 truncate text-sm font-medium text-highlighted">
            {{ device.name }}
            <UIcon v-if="device.pushEnabled" name="i-lucide-bell" class="size-3.5 text-dimmed" :aria-label="t('devices.push')" />
          </p>
          <p class="truncate text-sm text-muted">
            {{ t('devices.signedIn', { date: formatUserDate(device.createdAt, { dateStyle: 'short' }) }) }} ·
            {{ device.lastUsedAt ? t('apiKeys.lastUsed', { date: formatUserDate(device.lastUsedAt, { dateStyle: 'short' }) }) : t('apiKeys.neverUsed') }}
          </p>
        </div>
        <UButton color="neutral" variant="outline" size="sm" :disabled="busy === device.id" :label="t('devices.signOut')" @click="confirming = device" />
      </li>
    </ul>

    <UModal v-model:open="confirmOpen" :title="t('devices.signOut')" :description="confirming ? t('devices.signOutConfirm', { name: confirming.name }) : undefined">
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" :label="t('common.cancel')" @click="confirming = null" />
          <UButton color="error" :label="t('devices.signOut')" @click="confirming && remove(confirming)" />
        </div>
      </template>
    </UModal>
  </div>
</template>
