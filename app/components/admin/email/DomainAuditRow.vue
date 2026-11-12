<script setup lang="ts">
// One MX, SPF, DKIM or DMARC check with its Set up button (auditRow in upstream's DomainDnsDetails.tsx).
import type { DnsAuthCheck } from '~/types/admin/email/domains'

defineProps<{ check: DnsAuthCheck, description: string, rowClass: string, manual: boolean, busy: boolean }>()
const emit = defineEmits<{ setup: [] }>()
const { t } = useLanguage()
</script>

<template>
  <li class="grid gap-3 rounded-lg px-4 py-3 text-sm sm:grid-cols-[auto_minmax(8rem,14rem)_minmax(0,1fr)_auto] sm:items-start" :class="rowClass">
    <AdminEmailDomainStatusBadge :ok="check.status === 'ok'" :tone="check.status === 'missing' ? 'red' : 'neutral'" />
    <span class="min-w-0">
      <span class="block font-medium text-highlighted">{{ t('domains.recordLabel', { label: check.label }) }}</span>
      <span class="block text-xs text-muted">{{ description }}</span>
    </span>
    <span v-if="check.status === 'ok'" class="min-w-0 break-all text-muted">{{ check.found.length > 0 ? check.found.join(', ') : check.name }}</span>
    <span v-else class="sm:col-start-4">
      <UButton
        size="sm"
        color="neutral"
        variant="outline"
        :disabled="manual || busy"
        :title="manual ? t('domains.manualDns') : t('domains.createRecord', { label: check.label })"
        :label="busy ? t('domains.settingUp') : t('domains.setup')"
        @click="emit('setup')"
      />
    </span>
  </li>
</template>
