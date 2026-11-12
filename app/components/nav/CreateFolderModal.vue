<script setup lang="ts">
// "Create folder" dialog from the mail sidebar (upstream dashboard-nav).
import { folderColorKeys } from '#lib/folders/color-keys'
import { DEFAULT_FOLDER_COLOR, FOLDER_COLOR_OPTIONS } from '#lib/folders/colors'
import type { FolderColor } from '#lib/folders/types'
import { FOLDERS_CHANGED_EVENT, invalidateFolderCache } from '~/utils/folders/client'

const props = defineProps<{ mailboxId: string }>()
const emit = defineEmits<{ created: [folder: { id: string, name: string, color: FolderColor }] }>()
const open = defineModel<boolean>('open', { default: false })

const { t } = useLanguage()
const toast = useToast()
const name = ref('')
const color = ref<FolderColor>(DEFAULT_FOLDER_COLOR)
const saving = ref(false)

watch(open, (value) => {
  if (!value) return
  name.value = ''
  color.value = DEFAULT_FOLDER_COLOR
})

async function submit() {
  if (!name.value.trim()) return
  saving.value = true
  try {
    const folder = await api<{ id: string, name: string, color: FolderColor }>('/api/folders', {
      method: 'POST',
      body: { mailboxId: props.mailboxId, name: name.value, color: color.value },
    })
    invalidateFolderCache()
    window.dispatchEvent(new Event(FOLDERS_CHANGED_EVENT))
    emit('created', folder)
    open.value = false
  } catch (error) {
    toast.add({ color: 'error', title: error instanceof Error ? error.message : String(error) })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="t('navigation.createFolder')" :description="t('navigation.folderDescription')">
    <template #body>
      <form id="create-folder" class="space-y-4" @submit.prevent="submit">
        <UFormField :label="t('navigation.folderName')" name="name">
          <UInput v-model="name" :placeholder="t('navigation.folderExample')" autofocus class="w-full" />
        </UFormField>
        <UFormField :label="t('navigation.color')" name="color">
          <div class="flex flex-wrap gap-2" role="radiogroup" :aria-label="t('navigation.folderColor')">
            <button
              v-for="option in FOLDER_COLOR_OPTIONS"
              :key="option.value"
              type="button"
              role="radio"
              :aria-checked="color === option.value"
              :aria-label="t(folderColorKeys[option.value])"
              :title="t(folderColorKeys[option.value])"
              class="size-8 rounded-full border-2 transition-transform hover:scale-110"
              :class="color === option.value ? 'border-inverted ring-2 ring-accented ring-offset-2 ring-offset-default' : 'border-transparent'"
              :style="{ backgroundColor: option.value }"
              @click="color = option.value"
            />
          </div>
        </UFormField>
      </form>
    </template>
    <template #footer>
      <UButton type="submit" form="create-folder" :loading="saving" :disabled="!name.trim()" :label="saving ? t('navigation.creating') : t('navigation.createFolder')" />
    </template>
  </UModal>
</template>
