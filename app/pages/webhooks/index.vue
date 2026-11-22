<script setup lang="ts">
// Webhooks admin. Ported from legacy/src/app/(admin)/webhooks/page.tsx.
import type { Webhook, WebhookEvent } from '~/types/admin/email/webhooks'
import { errorMessage } from '~/utils/admin/email/domains'
import { confirmDestructive } from '~/utils/confirm-dialog'
import { useAdminConfirm } from '~/utils/admin/email/confirm'
import { needsStepUp, useSecurityStatus } from '~/utils/settings/account/security-status'
import { WEBHOOK_EVENTS, createWebhook, deleteWebhook, fetchWebhooks, testWebhook, updateWebhook } from '~/utils/admin/email/webhooks'

definePageMeta({ layout: 'dashboard', nav: 'admin', auth: { role: 'admin', primary: true, requireMailbox: true } })
const { t } = useLanguage()
const toast = useToast()
const { confirm } = useAdminConfirm()

const { data: webhooks, status, refresh } = useAsyncData('admin-webhooks', fetchWebhooks)

const dialogOpen = ref(false)
const url = ref('')
const description = ref('')
const maxAttempts = ref(5)
const events = ref<WebhookEvent[]>(WEBHOOK_EVENTS.map(event => event.value))
const secret = ref<string | null>(null)
const error = ref<string | null>(null)
const expanded = ref<string | null>(null)
const testResult = ref<Record<string, string>>({})
const creating = ref(false)
const busy = ref<string | null>(null)
const confirming = ref(false)
const { status: securityStatus } = useSecurityStatus()

const secretHint = computed(() => t('webhooks.secretHint', { header: '\u0001' }).split('\u0001'))

function openDialog() {
  error.value = null
  dialogOpen.value = true
}

const eventItems = computed(() => WEBHOOK_EVENTS.map(event => ({ value: event.value, label: t(event.labelKey), description: t(event.hintKey) })))

async function create(stepUpToken?: string) {
  creating.value = true
  error.value = null
  try {
    const result = await createWebhook({ url: url.value, description: description.value || undefined, events: events.value, maxAttempts: maxAttempts.value, ...(stepUpToken ? { stepUpToken } : {}) })
    confirming.value = false
    secret.value = result.secret
    url.value = ''
    description.value = ''
    dialogOpen.value = false
    await refresh()
  } catch (err) {
    // Sending message content to an outside URL asks the user to confirm it is them, then retries.
    if (needsStepUp(err)) confirming.value = true
    else error.value = errorMessage(err, t('domains.requestFailed'))
  } finally {
    creating.value = false
  }
}

// Switching a disabled webhook back on needs the same proof as creating one.
const enabling = ref<Webhook | null>(null)
const enablingOpen = computed({
  get: () => !!enabling.value,
  set: (open: boolean) => {
    if (!open) enabling.value = null
  },
})
async function toggle(hook: Webhook, stepUpToken?: string) {
  try {
    await updateWebhook(hook.id, { enabled: !hook.enabled, ...(stepUpToken ? { stepUpToken } : {}) })
    enabling.value = null
  } catch (err) {
    if (needsStepUp(err)) enabling.value = hook
    else toast.add({ title: errorMessage(err, t('domains.requestFailed')), color: 'error' })
  }
  await refresh()
}

async function rotate(id: string) {
  if (!(await confirm({ title: t('webhooks.rotate'), description: t('webhooks.rotateConfirm'), color: 'warning', confirmLabel: t('webhooks.rotate') }))) return
  busy.value = `rotate:${id}`
  try {
    secret.value = (await updateWebhook(id, { rotateSecret: true })).secret ?? null
    error.value = null
  } catch (err) {
    error.value = errorMessage(err, t('domains.requestFailed'))
  } finally {
    busy.value = null
  }
}

async function remove(id: string) {
  if (!(await confirmDestructive(t('webhooks.deleteConfirm')))) return
  try {
    await deleteWebhook(id)
  } catch (err) {
    toast.add({ title: errorMessage(err, t('domains.requestFailed')), color: 'error' })
  }
  await refresh()
}

