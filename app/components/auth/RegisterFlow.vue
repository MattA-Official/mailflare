<script setup lang="ts">
// First-run registration: check the Worker's configuration and migrate the database, connect the
// primary domain, then create the first admin with its mailbox. Ported from
// legacy/src/app/(auth)/register/register-client.tsx.
import { checkExistingMx, getSetupStatus, prepareSetup, submitPrimaryDomain, submitRegistration } from '~/utils/auth/flows'
import type { DomainPreflight, DomainSetupResult, SetupRequirementCheck } from '~/types/auth/flows'

const { t } = useLanguage()

const hasAdminAccount = ref<boolean | null>(null)
const hasPrimaryDomain = ref<boolean | null>(null)
const primaryDomain = ref<string | null>(null)
const primaryDomainSendingRequested = ref<boolean | null>(null)
const setupDomain = ref<string | null>(null)
const domainInput = ref('')
const domainCheck = ref<DomainPreflight | null>(null)
const domainChecking = ref(false)
const enableSending = ref(false)
const setupEnableSending = ref(false)
const skipDns = ref(false)
const setupSkipDns = ref(false)
const step = ref<1 | 2 | 3>(1)
const checks = ref<SetupRequirementCheck[]>([])
const databaseMigrated = ref(false)
const preparationComplete = ref(false)
const error = ref<string | null>(null)
const mxChecking = ref(true)
const mxRecordsExist = ref<boolean | null>(null)
const replaceMxRecords = ref(false)
const mxCheckRevision = ref(0)
const loading = ref(false)
const account = reactive({ username: '', password: '', resetEmail: '', usePasskey: false, turnstileToken: '' })
const turnstile = useTemplateRef<{ reset: () => void }>('turnstile')

const accountDomain = computed(() => setupDomain.value ?? primaryDomain.value)
const showDomainStep = computed(() => hasPrimaryDomain.value === false && step.value === 2)
const normalizedDomain = computed(() => domainInput.value.toLowerCase().trim())

onMounted(runPreparation)

async function runPreparation() {
  loading.value = true
  error.value = null
  preparationComplete.value = false
  try {
    const preparation = await prepareSetup()
    checks.value = preparation.data.checks ?? []
    databaseMigrated.value = !!preparation.data.migrated
    if (!preparation.ok) {
      error.value = preparation.data.error ?? t('setup.completeConfig')
      return
    }
    const data = await getSetupStatus()
    hasAdminAccount.value = data.hasAdminAccount
    hasPrimaryDomain.value = data.hasPrimaryDomain
    primaryDomain.value = data.primaryDomain?.hostname ?? null
    primaryDomainSendingRequested.value = data.primaryDomain?.sendingRequested ?? null
    preparationComplete.value = true
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('setup.prepFailed')
  } finally {
    loading.value = false
  }
}

// Step 3 checks the zone for existing MX records, which first-run setup would replace.
watch([step, accountDomain, mxCheckRevision, setupSkipDns], (_, __, onCleanup) => {
  if (step.value !== 3 || !accountDomain.value) return
  replaceMxRecords.value = false
  error.value = null
  if (setupSkipDns.value) {
    // DNS is skipped, so there is nothing on the zone to check.
    mxChecking.value = false
    mxRecordsExist.value = false
    return
  }
  let active = true
  onCleanup(() => { active = false })
  mxChecking.value = true
  mxRecordsExist.value = null
  checkExistingMx(accountDomain.value)
    .then(({ ok, data }) => {
      if (!active) return
      mxChecking.value = false
      if (!ok || data.hasExistingMx === undefined) {
        error.value = typeof data.error === 'string' ? data.error : t('setup.mxCheckFailed')
        return
      }
      mxRecordsExist.value = data.hasExistingMx
    })
    .catch((cause: unknown) => {
      if (!active) return
      mxChecking.value = false
      error.value = cause instanceof Error ? cause.message : t('setup.mxCheckFailed')
    })
})

watch(normalizedDomain, (value) => {
  if (domainCheck.value?.hostname !== value) {
    domainCheck.value = null
    enableSending.value = false
  }
})

watch(skipDns, () => { error.value = null })

async function onDomainSubmit() {
  loading.value = true
  error.value = null
  const hostname = normalizedDomain.value
  if (skipDns.value) {
    loading.value = false
    setupDomain.value = hostname
    setupEnableSending.value = true
    setupSkipDns.value = true
    step.value = 3
    return
  }
  setupSkipDns.value = false
  const usedCachedCheck = domainCheck.value?.hostname === hostname
  const { ok, data }: { ok: boolean, data: DomainSetupResult } = usedCachedCheck
    ? { ok: true, data: { domain: domainCheck.value! } }
    : await submitPrimaryDomain(hostname).catch(() => ({ ok: false, data: {} }))
  loading.value = false
  if (!ok || !data.domain) {
    error.value = typeof data.error === 'string' ? data.error : t('setup.domainFailed')
    return
  }
  setupDomain.value = data.domain.hostname
  setupEnableSending.value = usedCachedCheck ? enableSending.value : false
  step.value = 3
}

