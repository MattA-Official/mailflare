<script setup lang="ts">
// One domain in the list: status badges, the DNS audit summary and, when expanded, the full setup.
// Ported from legacy/src/app/(admin)/domains/DomainItemCard.tsx; the DNS loading and provider
// changes that upstream kept on the page live here, one card being expanded at a time.
import type { DropdownMenuItem } from '@nuxt/ui'
import type { DnsAuthRecord, DnsStatusSummary, Domain, DomainDnsView, ReceivingProvider, SendingProvider, SetupResponse } from '~/types/admin/email/domains'
import { dnsAuthRecords, errorMessage, getDnsAuthStatusLabel, withMxReplacement } from '~/utils/admin/email/domains'
import { useAdminConfirm } from '~/utils/admin/email/confirm'

const props = defineProps<{ item: Domain, dns?: DnsStatusSummary, expanded: boolean, removing?: boolean }>()
const emit = defineEmits<{ toggle: [], changed: [], remove: [] }>()
const { t } = useLanguage()
const { confirm, confirmMxReplacement } = useAdminConfirm()

const view = ref<{ domain: Domain, dns: DomainDnsView } | null>(null)
const dnsLoading = ref(false)
const dnsError = ref<string | null>(null)
const setupRecord = ref<DnsAuthRecord | null>(null)
const setupMessage = ref<string | null>(null)
const sendingBusy = ref(false)
const sendingMessage = ref<string | null>(null)
const receivingBusy = ref(false)
const receivingMessage = ref<string | null>(null)
const faviconFailed = ref(false)

async function loadDns() {
  const json = await api<{ domain?: Domain, dns?: DomainDnsView }>(`/api/domains/${props.item.id}/dns`)
  if (!json.domain || !json.dns) throw new Error(t('domains.dnsLoadFailed'))
  view.value = { domain: json.domain, dns: json.dns }
  setupMessage.value = null
}

// Expand at once with a skeleton while the audit loads, and keep the loaded view for next time.
watch(() => props.expanded, async (expanded) => {
  setupMessage.value = null
  sendingMessage.value = null
  receivingMessage.value = null
  dnsError.value = null
  if (!expanded || view.value) return
  dnsLoading.value = true
  try {
    await loadDns()
  } catch (error) {
    dnsError.value = errorMessage(error, t('domains.dnsLoadFailed'))
  } finally {
    dnsLoading.value = false
  }
}, { immediate: true })

function refreshDns() {
  void loadDns().catch(() => undefined)
  emit('changed')
}

async function changeSendingProvider(provider: SendingProvider) {
  sendingBusy.value = true
  sendingMessage.value = null
  try {
    // Cloudflare sending refuses while another service's MX records exist.
    const json = await withMxReplacement(
      replaceMx => api<SetupResponse>(`/api/domains/${props.item.id}/sending`, { method: 'PUT', body: { provider, replaceMx } }),
      confirmMxReplacement,
    )
    if (json?.warning) sendingMessage.value = json.warning
    await loadDns()
    emit('changed')
  } catch (error) {
    sendingMessage.value = errorMessage(error, t('domains.sendingChangeFailed'))
  } finally {
    sendingBusy.value = false
  }
}

async function changeReceivingProvider(provider: ReceivingProvider) {
  receivingBusy.value = true
  receivingMessage.value = null
  try {
    await api(`/api/domains/${props.item.id}/receiving`, { method: 'PUT', body: { provider } })
    await loadDns()
    emit('changed')
  } catch (error) {
    receivingMessage.value = errorMessage(error, t('domains.receivingChangeFailed'))
  } finally {
    receivingBusy.value = false
  }
}

async function setupDns(record: DnsAuthRecord) {
  setupRecord.value = record
  setupMessage.value = null
  try {
    const json = await withMxReplacement(
      replaceMx => api<SetupResponse>(`/api/domains/${props.item.id}/dns/setup`, { method: 'POST', body: { record, replaceMx } }),
      confirmMxReplacement,
    )
    if (json?.domain && json.dns) view.value = { domain: json.domain, dns: json.dns }
    else if (json) await loadDns()
    emit('changed')
  } catch (error) {
    setupMessage.value = errorMessage(error, t('domains.dnsSetupFailed'))
  } finally {
    setupRecord.value = null
  }
}

async function confirmRemove() {
  // Removing a domain deletes its mailboxes (and all their mail) and disables Email Routing on
  // the zone, so the hostname must be typed.
  const ok = await confirm({
    title: t('domains.removeDomain'),
    description: t('domains.removeConfirm', { host: props.item.hostname }),
    requireText: props.item.hostname,
    confirmLabel: t('domains.removeDomain'),
    color: 'error',
  })
  if (ok) emit('remove')
}

