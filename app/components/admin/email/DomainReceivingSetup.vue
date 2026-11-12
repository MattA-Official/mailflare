<script setup lang="ts">
// Receiving providers for a domain. Ported from legacy/src/app/(admin)/domains/ReceivingSetupSection.tsx;
// the fork receives through Cloudflare Email Routing only, so Resend and SES are gone.
import type { Domain, ReceivingProvider } from '~/types/admin/email/domains'
import { errorMessage } from '~/utils/admin/email/domains'
import { useAdminConfirm } from '~/utils/admin/email/confirm'

const props = defineProps<{ domain: Domain, busy?: boolean, message?: string | null, cloudflareOk: boolean }>()
const emit = defineEmits<{ change: [ReceivingProvider] }>()
const { t } = useLanguage()
const { confirm } = useAdminConfirm()
const present = ref<boolean | null>(null)
const removing = ref(false)
const error = ref('')

async function loadPresence() {
  try {
    present.value = (await api<{ cloudflare?: boolean | null }>(`/api/domains/${props.domain.id}/receiving`)).cloudflare ?? null
  } catch {
    present.value = null
  }
}
watch(() => [props.domain.id, props.domain.receivingProvider], loadPresence, { immediate: true })

async function cleanUp() {
  const title = t('domains.opt.cfRouting')
  if (!(await confirm({ title: t('domains.cleanUp'), description: t('domains.removeReceivingConfirm', { title, host: props.domain.hostname }), color: 'error', confirmLabel: t('domains.cleanUp') }))) return
  removing.value = true
  error.value = ''
  try {
    await api(`/api/domains/${props.domain.id}/receiving`, { method: 'DELETE', body: { target: 'cloudflare' } })
    await loadPresence()
  } catch (err) {
    error.value = errorMessage(err, t('domains.removeConfigFailed'))
  } finally {
    removing.value = false
  }
}

const selected = computed(() => props.domain.receivingProvider === 'cloudflare')
</script>

<template>
  <section class="mt-6">
    <h2 class="text-base font-semibold text-highlighted">
      {{ t('domains.setupReceiving') }}
    </h2>
    <p class="mt-0.5 text-sm text-muted">
      {{ t('domains.setupReceivingDescription') }}
    </p>
    <ul class="mt-3 space-y-2">
      <AdminEmailDomainProviderCard
        :title="t('domains.opt.cfRouting')"
        :description="t('domains.opt.cfRoutingDesc')"
        :ok="selected ? cloudflareOk : null"
        :selected="selected"
        :disabled="busy"
        :cleanup="{ present: !!present, busy: removing, disabled: removing }"
        @toggle="on => emit('change', on ? 'cloudflare' : 'none')"
        @cleanup="cleanUp"
      >
        <slot />
      </AdminEmailDomainProviderCard>
    </ul>
    <p v-if="domain.receivingProvider === 'none'" class="mt-2 text-xs text-muted">
      {{ t('domains.noReceiving') }}
    </p>
    <p v-if="message" role="alert" class="mt-2 text-xs text-error">
      {{ message }}
    </p>
    <p v-if="error" role="alert" class="mt-2 text-xs text-error">
      {{ error }}
    </p>
  </section>
</template>
