<script setup lang="ts">
// Domain routing rules: block rules and catch-all fallbacks for one domain.
// Ported from legacy/src/components/settings/domain-routing/domain-routing.tsx. Upstream fell back
// to the selected mailbox's domain when no domain was passed; callers now pass it explicitly
// (/settings/rules passes the selected mailbox's domain).
import type { DomainRule, DomainRuleInput } from '~/types/admin/email/routing'
import { canManageDomains } from '#lib/auth/admin'
import { errorMessage } from '~/utils/admin/email/domains'
import { validationMessage, ACTION_LABELS, MATCH_FIELD_LABELS, MATCH_OPERATOR_LABELS, createDomainRule, deleteDomainRule, emptyRuleInput, fetchDomainRules, ruleToInput, updateDomainRule } from '~/utils/admin/email/routing'

const props = defineProps<{ domain: { id: string, hostname: string } }>()
const { t } = useLanguage()
const toast = useToast()
const user = useCurrentUser()
const canManage = computed(() => !!user.value && canManageDomains(user.value))

const { data, status, refresh } = useAsyncData(
  () => `domain-rules-${props.domain.id}`,
  () => canManage.value ? fetchDomainRules(props.domain.id) : Promise.resolve({ rules: [], mailboxes: [] }),
  { watch: [canManage] },
)
const rules = computed(() => data.value?.rules ?? [])
const mailboxes = computed(() => data.value?.mailboxes ?? [])
const blockRules = computed(() => rules.value.filter(rule => rule.action === 'reject'))
const fallbackRules = computed(() => rules.value.filter(rule => rule.action !== 'reject'))

const dialogOpen = ref(false)
const editing = ref<DomainRule | null>(null)
const form = ref<DomainRuleInput>(emptyRuleInput(''))
const formError = ref<string | null>(null)
const saving = ref(false)

const actionItems = computed(() => Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label: t(label) })))
const fieldItems = computed(() => Object.entries(MATCH_FIELD_LABELS).map(([value, label]) => ({ value, label: t(label) })))
const operatorItems = computed(() => Object.entries(MATCH_OPERATOR_LABELS).map(([value, label]) => ({ value, label: t(label) })))
const mailboxItems = computed(() => mailboxes.value.map(mailbox => ({ value: mailbox.id, label: `${mailbox.localPart}@${props.domain.hostname}${mailbox.disabled ? t('routing.disabledSuffix') : ''}` })))

function openCreate() {
  editing.value = null
  formError.value = null
  form.value = emptyRuleInput(props.domain.id)
  dialogOpen.value = true
}

function openEdit(rule: DomainRule) {
  editing.value = rule
  formError.value = null
  form.value = ruleToInput(rule)
  dialogOpen.value = true
}

async function save() {
  saving.value = true
  formError.value = null
  try {
    const payload: DomainRuleInput = { ...form.value, domainId: props.domain.id }
    if (editing.value) await updateDomainRule(editing.value.id, payload)
    else await createDomainRule(payload)
    dialogOpen.value = false
    editing.value = null
    await refresh()
  } catch (error) {
    formError.value = validationMessage(error) ?? errorMessage(error, t('routing.requestFailed'))
  } finally {
    saving.value = false
  }
}

async function run(action: () => Promise<unknown>) {
  try {
    await action()
  } catch (error) {
    toast.add({ title: errorMessage(error, t('routing.requestFailed')), color: 'error' })
  }
  await refresh()
}
const remove = (id: string) => run(() => deleteDomainRule(id))
const toggle = (rule: DomainRule) => run(() => updateDomainRule(rule.id, { ...ruleToInput(rule), enabled: !rule.enabled }))
</script>

