<script setup lang="ts">
// Ported from legacy/src/components/compose/new-template-dialog.tsx.
import { textToHtml } from '~/utils/compose/rich-text-utils'

const props = defineProps<{ mailboxId?: string | null, from: string }>()
const open = defineModel<boolean>('open', { required: true })
const { t } = useLanguage()
const title = ref('')
const content = ref('')
const saving = ref(false)
const error = ref('')

async function save() {
  saving.value = true
  error.value = ''
  try {
    await api('/api/templates', {
      method: 'POST',
      body: { mailboxId: props.mailboxId, from: props.from, title: title.value, text: content.value, html: textToHtml(content.value) },
    })
    open.value = false
    title.value = ''
    content.value = ''
  } catch (cause) {
    error.value = cause instanceof ApiError && typeof (cause.data as { error?: unknown } | null)?.error === 'string' ? cause.message : t('template.saveFailed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="t('template.new')" :ui="{ content: 'max-h-[calc(100vh-4rem)]' }">
    <template #body>
      <form class="space-y-4" @submit.prevent="save">
        <UFormField :label="t('template.title')" name="title" required>
          <UInput v-model="title" :maxlength="200" required class="w-full" />
        </UFormField>
        <UFormField :label="t('template.content')" name="content" required>
          <UTextarea v-model="content" :rows="8" required class="w-full" />
        </UFormField>
        <p v-if="error" role="alert" class="text-sm text-error">{{ error }}</p>
        <UButton type="submit" :loading="saving" :disabled="saving || !title.trim() || !content.trim()" :label="saving ? t('template.saving') : t('template.save')" />
      </form>
    </template>
  </UModal>
</template>
