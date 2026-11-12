<script setup lang="ts">
// One group of domain routing rules (RuleSection in upstream's domain-routing.tsx).
import type { DomainRule, DomainRuleMailbox } from '~/types/admin/email/routing'
import { ACTION_ICONS, describeRule, formatLastMatched } from '~/utils/admin/email/routing'

defineProps<{ title: string, description: string, rules: DomainRule[], hostname: string, mailboxes: DomainRuleMailbox[] }>()
const emit = defineEmits<{ edit: [DomainRule], delete: [string], toggle: [DomainRule] }>()
const { t } = useLanguage()
</script>

<template>
  <UCard :ui="{ header: 'py-3 sm:px-6', body: 'space-y-2 sm:px-6' }">
    <template #header>
      <div class="flex items-center gap-2">
        <h3 class="text-xs font-semibold uppercase text-highlighted">
          {{ title }}
        </h3>
        <UTooltip :text="description">
          <UIcon name="i-lucide-info" class="size-4 text-muted" :aria-label="description" />
        </UTooltip>
      </div>
    </template>
    <p v-if="rules.length === 0" class="text-sm text-muted">
      {{ t('routing.noRules') }}
    </p>
    <div v-for="rule in rules" :key="rule.id" class="flex flex-wrap items-center gap-3 rounded-lg border border-default px-3 py-2">
      <UIcon :name="ACTION_ICONS[rule.action]" class="size-4 shrink-0 text-muted" />
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <p class="truncate text-sm font-medium">
            {{ rule.name || describeRule(rule, mailboxes, hostname, t) }}
          </p>
          <UBadge v-if="!rule.enabled" color="neutral" variant="soft" :label="t('routing.disabled')" />
        </div>
        <p v-if="rule.name" class="truncate text-xs text-muted">
          {{ describeRule(rule, mailboxes, hostname, t) }}
        </p>
        <p class="text-xs text-muted">
          {{ t('routing.stats', { priority: rule.priority, count: rule.matchCount, last: formatLastMatched(rule.lastMatchedAt, t) }) }}
        </p>
      </div>
      <USwitch :model-value="rule.enabled" :aria-label="`${t('routing.enableRule')}: ${rule.name || describeRule(rule, mailboxes, hostname, t)}`" @update:model-value="emit('toggle', rule)" />
      <UButton icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" :aria-label="`${t('routing.editRule')}: ${rule.name || describeRule(rule, mailboxes, hostname, t)}`" @click="emit('edit', rule)" />
      <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" :aria-label="`${t('rules.delete')}: ${rule.name || describeRule(rule, mailboxes, hostname, t)}`" @click="emit('delete', rule.id)" />
    </div>
  </UCard>
</template>
