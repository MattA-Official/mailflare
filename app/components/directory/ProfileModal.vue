<script setup lang="ts">
// Fork-only. Edit a person's directory profile from their directory entry: their own, or anyone's for an admin.
import { updateDirectoryPerson, type DirectoryPersonResponse } from '~/utils/directory/directory'

const props = defineProps<{ data: DirectoryPersonResponse }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [] }>()
const { t } = useLanguage()

function onSaved() {
  open.value = false
  emit('saved')
}
</script>

<template>
  <UModal v-model:open="open" :title="data.isMe ? t('directory.editMyProfile') : t('directory.editProfileOf', { name: data.person.name })" :ui="{ content: 'max-h-[calc(100vh-4rem)] overflow-y-auto' }">
    <template #body>
      <DirectoryProfileForm
        v-if="data.profile"
        :initial="data.profile"
        :manager-options="data.managerOptions ?? []"
        :can-edit-org="data.canEditOrg"
        :can-hide="data.isAdmin"
        :save="fields => updateDirectoryPerson(props.data.person.id, fields)"
        @saved="onSaved"
      />
    </template>
  </UModal>
</template>
