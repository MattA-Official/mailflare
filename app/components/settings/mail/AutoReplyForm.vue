<script setup lang="ts">
// Out-of-office reply for the selected mailbox. Ported from
// legacy/src/components/settings/mailbox-auto-reply-form.tsx.
interface AutoReplySettings { enabled: boolean, subject: string, body: string }
interface AutoReplyResponse { mailbox?: { autoReplyEnabled: boolean, autoReplySubject: string, autoReplyBody: string } }

const { t } = useLanguage()
const { selectedMailbox, setSelectedMailbox, isLoading } = useSelectedMailbox()
const settings = reactive<AutoReplySettings>({ enabled: false, subject: 'Out of office', body: '' })
const saved = ref<AutoReplySettings>({ ...settings })
const status = ref<string | null>(null)
const saving = ref(false)

watch(
  () => [selectedMailbox.value?.id, selectedMailbox.value?.autoReplyEnabled, selectedMailbox.value?.autoReplySubject, selectedMailbox.value?.autoReplyBody],
  () => {
    const mailbox = selectedMailbox.value
    const next = { enabled: mailbox?.autoReplyEnabled ?? false, subject: mailbox?.autoReplySubject ?? 'Out of office', body: mailbox?.autoReplyBody ?? '' }
    // Our own save updates the mailbox too; keep its "Saved" status in that case.
    if (JSON.stringify(next) === JSON.stringify(saved.value) && JSON.stringify(settings) === JSON.stringify(saved.value)) return
    Object.assign(settings, next)
    saved.value = { ...settings }
    status.value = null
  },
  { immediate: true },
)

const address = computed(() => selectedMailbox.value ? `${selectedMailbox.value.localPart}@${selectedMailbox.value.hostname}` : '')
const canManage = computed(() => selectedMailbox.value?.permission === 'full_access')
const changed = computed(() => JSON.stringify(settings) !== JSON.stringify(saved.value))

async function submit() {
  const mailbox = selectedMailbox.value
  if (!mailbox) return
  if (settings.enabled && !settings.body.trim()) {
    status.value = t('settings.autoReply.needMessage')
    return
  }
  saving.value = true
  status.value = null
  try {
    const data = await api<AutoReplyResponse>(`/api/mailboxes/${mailbox.id}`, {
      method: 'PATCH',
      body: { autoReplyEnabled: settings.enabled, autoReplySubject: settings.subject, autoReplyBody: settings.body },
    })
    if (!data.mailbox) throw new Error(t('settings.autoReply.failed'))
    Object.assign(settings, { enabled: data.mailbox.autoReplyEnabled, subject: data.mailbox.autoReplySubject, body: data.mailbox.autoReplyBody })
    saved.value = { ...settings }
    setSelectedMailbox({ ...mailbox, autoReplyEnabled: settings.enabled, autoReplySubject: settings.subject, autoReplyBody: settings.body })
    status.value = t('common.saved')
  } catch (cause) {
    status.value = cause instanceof Error ? cause.message : t('settings.autoReply.failed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <p v-if="isLoading" class="text-sm text-muted">{{ t('settings.signature.loadingInbox') }}</p>
  <p v-else-if="!selectedMailbox" class="text-sm text-muted">{{ t('settings.autoReply.selectInbox') }}</p>
  <UForm v-else :state="settings" class="space-y-4" @submit="submit">
    <SettingsMailSettingRow :title="t('settings.autoReply.enableFor', { address })" :description="t('settings.autoReply.limit')">
      <USwitch v-model="settings.enabled" :disabled="!canManage || saving" :aria-label="t('settings.autoReply.enableFor', { address })" />
    </SettingsMailSettingRow>
    <template v-if="settings.enabled">
      <UFormField :label="t('settings.autoReply.subject')" name="subject">
        <UInput
          v-model="settings.subject"
          :placeholder="t('settings.autoReply.subjectPlaceholder')"
          :disabled="!canManage || saving"
          class="w-full"
        />
      </UFormField>
      <UFormField :label="t('settings.autoReply.message')" name="body">
        <UTextarea
          v-model="settings.body"
          :placeholder="t('settings.autoReply.messagePlaceholder')"
          :rows="7"
          :disabled="!canManage || saving"
          class="w-full"
        />
      </UFormField>
    </template>
    <!-- Turning the reply off is saved here too, so the button stays reachable when the fields hide. -->
    <div v-if="settings.enabled || changed || status" class="flex items-center gap-3">
      <UButton type="submit" :disabled="!canManage || saving || !changed" :loading="saving" :label="saving ? t('common.saving') : t('settings.autoReply.save')" />
      <p v-if="!canManage" class="text-sm text-muted">{{ t('settings.autoReply.needFullAccess') }}</p>
      <p v-if="status" role="status" class="text-sm text-muted">{{ status }}</p>
    </div>
  </UForm>
</template>