<template>
  <div v-if="canManage" class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <div class="flex items-center gap-2">
          <h2 class="text-xl font-semibold text-highlighted">
            {{ t('routing.title') }}
          </h2>
          <UTooltip :text="t('routing.about')">
            <UButton icon="i-lucide-info" color="neutral" variant="link" size="xs" :aria-label="t('routing.aboutLabel')" />
          </UTooltip>
        </div>
        <p class="mt-1 text-sm text-muted">
          {{ t('routing.rulesFor', { host: domain.hostname }) }}
        </p>
      </div>
      <UButton icon="i-lucide-plus" :label="t('routing.addRoute')" @click="openCreate" />
    </div>

    <div v-if="status === 'pending' && !data" class="grid gap-2">
      <USkeleton v-for="n in 2" :key="n" class="h-32 w-full rounded-lg" />
    </div>
    <div v-else class="space-y-2">
      <AdminEmailRoutingRuleSection
        :title="t('routing.blockRules')"
        :description="t('routing.blockRulesDescription')"
        :rules="blockRules"
        :hostname="domain.hostname"
        :mailboxes="mailboxes"
        @edit="openEdit"
        @delete="remove"
        @toggle="toggle"
      />
      <AdminEmailRoutingRuleSection
        :title="t('routing.catchAll')"
        :description="t('routing.catchAllDescription')"
        :rules="fallbackRules"
        :hostname="domain.hostname"
        :mailboxes="mailboxes"
        @edit="openEdit"
        @delete="remove"
        @toggle="toggle"
      />
    </div>

    <UModal v-model:open="dialogOpen" :title="editing ? t('routing.editRule') : t('routing.addRule')" :description="t('routing.dialogDescription')" :ui="{ content: 'sm:max-w-xl' }">
      <template #body>
        <form class="space-y-4" @submit.prevent="save">
          <div class="grid grid-cols-1 items-end gap-4 sm:grid-cols-2">
            <UFormField :label="t('common.name')">
              <UInput v-model="form.name" :placeholder="t('routing.optionalLabel')" class="w-full" />
            </UFormField>
            <UFormField :label="t('routing.action')">
              <USelect v-model="form.action" :items="actionItems" class="w-full" />
            </UFormField>
          </div>
          <div class="grid grid-cols-1 items-end gap-4 sm:grid-cols-2">
            <UFormField :label="t('routing.matchOn')">
              <USelect v-model="form.matchField" :items="fieldItems" class="w-full" />
            </UFormField>
            <UFormField :label="t('routing.condition')">
              <USelect v-model="form.matchOperator" :items="operatorItems" class="w-full" />
            </UFormField>
          </div>
          <div class="grid grid-cols-1 items-end gap-4 sm:grid-cols-2">
            <UFormField :label="t('routing.matchValue')">
              <template #hint>
                <UTooltip :text="t('routing.matchAllHint')">
                  <UIcon name="i-lucide-info" class="size-4 text-muted" />
                </UTooltip>
              </template>
              <UInput v-model="form.matchValue" required :placeholder="t('routing.matchAllPlaceholder')" class="w-full" />
            </UFormField>
            <UFormField :label="t('routing.priority')">
              <template #hint>
                <UTooltip :text="t('routing.priorityHint')">
                  <UIcon name="i-lucide-info" class="size-4 text-muted" />
                </UTooltip>
              </template>
              <UInputNumber v-model="form.priority" :min="0" :max="1000" class="w-full" />
            </UFormField>
          </div>

          <div v-if="form.action !== 'reject'" class="grid grid-cols-1 items-end gap-4" :class="{ 'sm:grid-cols-2': form.action === 'forward' }">
            <UFormField :label="form.action === 'forward' ? t('routing.keptCopyMailbox') : t('routing.destinationMailbox')">
              <USelect
                :model-value="form.mailboxId ?? undefined"
                :items="mailboxItems"
                :placeholder="t('routing.selectMailbox')"
                class="w-full"
                @update:model-value="value => form.mailboxId = (value as string) || null"
              />
            </UFormField>
            <UFormField v-if="form.action === 'forward'" :label="t('routing.forwardTo')">
              <UInput :model-value="form.forwardTo ?? ''" type="email" required class="w-full" @update:model-value="value => form.forwardTo = String(value)" />
            </UFormField>
          </div>

          <div v-if="form.action === 'forward'" class="flex items-center justify-between rounded-lg border border-default px-3 py-2">
            <div class="flex items-center gap-2">
              <p class="text-sm font-medium">
                {{ t('routing.keepCopy') }}
              </p>
              <UTooltip :text="t('routing.keepCopyHint')">
                <UIcon name="i-lucide-info" class="size-4 text-muted" />
              </UTooltip>
            </div>
            <USwitch v-model="form.keepCopy" :aria-label="t('routing.keepCopy')" />
          </div>

          <UFormField v-if="form.action === 'reject'" :label="t('routing.rejectReason')">
            <UInput :model-value="form.rejectReason ?? ''" :placeholder="t('routing.rejectPlaceholder')" class="w-full" @update:model-value="value => form.rejectReason = String(value)" />
          </UFormField>

          <p v-if="formError" role="alert" class="text-sm text-error">
            {{ formError }}
          </p>

          <div class="flex justify-end gap-2 border-t border-default pt-4">
            <UButton color="neutral" variant="outline" :label="t('common.cancel')" @click="dialogOpen = false" />
            <UButton type="submit" :loading="saving" :label="editing ? t('rules.saveChanges') : t('rules.create')" />
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>