async function onDomainBlur() {
  const hostname = normalizedDomain.value
  if (skipDns.value || hostname.length < 3 || domainCheck.value?.hostname === hostname) return
  domainChecking.value = true
  error.value = null
  const { ok, data } = await submitPrimaryDomain(hostname).catch(() => ({ ok: false, data: {} as DomainSetupResult }))
  domainChecking.value = false
  enableSending.value = false
  if (!ok || !data.domain) {
    domainCheck.value = null
    error.value = typeof data.error === 'string' ? data.error : t('setup.domainCheckFailed')
    return
  }
  domainCheck.value = data.domain
}

async function onSubmit() {
  loading.value = true
  error.value = null
  const domain = accountDomain.value
  if (!domain) {
    loading.value = false
    error.value = t('setup.domainIncomplete')
    return
  }
  const { ok, data } = await submitRegistration({
    domain,
    enableSending: setupDomain.value ? setupEnableSending.value : primaryDomainSendingRequested.value ?? undefined,
    replaceMxRecords: replaceMxRecords.value,
    skipDns: setupDomain.value ? setupSkipDns.value : undefined,
    username: account.username,
    password: account.password,
    usePasskey: account.usePasskey,
    resetEmail: account.resetEmail,
    turnstileToken: account.turnstileToken || undefined,
  }).catch(() => ({ ok: false, data: { error: t('setup.registrationFailed') } as { error?: string, code?: string, redirect?: string } }))
  loading.value = false
  if (!ok) {
    turnstile.value?.reset()
    if (data.code === 'MX_RECORDS_CONFLICT') {
      mxRecordsExist.value = true
      replaceMxRecords.value = false
      error.value = null
      return
    }
    error.value = data.code === 'passkey_unavailable'
      ? t('authError.passkeyUnavailable')
      : typeof data.error === 'string' ? data.error : t('setup.registrationFailed')
    return
  }
  window.location.assign(data.redirect ?? '/login')
}

const title = computed(() => {
  if (step.value === 1) return t('setup.prepareTitle')
  return showDomainStep.value ? t('setup.addDomainTitle') : t('setup.createMailboxTitle')
})
const steps = computed(() => [
  { label: t('setup.stepSystem'), active: step.value === 1 },
  { label: t('setup.stepDomain'), active: step.value === 2 },
  { label: t('setup.stepAccount'), active: step.value === 3 },
])
const sendingHint = computed(() => {
  if (domainChecking.value) return t('setup.checkingCloudflare')
  if (!domainCheck.value) return t('setup.enterDomain')
  return enableSending.value ? t('setup.requiredToSend') : t('setup.receiveOnly')
})
const submitDisabled = computed(() => mxChecking.value || mxRecordsExist.value === null || (mxRecordsExist.value && !replaceMxRecords.value) || hasAdminAccount.value === null || hasPrimaryDomain.value === null)
const switchUi = { root: 'flex-row-reverse justify-between gap-4 rounded-xl bg-elevated px-4 py-3' }
</script>

