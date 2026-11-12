<script setup lang="ts">
// Rules for the selected mailbox, applied after delivery. Ported from
// legacy/src/components/settings/inbox-rules.tsx.
import type { InboxRule, InboxRuleField, InboxRuleInput, InboxRuleOperator, RuleFolder } from '~/types/settings/mail'
import {
  createInboxRule,
  deleteInboxRule,
  fetchInboxRules,
  fetchMailboxFolders,
  getInboxRuleDestination,
  getRuleFieldLabel,
  getRuleOperatorLabel,
  updateInboxRule,
} from '~/utils/settings/mail/inbox-rules'

const { t } = useLanguage()
const { selectedMailbox } = useSelectedMailbox()
const mailboxId = computed(() => selectedMailbox.value?.id ?? '')

const { data: folders } = useAsyncData<RuleFolder[]>(
  'settings-rule-folders',
  () => mailboxId.value ? fetchMailboxFolders(mailboxId.value) : Promise.resolve([]),
  { watch: [mailboxId], default: () => [] },
)
const { data: rules, refresh: refreshRules } = useAsyncData<InboxRule[]>(
  'settings-inbox-rules',
  () => mailboxId.value ? fetchInboxRules(mailboxId.value) : Promise.resolve([]),
  { watch: [mailboxId], default: () => [] },
)

const dialogOpen = ref(false)
const editingRule = ref<InboxRule | null>(null)
const form = reactive({
  matchField: 'email' as InboxRuleField,
  matchOperator: 'contains' as InboxRuleOperator,
  matchValue: '',
  destination: '',
  forwardTo: '',
  keepCopy: false,
})
const saving = ref(false)
const saveError = ref<string | null>(null)
const removing = ref(false)
const isForward = computed(() => form.destination === 'forward')

// Forwarding happens before the body is read, so it cannot match on content.
watch(() => form.matchField, (field) => {
  if (field === 'content' && isForward.value) form.destination = ''
})

const folderNames = computed(() => new Map<string, string>(folders.value.map(folder => [folder.id, folder.name])))

const fieldItems = computed(() => [
  { value: 'email', label: t('rules.field.email') },
  { value: 'content', label: t('rules.field.content') },
  { value: 'title', label: t('rules.field.title') },
])
const operatorItems = computed(() => [
  { value: 'contains', label: t('rules.operatorOption.contains') },
  { value: 'exact', label: t('rules.operatorOption.exact') },
])
const destinationItems = computed(() => [
  ...(form.matchField !== 'content' ? [{ value: 'forward', label: t('rules.forwardOption') }] : []),
  { value: 'spam', label: t('navigation.spam') },
  { value: 'trash', label: t('navigation.trash') },
  ...folders.value.map(folder => ({ value: `folder:${folder.id}`, label: folder.name })),
])

const canSubmit = computed(() => !!mailboxId.value && !!form.destination && (!isForward.value || !!form.forwardTo.trim()) && !!form.matchValue.trim() && !saving.value)

function destinationLabel(rule: InboxRule) {
  if (rule.action === 'forward') return t(rule.keepCopy ? 'rules.forwardCopyTo' : 'rules.forwardTo', { to: rule.forwardTo ?? '—' })
  if (rule.action === 'spam') return t('navigation.spam')
  if (rule.action === 'trash') return t('navigation.trash')
  return folderNames.value.get(rule.folderId ?? '') ?? t('rules.unknownFolder')
}

function ruleIcon(rule: InboxRule) {
  if (rule.action === 'forward') return 'i-lucide-forward'
  if (rule.action === 'spam') return 'i-lucide-shield-alert'
  if (rule.action === 'trash') return 'i-lucide-trash-2'
  return 'i-lucide-folder'
}

function openCreate() {
  editingRule.value = null
  Object.assign(form, { matchField: 'email', matchOperator: 'contains', matchValue: '', destination: '', forwardTo: '', keepCopy: false })
  saveError.value = null
  dialogOpen.value = true
}

function openEdit(rule: InboxRule) {
  editingRule.value = rule
  Object.assign(form, {
    matchField: rule.matchField,
    matchOperator: rule.matchOperator,
    matchValue: rule.matchValue || rule.pattern,
    destination: getInboxRuleDestination(rule),
    forwardTo: rule.forwardTo ?? '',
    keepCopy: rule.keepCopy,
  })
  saveError.value = null
  dialogOpen.value = true
}

