<script setup lang="ts">
// Webhooks admin. Ported from legacy/src/app/(admin)/webhooks/page.tsx.
import type { Webhook, WebhookEvent } from '~/types/admin/email/webhooks'
import { errorMessage } from '~/utils/admin/email/domains'
import { useAdminConfirm } from '~/utils/admin/email/confirm'
import { WEBHOOK_EVENTS, createWebhook, deleteWebhook, fetchWebhooks, testWebhook, updateWebhook } from '~/utils/admin/email/webhooks'

definePageMeta({ layout: 'dashboard', nav: 'admin', auth: { role: 'admin', primary: true, requireMailbox: true } })
const { t } = useLanguage()
useHead({ title: () => t('webhooks.title') })
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

const secretHint = computed(() => t('webhooks.secretHint', { header: '\u0001' }).split('\u0001'))

function openDialog() {
  error.value = null
  dialogOpen.value = true
}

function toggleEvent(event: WebhookEvent, on: boolean) {
  events.value = on ? [...new Set([...events.value, event])] : events.value.filter(value => value !== event)
}

async function create() {
  creating.value = true
  error.value = null
  try {
    const result = await createWebhook({ url: url.value, description: description.value || undefined, events: events.value, maxAttempts: maxAttempts.value })
    secret.value = result.secret
    url.value = ''
    description.value = ''
    dialogOpen.value = false
    await refresh()
  } catch (err) {
    error.value = errorMessage(err, t('domains.requestFailed'))
  } finally {
    creating.value = false
  }
}

async function toggle(hook: Webhook) {
  try {
    await updateWebhook(hook.id, { enabled: !hook.enabled })
  } catch (err) {
    toast.add({ title: errorMessage(err, t('domains.requestFailed')), color: 'error' })
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
  <UDashboardPanel id="webhooks">
    <template #header>
      <UDashboardNavbar :title="t('webhooks.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton icon="i-lucide-plus" :label="t('webhooks.add')" @click="openDialog" />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <div class="mx-auto w-full max-w-3xl space-y-6">
        <p class="text-sm text-muted">
          {{ t('webhooks.description') }}
        </p>

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
        <p v-if="error && !dialogOpen" role="alert" class="text-sm text-error">
          {{ error }}
        </p>

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
      </div>

      <UModal v-model:open="dialogOpen" :title="t('webhooks.add')" :description="t('webhooks.addDescription')">
        <template #body>
          <form class="space-y-4" @submit.prevent="create">
            <UFormField :label="t('webhooks.endpointUrl')" required>
              <UInput v-model="url" type="url" required class="w-full" />
            </UFormField>
            <UFormField :label="t('webhooks.descriptionLabel')">
              <UInput v-model="description" :placeholder="t('webhooks.optional')" class="w-full" />
            </UFormField>
            <UFormField :label="t('webhooks.events')">
              <div class="space-y-2">
                <label v-for="event in WEBHOOK_EVENTS" :key="event.value" class="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-default px-3 py-2">
                  <span>
                    <span class="block text-sm font-medium">{{ t(event.labelKey) }}</span>
                    <span class="block text-xs text-muted">{{ t(event.hintKey) }}</span>
                  </span>
                  <UCheckbox :model-value="events.includes(event.value)" @update:model-value="value => toggleEvent(event.value, value === true)" />
                </label>
              </div>
            </UFormField>
            <UFormField :label="t('webhooks.stat.maxAttempts')">
              <UInputNumber v-model="maxAttempts" :min="1" :max="10" class="w-full" />
            </UFormField>
            <p v-if="error" role="alert" class="text-sm text-error">
              {{ error }}
            </p>
            <div class="flex justify-end gap-2">
              <UButton color="neutral" variant="outline" :label="t('common.cancel')" @click="dialogOpen = false" />
              <UButton type="submit" :loading="creating" :disabled="creating || events.length === 0" :label="t('webhooks.create')" />
            </div>
          </form>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