const menu = computed<DropdownMenuItem[]>(() => [
  { label: t('domains.removeDomain'), icon: 'i-lucide-trash-2', color: 'error', disabled: props.removing, onSelect: confirmRemove },
])

const statusLabel = computed(() => props.item.status === 'active' ? t('dns.status.active') : props.item.status === 'pending' ? t('dns.status.pending') : props.item.status)
</script>

<template>
  <li class="relative flex flex-col gap-3 px-4 py-4 sm:px-5">
    <div class="flex flex-col items-start gap-3 md:flex-row md:gap-4">
      <span class="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-elevated text-muted">
        <UIcon name="i-lucide-globe" class="size-5" />
        <img v-if="!faviconFailed" :src="`https://${item.hostname}/favicon.ico`" alt="" class="absolute inset-0 size-full bg-elevated object-contain p-1" @error="faviconFailed = true">
      </span>

      <div class="flex w-full min-w-0 flex-1 flex-col gap-2">
        <span class="min-w-0 truncate pr-10 text-sm font-semibold text-highlighted">{{ item.hostname }}</span>

        <div class="flex flex-wrap gap-2">
          <UBadge :color="item.status === 'active' ? 'success' : 'neutral'" variant="subtle" :icon="item.status === 'active' ? 'i-lucide-check' : 'i-lucide-triangle-alert'" :label="statusLabel" />
          <UBadge
            v-if="item.receivingProvider === 'cloudflare'"
            color="neutral"
            :variant="item.routingEnabled ? 'outline' : 'soft'"
            :class="{ 'opacity-50': !item.routingEnabled }"
            :icon="item.routingEnabled ? 'i-lucide-check' : 'i-lucide-triangle-alert'"
            :label="t('domains.badge.routing')"
          />
          <UBadge v-else color="neutral" variant="soft" class="opacity-50" :label="t('domains.badge.sendingOnly')" />
          <UBadge v-if="item.sendingProvider === 'none'" color="neutral" variant="soft" class="opacity-50" :label="t('domains.badge.receivingOnly')" />
          <UBadge
            v-else
            color="neutral"
            :variant="item.sendingEnabled ? 'outline' : 'soft'"
            :class="{ 'opacity-50': !item.sendingEnabled }"
            :icon="item.sendingEnabled ? 'i-lucide-check' : 'i-lucide-triangle-alert'"
            :label="t('domains.badge.sending')"
          />
        </div>

        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <template v-if="dns?.auth">
            <template v-for="(record, index) in dnsAuthRecords" :key="record">
              <span v-if="index > 0" class="text-dimmed">|</span>
              <span class="flex items-center gap-1 text-muted" :title="`${record.toUpperCase()} · ${getDnsAuthStatusLabel(dns.auth[record], t)}`">
                <span class="uppercase">{{ record }}</span>
                <UIcon :name="dns.auth[record] === 'ok' ? 'i-lucide-check' : 'i-lucide-triangle-alert'" class="size-3.5" :class="dns.auth[record] === 'ok' ? 'text-success' : 'text-warning'" />
              </span>
            </template>
          </template>
          <span class="flex-1" />
          <UButton
            variant="link"
            size="xs"
            class="px-0"
            :label="expanded ? t('domains.hideDetails') : t('domains.showDetails')"
            :trailing-icon="expanded ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
            @click="emit('toggle')"
          />
        </div>
      </div>
    </div>

    <template v-if="expanded">
      <AdminEmailDomainDnsDetails
        v-if="view"
        :domain="view.domain"
        :dns="view.dns"
        :sending-busy="sendingBusy"
        :sending-message="sendingMessage"
        :receiving-busy="receivingBusy"
        :receiving-message="receivingMessage"
        :setup-record="setupRecord"
        :setup-message="setupMessage"
        @setup="setupDns"
        @sending-change="changeSendingProvider"
        @receiving-change="changeReceivingProvider"
        @dns-changed="refreshDns"
      />
      <p v-else-if="dnsError" class="pt-2 text-sm text-error">
        {{ dnsError }}
      </p>
      <div v-else-if="dnsLoading" class="space-y-3 pt-2">
        <USkeleton class="h-4 w-28" />
        <USkeleton class="h-3 w-96 max-w-full" />
        <USkeleton v-for="n in 4" :key="n" class="h-16 w-full rounded-lg" />
      </div>
    </template>

    <UDropdownMenu :items="menu" :content="{ align: 'end' }">
      <UButton
        icon="i-lucide-ellipsis-vertical"
        color="neutral"
        variant="ghost"
        size="sm"
        class="absolute right-4 top-4"
        :disabled="removing"
        :aria-label="t('domains.actionsFor', { host: item.hostname })"
      />
    </UDropdownMenu>
  </li>
</template>