async function save() {
  if (!canSubmit.value) return
  const input: InboxRuleInput = {
    mailboxId: mailboxId.value,
    matchField: form.matchField,
    matchOperator: form.matchOperator,
    matchValue: form.matchValue,
    destination: form.destination,
    ...(isForward.value ? { forwardTo: form.forwardTo.trim(), keepCopy: form.keepCopy } : {}),
    priority: editingRule.value?.priority ?? 10,
  }
  saving.value = true
  saveError.value = null
  try {
    if (editingRule.value) await updateInboxRule(editingRule.value.id, input)
    else await createInboxRule(input)
    dialogOpen.value = false
    editingRule.value = null
    await refreshRules()
  } catch (cause) {
    saveError.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    saving.value = false
  }
}

async function remove(rule: InboxRule) {
  removing.value = true
  try {
    await deleteInboxRule(rule.id)
    await refreshRules()
  } finally {
    removing.value = false
  }
}
</script>

<template>
  <section class="space-y-4">
    <div class="flex items-center gap-4">
      <header class="flex-1">
        <h2 class="text-2xl font-semibold text-highlighted">{{ t('rules.mailboxTitle') }}</h2>
        <p class="mt-1 text-sm text-muted">{{ t('rules.appliedAfterDelivery') }}</p>
      </header>
      <UButton icon="i-lucide-plus" :label="t('rules.new')" :disabled="!mailboxId" @click="openCreate" />
    </div>

    <UCard>
      <p v-if="rules.length === 0" class="text-sm text-muted">{{ t('rules.none') }}</p>
      <div v-else class="space-y-1">
        <div
          v-for="rule in rules"
          :key="rule.id"
          class="group flex items-center gap-3 rounded-xl bg-elevated/50 px-3 py-3 transition-colors hover:bg-elevated"
        >
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-primary"
            @click="openEdit(rule)"
          >
            <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <UIcon :name="ruleIcon(rule)" class="size-4" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium text-highlighted">
                {{ getRuleFieldLabel(rule.matchField, t) }} {{ getRuleOperatorLabel(rule.matchOperator, t) }} {{ rule.matchValue || rule.pattern }}
              </span>
              <span class="block truncate text-xs text-muted">{{ destinationLabel(rule) }}</span>
            </span>
          </button>
          <UButton
            icon="i-lucide-trash-2"
            color="neutral"
            variant="ghost"
            size="sm"
            :disabled="removing"
            :aria-label="t('rules.delete')"
            class="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 group-focus-within:opacity-100"
            @click="remove(rule)"
          />
        </div>
      </div>
    </UCard>

    <UModal
      v-model:open="dialogOpen"
      :title="editingRule ? t('rules.update') : t('rules.new')"
      :description="t('rules.dialogDescription')"
      :ui="{ content: 'sm:max-w-[560px]' }"
    >
      <template #body>
        <UForm id="inbox-rule-form" :state="form" class="space-y-4" @submit="save">
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <UFormField :label="t('rules.fieldLabel')" name="matchField">
              <USelect v-model="form.matchField" :items="fieldItems" class="w-full" />
            </UFormField>
            <UFormField :label="t('rules.matchLabel')" name="matchOperator">
              <USelect v-model="form.matchOperator" :items="operatorItems" class="w-full" />
            </UFormField>
          </div>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <UFormField :label="t('rules.valueLabel')" name="matchValue">
              <UInput
                v-model="form.matchValue"
                :placeholder="form.matchField === 'email' ? t('rules.valuePlaceholderEmail') : t('rules.valuePlaceholderOther')"
                class="w-full"
              />
            </UFormField>
            <UFormField :label="t('rules.destination')" name="destination">
              <USelect v-model="form.destination" :items="destinationItems" :placeholder="t('rules.selectDestination')" class="w-full" />
            </UFormField>
          </div>
          <div v-if="isForward" class="grid gap-3">
            <UFormField :label="t('rules.forwardAddress')" :help="t('rules.forwardHint')" name="forwardTo">
              <UInput v-model="form.forwardTo" type="email" autocomplete="email" placeholder="destination@example.com" class="w-full" />
            </UFormField>
            <UCheckbox v-model="form.keepCopy" :label="t('rules.forwardKeepCopy')" />
          </div>
          <UAlert v-if="saveError" color="error" variant="subtle" :title="saveError" />
        </UForm>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" :label="t('common.cancel')" @click="dialogOpen = false" />
          <UButton
            type="submit"
            form="inbox-rule-form"
            :disabled="!canSubmit"
            :loading="saving"
            :label="saving ? t('common.saving') : editingRule ? t('rules.saveChanges') : t('rules.create')"
          />
        </div>
      </template>
    </UModal>
  </section>
</template>