<template>
  <AuthShell v-if="hasAdminAccount === true" icon="i-lucide-mail-plus" :title="t('setup.closedTitle')">
    <div class="space-y-5">
      <p class="text-sm leading-6 text-muted">
        {{ t('setup.alreadyHasAccount', { domain: primaryDomain ?? t('setup.thisWorkspace') }) }}
      </p>
      <UButton block size="xl" to="/login" :label="t('setup.goToLogin')" />
    </div>
    <template #footer>
      <ULink to="/login" class="inline-flex items-center gap-2 text-primary hover:underline">
        {{ t('setup.signInInstead') }}
        <UIcon name="i-lucide-arrow-right" class="size-4" />
      </ULink>
    </template>
  </AuthShell>

  <AuthShell v-else icon="i-lucide-mail-plus" :title="title" :steps="steps">
    <div v-if="step === 1" class="space-y-5">
      <p class="text-sm leading-6 text-muted">{{ t('setup.prepareIntro') }}</p>
      <ul class="space-y-2">
        <li v-if="loading && checks.length === 0" class="flex items-center gap-3 rounded-xl bg-elevated px-4 py-3 text-sm text-muted">
          <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
          {{ t('setup.checking') }}
        </li>
        <li v-for="check in checks" :key="check.key" class="flex items-start gap-3 rounded-xl bg-elevated px-4 py-3">
          <UIcon :name="check.configured ? 'i-lucide-circle-check' : 'i-lucide-circle-x'" class="mt-0.5 size-4 shrink-0" :class="check.configured ? 'text-success' : 'text-error'" />
          <div>
            <p class="text-sm font-medium text-default">{{ check.key }}</p>
            <p v-if="!check.configured" class="mt-1 text-xs leading-5 text-muted">{{ check.message }}</p>
          </div>
        </li>
      </ul>
      <UAlert v-if="preparationComplete" color="success" variant="subtle" icon="i-lucide-circle-check" :title="databaseMigrated ? t('setup.migrated') : t('setup.schemaReady')" />
      <UAlert v-if="error" role="alert" color="error" variant="subtle" :title="error" />
      <UButton v-if="preparationComplete" block size="xl" :label="t('common.continue')" @click="step = hasPrimaryDomain ? 3 : 2" />
      <UButton v-else block size="xl" variant="outline" color="neutral" :disabled="loading" :label="loading ? t('setup.checkingShort') : t('setup.checkAgain')" @click="runPreparation" />
    </div>

    <form v-else-if="showDomainStep" method="post" class="space-y-5" @submit.prevent="onDomainSubmit">
      <UFormField :label="t('setup.primaryDomain')" name="domain" :help="t('setup.zoneHint')" required>
        <UInput v-model="domainInput" name="domain" placeholder="example.com" autocomplete="off" required size="xl" class="w-full" @blur="onDomainBlur" />
      </UFormField>
      <USwitch v-model="skipDns" :label="t('setup.skipDns')" :description="skipDns ? t('setup.skipDnsOn') : t('setup.skipDnsHint')" :ui="switchUi" />
      <USwitch v-if="!skipDns" v-model="enableSending" :disabled="domainChecking || !domainCheck" :label="t('setup.enableSending')" :description="sendingHint" :ui="switchUi" />
      <UAlert v-if="domainCheck && !skipDns" color="success" variant="subtle" icon="i-lucide-circle-check" :title="t('setup.domainFound', { zone: domainCheck.zone.name })" />
      <UAlert v-if="error" role="alert" color="error" variant="subtle" :title="error" />
      <UButton type="submit" block size="xl" :disabled="domainChecking" :loading="loading" :label="loading ? t('setup.addingDomain') : t('common.continue')" />
    </form>

    <form v-else method="post" class="space-y-5" @submit.prevent="onSubmit">
      <div v-if="mxChecking" class="flex items-center gap-3 rounded-xl bg-elevated px-4 py-3 text-sm text-muted">
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
        {{ t('setup.checkingMx') }}
      </div>
      <UAlert v-if="mxRecordsExist === false" color="success" variant="subtle" icon="i-lucide-circle-check" :title="t('setup.noMx')" />
      <UCheckbox
        v-if="mxRecordsExist === true"
        v-model="replaceMxRecords"
        :label="t('setup.replaceMx')"
        :description="t('setup.replaceMxHint')"
        class="rounded-xl bg-warning/10 px-4 py-4 ring ring-warning/30"
        :ui="{ label: 'text-warning', description: 'text-warning/90' }"
      />
      <UFormField :label="t('setup.username')" name="username" required>
        <UInput v-model="account.username" name="username" :placeholder="t('setup.usernamePlaceholder')" autocomplete="username" required size="xl" class="w-full" :ui="{ trailing: 'pe-3' }">
          <template #trailing>
            <span class="max-w-40 truncate text-sm font-medium text-muted">@{{ accountDomain ?? t('setup.domainFallback') }}</span>
          </template>
        </UInput>
      </UFormField>
      <UCheckbox
        v-model="account.usePasskey"
        name="usePasskey"
        :label="t('auth.usePasskeyInstead')"
        :description="t('auth.usePasskeyInsteadHint')"
        class="rounded-xl bg-elevated px-4 py-3"
      />
      <UFormField v-if="!account.usePasskey" :label="t('auth.password')" name="password" required>
        <UInput v-model="account.password" name="password" type="password" minlength="8" autocomplete="new-password" required size="xl" class="w-full" />
      </UFormField>
      <UFormField :label="t('setup.recoveryEmail')" name="resetEmail" required>
        <UInput v-model="account.resetEmail" name="resetEmail" type="email" autocomplete="email" placeholder="you@gmail.com" required size="xl" class="w-full" />
      </UFormField>
      <UAlert v-if="error" role="alert" color="error" variant="subtle" :title="error" />
      <UButton v-if="!mxChecking && mxRecordsExist === null" block size="xl" variant="outline" color="neutral" :label="t('setup.checkMxAgain')" @click="mxCheckRevision += 1" />
      <AuthTurnstile ref="turnstile" v-model="account.turnstileToken" />
      <UButton type="submit" block size="xl" class="mt-8" :disabled="submitDisabled" :loading="loading" :label="loading ? t('setup.creating') : t('setup.createAccount')" />
    </form>
  </AuthShell>
</template>
