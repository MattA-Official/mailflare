<script setup lang="ts">
// An admin who is signed in before any domain exists: connect the primary domain, then create the
// first mailbox. Ported from legacy/src/app/(auth)/onboarding/onboarding-client.tsx.
import { checkDomain, createDomain, createMailbox, getDomains } from '~/utils/auth/flows'
import type { DomainPreflight } from '~/types/auth/flows'

const { t } = useLanguage()
const step = ref<1 | 2>(1)
const hostname = ref('')
const domainCheck = ref<DomainPreflight | null>(null)
const domainChecking = ref(false)
const enableSending = ref(false)
const skipDns = ref(false)
const domainId = ref('')
const localPart = ref('me')
const error = ref<string | null>(null)
const mxConflict = ref(false)
const loading = ref(false)

const normalized = computed(() => hostname.value.toLowerCase().trim())

onMounted(async () => {
  const primary = (await getDomains().catch(() => null))?.domains?.[0]
  if (!primary) return
  domainId.value = primary.id
  hostname.value = primary.hostname
  step.value = 2
})

watch(normalized, (value) => {
  if (domainCheck.value?.hostname !== value) {
    domainCheck.value = null
    enableSending.value = false
    mxConflict.value = false
  }
})

watch(skipDns, () => {
  mxConflict.value = false
  error.value = null
})

async function addDomain(replaceMxRecords = false) {
  loading.value = true
  error.value = null
  let checked = domainCheck.value
  let sendingRequested = enableSending.value
  if (skipDns.value) {
    checked = { hostname: normalized.value, zone: { id: 'manual', name: normalized.value } }
  } else if (checked?.hostname !== normalized.value) {
    const result = await checkDomain(normalized.value)
    if (!result.ok || !result.domain) {
      loading.value = false
      error.value = result.error ?? t('onboarding.domainCheckFailed')
      return
    }
    checked = result.domain
    sendingRequested = false
    domainCheck.value = result.domain
    enableSending.value = false
  }
  if (!checked) {
    loading.value = false
    error.value = t('onboarding.domainCheckFailed')
    return
  }

  const { ok, data } = await createDomain(checked.hostname, skipDns.value ? true : sendingRequested, replaceMxRecords, skipDns.value)
  loading.value = false
  if (!ok || !data.domain) {
    if (data.code === 'MX_RECORDS_CONFLICT') {
      mxConflict.value = true
      error.value = null
      return
    }
    error.value = data.error ?? t('onboarding.addDomainFailed')
    return
  }
  mxConflict.value = false
  domainId.value = data.domain.id
  step.value = 2
}

async function inspectDomain() {
  if (skipDns.value || normalized.value.length < 3 || domainCheck.value?.hostname === normalized.value) return
  domainChecking.value = true
  error.value = null
  mxConflict.value = false
  const result = await checkDomain(normalized.value)
  domainChecking.value = false
  if (!result.ok || !result.domain) {
    domainCheck.value = null
    enableSending.value = false
    error.value = result.error ?? t('onboarding.domainCheckFailed')
    return
  }
  domainCheck.value = result.domain
  enableSending.value = false
}

async function addMailbox() {
  loading.value = true
  error.value = null
  const { ok, data } = await createMailbox(domainId.value, localPart.value)
  loading.value = false
  if (!ok) {
    error.value = data.error ?? t('onboarding.createMailboxFailed')
    return
  }
  clearCurrentUserCache()
  await navigateTo('/inbox')
}

// The translation has a {token} placeholder for the CF_TOKEN code element.
const dnsNote = computed(() => t('onboarding.cloudflareDns', { token: '\u0001' }).split('\u0001'))
const sendingHint = computed(() => {
  if (domainChecking.value) return t('setup.checkingCloudflare')
  if (!domainCheck.value) return t('onboarding.leaveToVerify')
  return enableSending.value ? t('setup.requiredToSend') : t('setup.receiveOnly')
})
</script>