async function runTest(id: string) {
  busy.value = `test:${id}`
  try {
    testResult.value = { ...testResult.value, [id]: (await testWebhook(id)).status }
    await refresh()
  } catch (err) {
    testResult.value = { ...testResult.value, [id]: errorMessage(err, t('domains.requestFailed')) }
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <AppPage id="webhooks" :title="t('webhooks.title')" :description="t('webhooks.description')">
    <template #actions>
      <UButton icon="i-lucide-plus" :label="t('webhooks.add')" @click="openDialog" />
    </template>

    <UCard v-if="secret">
      <p class="text-sm font-medium">
        {{ t('webhooks.secretTitle') }}
      </p>
      <p class="mt-1 text-sm text-muted">
        {{ secretHint[0] }}<code>X-Email-Platform-Signature</code>{{ secretHint[1] }}
      </p>
      <code class="mt-2 block break-all rounded-md bg-elevated p-2 text-xs">{{ secret }}</code>
      <UButton color="neutral" variant="outline" size="sm" class="mt-3" :label="t('webhooks.dismiss')" @click="secret = null" />
    </UCard>
    <UAlert v-if="error && !dialogOpen" role="alert" color="error" variant="subtle" :title="error" />

    <div v-if="status === 'pending' && !webhooks" class="space-y-2">
      <USkeleton v-for="n in 2" :key="n" class="h-40 w-full rounded-lg" />
    </div>
    <UCard v-else-if="!webhooks?.length" :ui="{ body: 'text-sm text-muted' }">
      {{ t('webhooks.none') }}
    </UCard>
    <section v-else class="divide-y divide-default overflow-hidden rounded-lg border border-default bg-default">
      <div v-for="hook in webhooks" :key="hook.id" class="px-5 py-6 sm:px-6">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="min-w-0 flex-1">
            <h2 class="truncate text-base font-semibold text-highlighted">
              {{ hook.url }}
            </h2>
            <p v-if="hook.description" class="mt-1 text-sm text-muted">
              {{ hook.description }}
            </p>
            <div class="mt-3 flex flex-wrap gap-1.5">
              <UBadge v-for="event in hook.events" :key="event" color="neutral" variant="soft" :label="event" />
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs font-medium text-toned">{{ hook.enabled ? t('webhooks.enabled') : t('webhooks.disabled') }}</span>
            <USwitch :model-value="hook.enabled" :aria-label="t(hook.enabled ? 'webhooks.toggleLabel.disable' : 'webhooks.toggleLabel.enable', { url: hook.url })" @update:model-value="toggle(hook)" />
          </div>
        </div>
        <div class="mt-5 grid grid-cols-2 overflow-hidden rounded-lg bg-elevated/60 sm:grid-cols-5">
          <div class="px-4 py-3">
            <span class="block text-lg font-semibold text-highlighted">{{ hook.stats.total }}</span>
            <span class="block text-xs text-muted">{{ t('webhooks.stat.deliveries') }}</span>
          </div>
          <div class="px-4 py-3">
            <span class="block text-lg font-semibold" :class="hook.stats.delivered ? 'text-success' : 'text-muted'">{{ hook.stats.delivered }}</span>
            <span class="block text-xs text-muted">{{ t('webhooks.stat.delivered') }}</span>
          </div>
          <div class="px-4 py-3">
            <span class="block text-lg font-semibold" :class="hook.stats.pending ? 'text-warning' : 'text-muted'">{{ hook.stats.pending }}</span>
            <span class="block text-xs text-muted">{{ t('webhooks.stat.inFlight') }}</span>
          </div>
          <div class="px-4 py-3">
            <span class="block text-lg font-semibold" :class="hook.stats.failing ? 'text-error' : 'text-muted'">{{ hook.stats.failing }}</span>
            <span class="block text-xs text-muted">{{ t('webhooks.stat.failed') }}</span>
          </div>
          <div class="px-4 py-3">
            <span class="block text-lg font-semibold text-muted">{{ hook.maxAttempts }}</span>
            <span class="block text-xs text-muted">{{ t('webhooks.stat.maxAttempts') }}</span>
          </div>
        </div>

        <div class="mt-4 flex flex-wrap items-center gap-3">
          <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-activity" :label="expanded === hook.id ? t('webhooks.hideHistory') : t('webhooks.history')" @click="expanded = expanded === hook.id ? null : hook.id" />
          <div class="ml-auto flex flex-wrap items-center gap-2">
            <p v-if="testResult[hook.id]" class="mr-1 text-sm text-toned">
              {{ t('webhooks.testDelivery', { result: testResult[hook.id]! }) }}
            </p>
            <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-send" :disabled="busy === `test:${hook.id}`" :label="t('webhooks.test')" @click="runTest(hook.id)" />
            <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-refresh-cw" :disabled="busy === `rotate:${hook.id}`" :label="t('webhooks.rotate')" @click="rotate(hook.id)" />
            <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-trash-2" :aria-label="t('webhooks.deleteLabel', { url: hook.url })" :label="t('common.delete')" @click="remove(hook.id)" />
          </div>
        </div>

        <div v-if="expanded === hook.id" class="mt-4">
          <AdminEmailWebhookDeliveries :webhook-id="hook.id" @changed="refresh()" />
        </div>
      </div>
    </section>

    <UModal v-model:open="dialogOpen" :title="t('webhooks.add')" :description="t('webhooks.addDescription')">
      <template #body>
        <form class="space-y-4" @submit.prevent="create()">
          <UFormField :label="t('webhooks.endpointUrl')" required>
            <UInput v-model="url" type="url" required />
          </UFormField>
          <UFormField :label="t('webhooks.descriptionLabel')">
            <UInput v-model="description" :placeholder="t('webhooks.optional')" />
          </UFormField>
          <UFormField :label="t('webhooks.events')">
            <UCheckboxGroup v-model="events" :items="eventItems" variant="card" indicator="end" />
          </UFormField>
          <UFormField :label="t('webhooks.stat.maxAttempts')">
            <UInputNumber v-model="maxAttempts" :min="1" :max="10" />
          </UFormField>
          <UAlert v-if="error" role="alert" color="error" variant="subtle" :title="error" />
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="outline" :label="t('common.cancel')" @click="dialogOpen = false" />
            <UButton type="submit" :loading="creating" :disabled="creating || events.length === 0" :label="t('webhooks.create')" />
          </div>
        </form>
      </template>
    </UModal>
    <SettingsAccountStepUpDialog
      v-model:open="confirming"
      :has-password="securityStatus?.passwordSet ?? true"
      :has-passkey="(securityStatus?.passkeys.length ?? 0) > 0"
      :require-second-factor="securityStatus?.requireSecondFactor ?? false"
      :totp-enabled="securityStatus?.totpEnabled ?? false"
      action="webhook.change"
      :on-authorized="create"
    />
    <SettingsAccountStepUpDialog
      v-model:open="enablingOpen"
      :has-password="securityStatus?.passwordSet ?? true"
      :has-passkey="(securityStatus?.passkeys.length ?? 0) > 0"
      :require-second-factor="securityStatus?.requireSecondFactor ?? false"
      :totp-enabled="securityStatus?.totpEnabled ?? false"
      action="webhook.change"
      :on-authorized="token => enabling && toggle(enabling, token)"
    />
  </AppPage>
</template>
