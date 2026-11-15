<script setup lang="ts">
// Sending providers for a domain. Ported from legacy/src/app/(admin)/domains/SendingSetupSection.tsx;
// the fork sends through Cloudflare Email Sending only, so Resend and SES are gone.
import type { Domain, SendingProvider } from '~/types/admin/email/domains'
import { errorMessage } from '~/utils/admin/email/domains'
import { useAdminConfirm } from '~/utils/admin/email/confirm'

const props = defineProps<{ domain: Domain, busy?: boolean, message?: string | null, cloudflareOk: boolean }>()
const emit = defineEmits<{ change: [SendingProvider] }>()
const { t } = useLanguage()
const { confirm } = useAdminConfirm()
const removing = ref(false)
const error = ref('')

// Whether Cloudflare still has this domain set up; null when it cannot be checked.
const { data: presence, refresh: loadPresence } = useAsyncData(
  () => `domain-sending-presence:${props.domain.id}`,
  () => api<{ cloudflare?: boolean | null }>(`/api/domains/${props.domain.id}/sending`).then(json => json.cloudflare ?? null).catch(() => null),
  { watch: [() => props.domain.sendingProvider] },
)
const present = computed(() => presence.value ?? null)

async function cleanUp() {
  const title = t('domains.opt.cfEmail')
  if (!(await confirm({ title: t('domains.cleanUp'), description: t('domains.removeSendingConfirm', { title, host: props.domain.hostname }), color: 'error', confirmLabel: t('domains.cleanUp') }))) return
  removing.value = true
  error.value = ''
  try {
    await api(`/api/domains/${props.domain.id}/sending`, { method: 'DELETE', body: { target: 'cloudflare' } })
    await loadPresence()
  } catch (err) {
    error.value = errorMessage(err, t('domains.removeConfigFailed'))
  } finally {
    removing.value = false
  }
}

const selected = computed(() => props.domain.sendingProvider === 'cloudflare')
</script>

<template>
  <section class="mt-6">
    <h2 class="text-base font-semibold text-highlighted">
      {{ t('domains.setupSending') }}
    </h2>
    <p class="mt-0.5 text-sm text-muted">
      {{ domain.sendingProvider === 'none' ? t('domains.sendingNone') : t('domains.sendingChoose') }}
    </p>
    <ul class="mt-3 space-y-2">
      <AdminEmailDomainProviderCard
        :title="t('domains.opt.cfEmail')"
        :description="t('domains.opt.cfSendDesc')"
        :ok="selected || present ? cloudflareOk : null"
        :selected="selected"
        :disabled="busy"
        :cleanup="{ present: !!present, busy: removing, disabled: removing }"
        @toggle="on => emit('change', on ? 'cloudflare' : 'none')"
        @cleanup="cleanUp"
      >
        <slot />
      </AdminEmailDomainProviderCard>
    </ul>
    <p v-if="message" role="alert" class="mt-2 text-xs text-error">
      {{ message }}
    </p>
    <p v-if="error" role="alert" class="mt-2 text-xs text-error">
      {{ error }}
    </p>
  </section>
</template>
