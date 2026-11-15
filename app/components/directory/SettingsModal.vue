<script setup lang="ts">
// Fork-only. Directory settings for user admins: whether people set their own title, department and manager,
// and who sits at the top of the reporting-lines chart.
import { fetchDirectorySettings, updateDirectorySettings, type DirectoryListPerson } from '~/utils/directory/directory'

const props = defineProps<{ people: DirectoryListPerson[] }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [] }>()
const { t } = useLanguage()
const toast = useToast()

const NONE = '__none__'
const selfEditOrg = ref(true)
const root = ref(NONE)
const available = ref(true)
const loading = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)
const rootItems = computed(() => [{ label: t('directory.noRoot'), value: NONE }, ...props.people.map(person => ({ label: person.name, description: person.email, value: person.id }))])

watch(open, async (isOpen) => {
  if (!isOpen) return
  loading.value = true
  error.value = null
  try {
    const result = await fetchDirectorySettings()
    available.value = result.available
    selfEditOrg.value = result.settings.selfEditOrg
    root.value = result.settings.orgRootUserId ?? NONE
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('directory.loadFailed')
  } finally {
    loading.value = false
  }
})

async function save() {
  saving.value = true
  error.value = null
  try {
    await updateDirectorySettings({ selfEditOrg: selfEditOrg.value, orgRootUserId: root.value === NONE ? null : root.value })
    toast.add({ title: t('directory.settingsSaved'), color: 'success' })
    open.value = false
    emit('saved')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('directory.settingsFailed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="t('directory.settingsTitle')" :description="t('directory.settingsDescription')">
    <template #body>
      <UAlert v-if="!available" color="neutral" variant="subtle" icon="i-lucide-database" :title="t('directory.needsMigration')" />
      <form v-else class="space-y-4" @submit.prevent="save">
        <USwitch v-model="selfEditOrg" :disabled="loading" :label="t('directory.selfEditOrg')" :description="t('directory.selfEditOrgHint')" />
        <UFormField :label="t('directory.orgRoot')" :hint="t('groups.optional')" :description="t('directory.orgRootHint')">
          <USelectMenu v-model="root" :items="rootItems" value-key="value" :disabled="loading" :search-input="{ placeholder: t('directory.searchPeople') }" />
        </UFormField>
        <UAlert v-if="error" role="alert" color="error" variant="subtle" :title="error" />
        <UButton type="submit" :loading="saving" :disabled="loading" :label="saving ? t('common.saving') : t('common.save')" />
      </form>
    </template>
  </UModal>
</template>
