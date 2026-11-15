<script setup lang="ts">
// Fork-only. The fields of an app registered with the OIDC provider, shared by create and edit.
import type { OidcAppRole } from '~/utils/admin/system/apps'
import { roleKeyFromLabel } from '~/utils/admin/system/apps'

export type AppFormDraft = {
  name: string
  homepageUrl: string
  redirectUris: string
  roles: (OidcAppRole & { keyEdited?: boolean })[]
  confidential: boolean
  disabled: boolean
}

const props = defineProps<{ mode: 'create' | 'edit' }>()
const draft = defineModel<AppFormDraft>({ required: true })
const { t } = useLanguage()

function addRole() {
  draft.value.roles.push({ key: '', label: '', description: '' })
}

function removeRole(index: number) {
  draft.value.roles.splice(index, 1)
}

function onLabel(role: AppFormDraft['roles'][number], label: string) {
  role.label = label
  if (!role.keyEdited) role.key = roleKeyFromLabel(label)
}

function onKey(role: AppFormDraft['roles'][number], key: string) {
  role.key = key
  role.keyEdited = true
}
</script>

<template>
  <div class="space-y-5">
    <UFormField :label="t('oidc.apps.name')" required>
      <UInput v-model="draft.name" :maxlength="80" :placeholder="t('oidc.apps.namePlaceholder')" />
    </UFormField>
    <UFormField :label="t('oidc.apps.homepage')" :help="t('oidc.apps.homepageHint')">
      <UInput v-model="draft.homepageUrl" type="url" placeholder="https://admin.example.com" />
    </UFormField>
    <UFormField :label="t('oidc.apps.redirectUris')" :help="t('oidc.apps.redirectUrisHint')" required>
      <UTextarea v-model="draft.redirectUris" :rows="3" autoresize placeholder="https://admin.example.com/auth/callback" class="font-mono text-xs" />
    </UFormField>

    <fieldset class="space-y-3">
      <legend class="text-sm font-medium text-default">
        {{ t('oidc.apps.roles') }}
      </legend>
      <p class="text-xs text-muted">
        {{ t('oidc.apps.rolesHint') }}
      </p>
      <div v-for="(role, index) in draft.roles" :key="index" class="grid gap-2 rounded-lg border border-default p-3 sm:grid-cols-[1fr_1fr_auto]">
        <UFormField :label="t('oidc.apps.roleLabel')">
          <UInput :model-value="role.label" :maxlength="60" placeholder="Owner" @update:model-value="value => onLabel(role, String(value))" />
        </UFormField>
        <UFormField :label="t('oidc.apps.roleKey')">
          <UInput :model-value="role.key" :maxlength="40" placeholder="owner" class="font-mono" @update:model-value="value => onKey(role, String(value))" />
        </UFormField>
        <div class="flex items-end">
          <UButton color="neutral" variant="ghost" icon="i-lucide-x" :aria-label="t('oidc.apps.removeRole')" :disabled="draft.roles.length <= 1" @click="removeRole(index)" />
        </div>
        <UFormField :label="t('oidc.apps.roleDescription')" class="sm:col-span-3">
          <UInput v-model="role.description" :maxlength="200" />
        </UFormField>
      </div>
      <UButton color="neutral" variant="outline" size="sm" icon="i-lucide-plus" :label="t('oidc.apps.addRole')" :disabled="draft.roles.length >= 20" @click="addRole" />
    </fieldset>

    <UCheckbox v-if="props.mode === 'create'" v-model="draft.confidential" :label="t('oidc.apps.confidential')" :description="t('oidc.apps.confidentialHint')" />
    <UCheckbox v-else v-model="draft.disabled" :label="t('oidc.apps.disabled')" :description="t('oidc.apps.disabledHint')" />
  </div>
</template>
