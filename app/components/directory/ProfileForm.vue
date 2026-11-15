<script setup lang="ts">
// Fork-only. The directory profile fields: title, department, manager, phone, location, pronouns and about.
// Used for your own profile in Settings -> Account and, by admins, for anyone's from the directory.
import type { ManagerOption, ProfileFields } from '~/utils/directory/directory'

const props = defineProps<{
  initial: ProfileFields
  managerOptions: ManagerOption[]
  /** Title, department and manager; admins can always change them, people when the directory settings allow. */
  canEditOrg: boolean
  /** Admins only: hide the person from the directory. */
  canHide?: boolean
  save: (fields: Partial<ProfileFields>) => Promise<unknown>
}>()
const emit = defineEmits<{ saved: [] }>()

const { t } = useLanguage()
const toast = useToast()
type TextField = 'title' | 'department' | 'phone' | 'location' | 'pronouns' | 'about'
const TEXT_FIELDS: TextField[] = ['title', 'department', 'phone', 'location', 'pronouns', 'about']
// Inputs hold strings; empty ones are saved as null.
function toForm(value: ProfileFields) {
  return {
    ...Object.fromEntries(TEXT_FIELDS.map(field => [field, value[field] ?? ''])) as Record<TextField, string>,
    reportsToUserId: value.reportsToUserId,
    hidden: value.hidden,
  }
}
const form = reactive(toForm(props.initial))
watch(() => props.initial, (value) => {
  Object.assign(form, toForm(value))
})
const clean = (value: string) => value.trim() || null

const NO_MANAGER = '__none__'
const managerItems = computed(() => [
  { label: t('directory.noManager'), value: NO_MANAGER },
  ...props.managerOptions.map(option => ({ label: option.name, description: option.email, value: option.id })),
])
const manager = computed({
  get: () => form.reportsToUserId ?? NO_MANAGER,
  set: (value: string) => { form.reportsToUserId = value === NO_MANAGER ? null : value },
})

const saving = ref(false)
const error = ref<string | null>(null)
async function submit() {
  saving.value = true
  error.value = null
  const fields: Partial<ProfileFields> = {
    phone: clean(form.phone),
    location: clean(form.location),
    pronouns: clean(form.pronouns),
    about: clean(form.about),
    ...(props.canEditOrg ? { title: clean(form.title), department: clean(form.department), reportsToUserId: form.reportsToUserId } : {}),
    ...(props.canHide ? { hidden: form.hidden } : {}),
  }
  try {
    await props.save(fields)
    toast.add({ title: t('directory.profileSaved'), color: 'success' })
    emit('saved')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('directory.profileSaveFailed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <form class="space-y-4" @submit.prevent="submit">
    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField :label="t('directory.jobTitle')" :hint="canEditOrg ? undefined : t('directory.setByAdmin')">
        <UInput v-model="form.title" :disabled="!canEditOrg" maxlength="120" />
      </UFormField>
      <UFormField :label="t('directory.department')" :hint="canEditOrg ? undefined : t('directory.setByAdmin')">
        <UInput v-model="form.department" :disabled="!canEditOrg" maxlength="120" />
      </UFormField>
    </div>
    <UFormField :label="t('directory.manager')" :hint="canEditOrg ? undefined : t('directory.setByAdmin')">
      <USelectMenu v-model="manager" :items="managerItems" value-key="value" :disabled="!canEditOrg" :search-input="{ placeholder: t('directory.searchPeople') }" />
    </UFormField>
    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField :label="t('directory.phone')">
        <UInput v-model="form.phone" type="tel" autocomplete="tel" maxlength="60" />
      </UFormField>
      <UFormField :label="t('directory.location')">
        <UInput v-model="form.location" maxlength="120" />
      </UFormField>
    </div>
    <UFormField :label="t('directory.pronouns')">
      <UInput v-model="form.pronouns" :placeholder="t('directory.pronounsPlaceholder')" maxlength="40" />
    </UFormField>
    <UFormField :label="t('directory.about')">
      <UTextarea v-model="form.about" :rows="3" maxlength="1000" />
    </UFormField>
    <USwitch v-if="canHide" v-model="form.hidden" :label="t('directory.hide')" :description="t('directory.hideHint')" />
    <UAlert v-if="error" role="alert" color="error" variant="subtle" :title="error" />
    <UButton type="submit" :loading="saving" :label="saving ? t('common.saving') : t('common.save')" />
  </form>
</template>
