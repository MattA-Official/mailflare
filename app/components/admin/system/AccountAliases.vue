<script setup lang="ts">
// Ported from legacy/src/app/(admin)/accounts/account-aliases.tsx.
import type { AccountAliasDraft, AccountDomain } from '~/types/admin/system/accounts'

const props = defineProps<{ domains: AccountDomain[], domainId: string, username: string }>()
const useAllDomains = defineModel<boolean>('useAllDomains', { required: true })
const aliases = defineModel<AccountAliasDraft[]>('aliases', { required: true })
const { t } = useLanguage()

const availableDomains = computed(() => props.domains.filter(domain => domain.status === 'active'))
const domainItems = computed(() => availableDomains.value.map(domain => ({ label: domain.hostname, value: domain.id })))

function update(id: string, changes: Partial<AccountAliasDraft>) {
  aliases.value = aliases.value.map(item => item.id === id ? { ...item, ...changes } : item)
}

function add() {
  const domain = availableDomains.value.find(item => item.id !== props.domainId) ?? availableDomains.value[0]
  if (!domain) return
  aliases.value = [...aliases.value, { id: crypto.randomUUID(), localPart: props.username.trim(), domainId: domain.id }]
}
</script>

<template>
  <div class="space-y-4 border-t border-default pt-4">
    <UCheckbox v-model="useAllDomains" :label="t('aliases.useAll')" :description="t('aliases.useAllHint')" class="rounded-lg bg-elevated p-4" />
    <div class="space-y-3">
      <div>
        <p class="text-sm font-medium">
          {{ t('aliases.additional') }} <span class="font-normal text-muted">{{ t('aliases.optional') }}</span>
        </p>
        <p class="mt-1 text-sm text-muted">
          {{ t('aliases.hint') }}
        </p>
      </div>
      <div v-for="(alias, index) in aliases" :key="alias.id" class="flex items-center gap-2">
        <UFieldGroup class="min-w-0 flex-1">
          <UInput
            :model-value="alias.localPart"
            :aria-label="t('aliases.usernameLabel', { n: index + 1 })"
            :placeholder="t('accounts.username')"
            pattern="[a-zA-Z0-9._%+\-]+"
            :maxlength="64"
            required
            class="min-w-0 flex-1"
            @update:model-value="value => update(alias.id, { localPart: String(value) })"
          />
          <UBadge color="neutral" variant="outline" size="lg" label="@" />
          <USelect
            :model-value="alias.domainId"
            :items="domainItems"
            :aria-label="t('aliases.domainLabel', { n: index + 1 })"
            class="min-w-0 flex-1"
            @update:model-value="value => update(alias.id, { domainId: String(value) })"
          />
        </UFieldGroup>
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-trash-2"
          :aria-label="t('aliases.remove', { n: index + 1 })"
          @click="aliases = aliases.filter(item => item.id !== alias.id)"
        />
      </div>
      <UButton color="neutral" variant="outline" icon="i-lucide-plus" :label="t('aliases.add')" :disabled="!availableDomains.length" @click="add" />
    </div>
  </div>
</template>