<template>
  <AuthShell
    icon="i-lucide-mail-plus"
    :title="step === 1 ? t('onboarding.connectTitle') : t('onboarding.firstMailboxTitle')"
    :description="step === 1 ? t('onboarding.connectDescription') : t('onboarding.mailboxDescription')"
    :steps="[
      { label: t('onboarding.stepDomain'), active: step === 1 },
      { label: t('onboarding.stepMailbox'), active: step === 2 },
    ]"
  >
    <div class="space-y-5">
      <form v-if="step === 1" class="space-y-5" @submit.prevent="mxConflict ? undefined : addDomain()">
        <p class="rounded-xl bg-primary/10 px-4 py-3 text-sm leading-6 text-default">
          <template v-for="(part, index) in dnsNote" :key="index">
            <code v-if="index > 0" class="text-xs font-semibold text-primary">CF_TOKEN</code>{{ part }}
          </template>
        </p>
        <UFormField :label="t('onboarding.domain')" name="domain">
          <UInput v-model="hostname" name="domain" placeholder="example.com" autocomplete="off" size="xl" class="w-full" @blur="inspectDomain" />
        </UFormField>
        <USwitch
          v-model="skipDns"
          :label="t('setup.skipDns')"
          :description="skipDns ? t('setup.skipDnsOn') : t('setup.skipDnsHint')"
          class="rounded-xl bg-elevated px-4 py-3"
          :ui="{ root: 'flex-row-reverse justify-between gap-4' }"
        />
        <div v-if="!skipDns" class="flex items-center justify-between gap-4 rounded-xl bg-elevated px-4 py-3">
          <USwitch v-if="!domainChecking" v-model="enableSending" :disabled="!domainCheck" :label="t('setup.enableSending')" :description="sendingHint" class="w-full" :ui="{ root: 'flex-row-reverse justify-between gap-4' }" />
          <template v-else>
            <div>
              <p class="text-sm font-medium text-default">{{ t('setup.enableSending') }}</p>
              <p class="text-sm text-muted">{{ sendingHint }}</p>
            </div>
            <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin text-muted" />
          </template>
        </div>
        <UAlert v-if="domainCheck && !skipDns" color="success" variant="subtle" icon="i-lucide-circle-check" :title="t('setup.domainFound', { zone: domainCheck.zone.name })" />
        <UAlert v-if="mxConflict" color="warning" variant="subtle" icon="i-lucide-triangle-alert" :title="t('onboarding.mxConflict')">
          <template #actions>
            <UButton block size="lg" color="warning" :loading="loading" :label="loading ? t('onboarding.replacingMx') : t('onboarding.deleteMxContinue')" @click="addDomain(true)" />
          </template>
        </UAlert>
        <UButton v-else type="submit" block size="xl" :disabled="!hostname || domainChecking" :loading="loading" :label="loading ? t('onboarding.adding') : t('onboarding.addDomain')" />
      </form>

      <form v-else class="space-y-5" @submit.prevent="addMailbox">
        <UFormField :label="t('onboarding.mailboxAddress')" name="localPart">
          <UInput v-model="localPart" name="localPart" size="xl" class="w-full" :ui="{ trailing: 'pe-3' }">
            <template #trailing>
              <span class="max-w-40 truncate text-sm font-medium text-muted">@{{ hostname }}</span>
            </template>
          </UInput>
        </UFormField>
        <UButton type="submit" block size="xl" :disabled="!localPart" :loading="loading" :label="loading ? t('setup.creating') : t('onboarding.goToInbox')" />
      </form>

      <UAlert v-if="error" role="alert" color="error" variant="subtle" :title="error" />
    </div>
    <template #footer>
      <span class="inline-flex items-center gap-2 text-muted">
        {{ t('onboarding.completesInInbox') }}
        <UIcon name="i-lucide-arrow-right" class="size-4" />
      </span>
    </template>
  </AuthShell>
</template>
