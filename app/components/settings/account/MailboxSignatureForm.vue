<script setup lang="ts">
// Ported from legacy/src/components/settings/mailbox-signature-form.tsx.
import { getMailboxAddress, isHtmlSignature, updateMailboxSignature } from '~/utils/settings/account/mailbox'

const { t } = useLanguage()
const { selectedMailbox, setSelectedMailbox, isLoading } = useSelectedMailbox()
const signature = ref('')
const savedSignature = ref('')
const status = ref<string | null>(null)
const saving = ref(false)

watch(() => [selectedMailbox.value?.id, selectedMailbox.value?.signature] as const, ([, next]) => {
  signature.value = next ?? ''
  savedSignature.value = next ?? ''
  status.value = null
}, { immediate: true })

const canManage = computed(() => selectedMailbox.value?.permission === 'full_access')

async function submit() {
  const mailbox = selectedMailbox.value
  if (!mailbox) return
  saving.value = true
  status.value = null
  try {
    const saved = await updateMailboxSignature(mailbox.id, signature.value)
    signature.value = saved
    savedSignature.value = saved
    setSelectedMailbox({ ...mailbox, signature: saved })
    status.value = t('common.saved')
  } catch (error) {
    status.value = error instanceof Error ? error.message : t('settings.signature.failed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <p v-if="isLoading" class="text-sm text-muted">
    {{ t('settings.signature.loadingInbox') }}
  </p>
  <p v-else-if="!selectedMailbox" class="text-sm text-muted">
    {{ t('settings.signature.selectInbox') }}
  </p>
  <form v-else class="space-y-4" @submit.prevent="submit">
    <UFormField :label="t('settings.signature.for', { address: getMailboxAddress(selectedMailbox) })" :help="t('settings.signature.hint')" name="mailboxSignature">
      <UTextarea
        id="mailboxSignature"
        v-model="signature"
        :placeholder="t('settings.signature.placeholder')"
        :rows="6"
        :disabled="!canManage || saving"
        class="w-full"
      />
    </UFormField>
    <div v-if="isHtmlSignature(signature)" class="space-y-2">
      <p class="text-xs font-medium text-muted">
        {{ t('settings.signature.preview') }}
      </p>
      <SettingsAccountSignaturePreview :html="signature" />
    </div>
    <div class="flex items-center gap-3">
      <UButton
        type="submit"
        :disabled="!canManage || saving || signature.trim() === savedSignature"
        :label="saving ? t('common.saving') : t('settings.signature.save')"
      />
      <p v-if="!canManage" class="text-sm text-muted">
        {{ t('settings.signature.needFullAccess') }}
      </p>
      <p v-if="status" role="status" class="text-sm text-muted">
        {{ status }}
      </p>
    </div>
  </form>
</template>
