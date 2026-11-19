<script setup lang="ts">
// Ported from legacy/src/app/(admin)/branding/page.tsx. The licence-required state is gone:
// branding is always available in the fork.
import { BRANDING_ICON_ACCEPT, saveBranding } from '~/utils/admin/system/settings'

definePageMeta({ layout: 'dashboard', nav: 'admin', auth: { role: 'admin', primary: true, requireMailbox: true } })

const { t } = useLanguage()
const toast = useToast()
const branding = useBranding()
useHead({ title: () => t('branding.title') })

const appName = ref(branding.appName.value)
watch(branding.appName, (value) => {
  appName.value = value
})
const icon = ref<File | null>(null)
const preview = ref<string | null>(null)
const status = ref<string | null>(null)
const saving = ref(false)
const input = ref<HTMLInputElement | null>(null)

function pickIcon(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0] ?? null
  target.value = ''
  icon.value = file
  if (preview.value) URL.revokeObjectURL(preview.value)
  preview.value = file ? URL.createObjectURL(file) : null
}
onBeforeUnmount(() => {
  if (preview.value) URL.revokeObjectURL(preview.value)
})

async function submit() {
  saving.value = true
  status.value = null
  try {
    await saveBranding(appName.value.trim(), icon.value)
    await branding.refreshBranding()
    icon.value = null
    // The saved icon now comes from the server, so the local preview can go.
    if (preview.value) URL.revokeObjectURL(preview.value)
    preview.value = null
    toast.add({ title: t('branding.updated'), color: 'success' })
  } catch (error) {
    status.value = error instanceof Error ? error.message : t('branding.saveFailed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <AdminSystemPage id="branding" :title="t('branding.title')" :description="t('branding.description')">
    <UCard>
      <template #header>
        <h2 class="flex items-center gap-2 font-semibold text-highlighted">
          <UIcon name="i-lucide-palette" class="size-5" />{{ t('branding.identity') }}
        </h2>
        <p class="mt-1 text-sm text-muted">
          {{ t('branding.faviconNote') }}
        </p>
      </template>
      <form class="space-y-6" @submit.prevent="submit">
        <UFormField :label="t('branding.appName')" required>
          <UInput v-model="appName" :maxlength="60" required />
        </UFormField>
        <UFormField :label="t('branding.appIcon')">
          <input ref="input" type="file" :accept="BRANDING_ICON_ACCEPT" class="hidden" @change="pickIcon">
          <button type="button" class="flex items-center gap-4 rounded-lg border border-dashed border-accented p-4 text-left hover:bg-elevated/50" @click="input?.click()">
            <img :src="preview ?? branding.iconUrl.value" :alt="t('branding.iconPreview')" class="size-16 rounded-lg object-cover">
            <span class="text-sm text-toned">
              <UIcon name="i-lucide-image-plus" class="mb-1 block size-5" />
              {{ t('branding.chooseImage') }}<br>
              <span class="text-xs text-muted">{{ t('branding.maxSize') }}</span>
            </span>
          </button>
        </UFormField>
        <UAlert v-if="status" role="alert" color="error" variant="subtle" :title="status" />
        <UButton type="submit" :loading="saving" :disabled="!appName.trim()" :label="saving ? t('common.saving') : t('branding.save')" />
      </form>
    </UCard>
  </AdminSystemPage>
</template>
