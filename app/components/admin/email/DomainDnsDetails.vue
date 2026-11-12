<script setup lang="ts">
// The expanded part of a domain card: authentication records, receiving, sending and tracking.
// Ported from legacy/src/app/(admin)/domains/DomainDnsDetails.tsx.
import type { DnsAuthRecord, Domain, DomainDnsView, ReceivingProvider, SendingProvider } from '~/types/admin/email/domains'
import { dnsAuthDescriptions, getDnsAuthItemClass } from '~/utils/admin/email/domains'

const props = defineProps<{
  domain: Domain
  dns: DomainDnsView
  sendingBusy?: boolean
  sendingMessage?: string | null
  receivingBusy?: boolean
  receivingMessage?: string | null
  setupRecord?: DnsAuthRecord | null
  setupMessage?: string | null
}>()
const emit = defineEmits<{ setup: [DnsAuthRecord], sendingChange: [SendingProvider], receivingChange: [ReceivingProvider], dnsChanged: [] }>()
const { t } = useLanguage()

const manual = computed(() => props.domain.zoneId === 'manual' && !props.domain.dnsSkipped)
const sendingOk = computed(() => props.dns.sendingSubdomain ? props.dns.sendingEnabled : manual.value && props.domain.sendingEnabled)
const sendingLabel = computed(() => {
  const subdomain = props.dns.sendingSubdomain
  if (subdomain) return t('domains.sendingFor', { name: subdomain.name, state: props.dns.sendingEnabled ? t('domains.enabled') : t('domains.disabled') })
  if (manual.value) return props.domain.sendingEnabled ? t('domains.sendingConfigured') : t('domains.sendingNotConfigured')
  return t('domains.sendingNotSet')
})
const routingOk = computed(() => props.dns.routing.missing.length === 0 && (props.dns.routing.records.length > 0 || props.domain.routingEnabled))
const routingLabel = computed(() => {
  if (routingOk.value) return t('domains.routingConfigured')
  if (props.dns.routing.missing.length > 0) return t('domains.recordsMissing', { count: props.dns.routing.missing.length })
  return t('domains.noRoutingRecords')
})
const auditRecords: DnsAuthRecord[] = ['mx', 'spf', 'dmarc']
</script>

<template>
  <div class="pt-2">
    <section v-if="dns.audit">
      <h2 class="text-base font-semibold text-highlighted">
        {{ t('domains.setupTitle') }}
      </h2>
      <p class="mt-0.5 text-sm text-muted">
        {{ t('domains.setupDescription') }}
      </p>
      <ul class="mt-3 space-y-2">
        <AdminEmailDomainAuditRow
          v-for="record in auditRecords"
          :key="record"
          :check="dns.audit[record]"
          :description="t(dnsAuthDescriptions[record])"
          :row-class="getDnsAuthItemClass(dns.audit[record].status)"
          :manual="manual"
          :busy="setupRecord === record"
          @setup="emit('setup', record)"
        />
      </ul>
      <p v-if="manual" class="mt-2 text-xs text-muted">
        {{ t('domains.manualDnsNote') }}
      </p>
      <p v-if="setupMessage" role="alert" class="mt-2 text-xs text-error">
        {{ setupMessage }}
      </p>
    </section>

    <AdminEmailDomainReceivingSetup :domain="domain" :busy="receivingBusy" :message="receivingMessage" :cloudflare-ok="routingOk" @change="provider => emit('receivingChange', provider)">
      <AdminEmailDomainCloudflareReceiving :domain-id="domain.id" :routing-ok="routingOk" :routing-label="routingLabel" :manual="manual" @changed="emit('dnsChanged')" />
    </AdminEmailDomainReceivingSetup>

    <AdminEmailDomainSendingSetup :domain="domain" :busy="sendingBusy" :message="sendingMessage" :cloudflare-ok="!!sendingOk && dns.audit?.dkim.status === 'ok'" @change="provider => emit('sendingChange', provider)">
      <ul class="space-y-2">
        <AdminEmailDomainStatusRow :ok="!!sendingOk" :title="t('domains.emailSending')" :hint="t('domains.emailSendingHint')">
          {{ sendingLabel }}
        </AdminEmailDomainStatusRow>
        <AdminEmailDomainAuditRow
          v-if="dns.audit"
          :check="dns.audit.dkim"
          :description="t(dnsAuthDescriptions.dkim)"
          :row-class="getDnsAuthItemClass(dns.audit.dkim.status)"
          :manual="manual"
          :busy="setupRecord === 'dkim'"
          @setup="emit('setup', 'dkim')"
        />
      </ul>
    </AdminEmailDomainSendingSetup>

    <AdminEmailDomainTrackingHost v-if="domain.sendingProvider !== 'none'" :domain="domain" />
  </div>
</template>
