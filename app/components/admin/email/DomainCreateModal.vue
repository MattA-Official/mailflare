<script setup lang="ts">
// "Add domain" dialog. Ported from the dialog in legacy/src/app/(admin)/domains/page.tsx, with
// Resend and SES dropped from the provider choices.
import type { DomainPreflight, ReceivingProvider, SendingProvider } from '~/types/admin/email/domains'
import { checkDomain, createDomain, errorMessage, isMxConflictError } from '~/utils/admin/email/domains'
import { useAdminConfirm } from '~/utils/admin/email/confirm'

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ created: [] }>()
const { t } = useLanguage()
const { confirmMxReplacement } = useAdminConfirm()

const hostname = ref('')
const domainCheck = ref<DomainPreflight | null>(null)
const domainChecking = ref(false)
const domainCheckError = ref<string | null>(null)
const skipDns = ref(false)
const sendingProvider = ref<SendingProvider>('cloudflare')
const receivingProvider = ref<ReceivingProvider>('cloudflare')
const pending = ref(false)
const createError = ref<unknown>(null)

const normalized = computed(() => hostname.value.toLowerCase().trim())
watch(normalized, (value) => {
  if (domainCheck.value?.hostname !== value) domainCheck.value = null
})
watch(skipDns, () => {
  domainCheckError.value = null
})

const receivingItems = computed(() => [
  { label: t('domains.cloudflareRouting'), value: 'cloudflare' },
  { label: t('domains.notSelected'), value: 'none' },
])
const sendingItems = computed(() => [
  { label: t('domains.cloudflareSending'), value: 'cloudflare' },
  { label: t('domains.notSelected'), value: 'none' },
])

async function inspectDomain() {
  const value = normalized.value
  if (skipDns.value || value.length < 3 || domainCheck.value?.hostname === value) return
  domainChecking.value = true
  domainCheckError.value = null
  const result = await checkDomain(value).catch(error => ({ ok: false, error: errorMessage(error, t('onboarding.domainCheckFailed')), domain: undefined }))
  domainChecking.value = false
  if (!result.ok || !result.domain) {
    domainCheck.value = null
    domainCheckError.value = result.error ?? t('onboarding.domainCheckFailed')
    return
  }
  domainCheck.value = result.domain
}

function reset() {
  hostname.value = ''
  domainCheck.value = null
  skipDns.value = false
  sendingProvider.value = 'cloudflare'
  receivingProvider.value = 'cloudflare'
  domainCheckError.value = null
  createError.value = null
}

async function submit() {
  pending.value = true
  createError.value = null
  try {
    let checked = domainCheck.value
    if (skipDns.value) {
      checked = { hostname: normalized.value, zone: { id: 'manual', name: normalized.value } }
    } else if (checked?.hostname !== normalized.value) {
      const result = await checkDomain(normalized.value)
      if (!result.ok || !result.domain) throw new Error(result.error ?? t('onboarding.domainCheckFailed'))
      checked = result.domain
      domainCheck.value = result.domain
    }
    if (!checked) throw new Error(t('onboarding.domainCheckFailed'))
    const created = await createDomain({
      hostname: checked.hostname,
      enableRouting: true,
      skipDns: skipDns.value,
      sendingProvider: sendingProvider.value,
      receivingProvider: receivingProvider.value,
    }, confirmMxReplacement)
    if (!created) return
    reset()
    open.value = false
    emit('created')
  } catch (error) {
    createError.value = error
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="t('domains.addTitle')" :description="t('domains.addDescription')" :ui="{ content: 'max-h-[calc(100dvh-4rem)]' }">
    <UButton icon="i-lucide-plus" :label="t('domains.new')" />
    <template #body>
      <form class="space-y-4" @submit.prevent="submit">
        <UFormField :label="t('domains.hostname')" name="hostname">
          <UInput v-model="hostname" placeholder="example.com" class="w-full" autocomplete="off" spellcheck="false" @blur="inspectDomain" />
        </UFormField>

        <div class="flex items-center justify-between gap-4 rounded-lg bg-elevated/60 px-4 py-3">
          <div>
            <label for="skip-dns" class="text-sm font-medium text-highlighted">{{ t('setup.skipDns') }}</label>
            <p class="mt-1 text-xs leading-5 text-muted">
              {{ skipDns ? t('setup.skipDnsOn') : t('setup.skipDnsHint') }}
            </p>
          </div>
          <USwitch id="skip-dns" v-model="skipDns" />
        </div>

        <template v-if="!skipDns">
          <div class="flex items-center justify-between gap-4 rounded-lg bg-elevated/60 px-4 py-3">
            <div>
              <label for="receiving-provider" class="text-sm font-medium text-highlighted">{{ t('domains.receiveWith') }}</label>
              <p class="mt-1 text-xs leading-5 text-muted">
                {{ receivingProvider === 'cloudflare' ? t('domains.receiveHintCloudflare') : t('domains.receiveHintNone') }}
              </p>
            </div>
            <USelect id="receiving-provider" v-model="receivingProvider" :items="receivingItems" class="w-56 shrink-0" />
          </div>
          <div class="flex items-center justify-between gap-4 rounded-lg bg-elevated/60 px-4 py-3">
            <div>
              <label for="sending-provider" class="text-sm font-medium text-highlighted">{{ t('domains.sendWith') }}</label>
              <p class="mt-1 text-xs leading-5 text-muted">
                {{ domainChecking ? t('setup.checkingCloudflare') : sendingProvider === 'cloudflare' ? t('domains.sendHintCloudflare') : t('domains.sendHintNone') }}
              </p>
            </div>
            <UIcon v-if="domainChecking" name="i-lucide-loader-circle" class="size-4 shrink-0 animate-spin text-muted" />
            <USelect id="sending-provider" v-model="sendingProvider" :items="sendingItems" class="w-56 shrink-0" />
          </div>
        </template>

        <UAlert v-if="domainCheck && !skipDns" color="success" variant="subtle" icon="i-lucide-circle-check" :title="t('setup.domainFound', { zone: domainCheck.zone.name })" />
        <UAlert v-if="domainCheckError" color="error" variant="subtle" :title="domainCheckError" />
        <UAlert v-if="createError" color="error" variant="subtle" :title="errorMessage(createError, t('mailboxes.failed'))">
          <template v-if="!isMxConflictError(createError)" #description>
            <p class="font-medium">
              {{ t('domains.tokenPermissions') }}
            </p>
            <ul class="mt-1 list-disc space-y-1 pl-5">
              <li>{{ t('domains.tokenAccounts') }}</li>
              <li>{{ t('domains.tokenZones') }}</li>
            </ul>
          </template>
        </UAlert>

        <UButton type="submit" :disabled="!hostname || domainChecking || pending" :loading="pending" :label="pending ? t('onboarding.adding') : t('domains.addTitle')" />
      </form>
    </template>
  </UModal>
</template>
