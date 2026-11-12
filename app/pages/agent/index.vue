<script setup lang="ts">
// Assistant provider settings, ported from legacy/src/app/(admin)/agent/page.tsx. This is
// index.vue, not agent.vue, so the assistant review pages under /agent/* stay siblings.
import { saveAssistantAvailability } from '#lib/agent/availability-client'
import { parseAgentModelIds, toggleAgentModelId } from '#lib/agent/model-ids'
import { DEFAULT_CLOUDFLARE_MODEL } from '#lib/agent/provider-constants'
import type { AgentModelOption, AgentProviderKind, AgentProviderPreset } from '#lib/agent/provider-types'
import type { AgentAdminForm } from '~/types/admin/system/misc'
import { PROVIDER_PRESETS, baseUrlForPreset, loadAgentAdminSettings, loadAgentModels, saveAgentAdminSettings, saveAgentEnabled, updateAgentModelRate } from '~/utils/admin/system/settings'

definePageMeta({ layout: 'dashboard', nav: 'admin', auth: { role: 'admin', primary: true, requireMailbox: true } })

const { t } = useLanguage()
useHead({ title: () => t('agentAdmin.title') })

const form = ref<AgentAdminForm>({ provider: 'cloudflare', preset: 'openai', baseUrl: '', apiKey: '', model: DEFAULT_CLOUDFLARE_MODEL, rates: {} })
const assistantEnabled = ref(true)
const enabledSaving = ref(false)
const enabledStatus = ref<string | null>(null)
const loaded = ref(false)
const cloudflareAvailable = ref(false)
const hasSavedKey = ref(false)
const savedEndpoint = ref('')
const models = ref<AgentModelOption[]>([])
const modelSource = ref<'catalog' | 'suggested' | null>(null)
const modelsLoading = ref(false)
const modelError = ref<string | null>(null)
const status = ref<string | null>(null)
const saving = ref(false)

const providerItems = computed(() => [
  { label: t('agentAdmin.cloudflareAi'), value: 'cloudflare' },
  { label: t('agentAdmin.openaiCompatible'), value: 'compatible' },
])
const presetItems = PROVIDER_PRESETS.map(item => ({ label: item.label, value: item.id }))

onMounted(async () => {
  try {
    const data = await loadAgentAdminSettings()
    form.value = { provider: data.config.provider, preset: data.config.preset, baseUrl: data.config.baseUrl, apiKey: '', model: data.config.models.join(', '), rates: data.config.rates }
    assistantEnabled.value = data.assistantEnabled
    cloudflareAvailable.value = data.cloudflareAvailable
    hasSavedKey.value = data.config.hasApiKey
    savedEndpoint.value = `${data.config.preset}|${data.config.baseUrl}`
    loaded.value = true
  } catch (error) {
    status.value = error instanceof Error ? error.message : t('agentAdmin.loadFailed')
  }
})

const canUseSavedKey = computed(() => hasSavedKey.value && savedEndpoint.value === `${form.value.preset}|${form.value.baseUrl}`)
const selectedModelIds = computed(() => parseAgentModelIds(form.value.model))

// Reload the model list whenever the endpoint or key changes, debounced for typed fields.
watch(
  () => [loaded.value, form.value.provider, form.value.preset, form.value.baseUrl, form.value.apiKey, canUseSavedKey.value] as const,
  (_value, _old, onCleanup) => {
    if (!loaded.value) return
    models.value = []
    modelSource.value = null
    modelError.value = null
    const current = form.value
    if (current.provider === 'compatible' && (!current.baseUrl || (!current.apiKey.trim() && !canUseSavedKey.value))) {
      modelError.value = current.preset === 'custom' && !current.baseUrl ? t('agentAdmin.enterUrl') : t('agentAdmin.enterKey')
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      modelsLoading.value = true
      try {
        const data = await loadAgentModels(current, controller.signal)
        models.value = data.models
        modelSource.value = data.source
        const published = Object.fromEntries(data.models.flatMap(item => item.rates ? [[item.id, item.rates]] : []))
        if (Object.keys(published).length) form.value = { ...form.value, rates: { ...form.value.rates, ...published } }
      } catch (error) {
        if (!controller.signal.aborted) modelError.value = error instanceof Error ? error.message : t('agentAdmin.modelsFailed')
      } finally {
        if (!controller.signal.aborted) modelsLoading.value = false
      }
    }, current.provider === 'cloudflare' ? 0 : 500)
    onCleanup(() => {
      window.clearTimeout(timer)
      controller.abort()
    })
  },
)

function setProvider(value: AgentProviderKind) {
  const current = form.value
  form.value = { ...current, provider: value, baseUrl: value === 'compatible' ? baseUrlForPreset(current.preset, current.baseUrl) : '', model: value === 'cloudflare' ? DEFAULT_CLOUDFLARE_MODEL : '' }
}

function setPreset(preset: AgentProviderPreset) {
  form.value = { ...form.value, preset, baseUrl: baseUrlForPreset(preset), apiKey: '', model: '' }
}

async function toggleEnabled(checked: boolean) {
  enabledSaving.value = true
  enabledStatus.value = null
  try {
    const data = await saveAgentEnabled(checked)
    assistantEnabled.value = data.assistantEnabled
    saveAssistantAvailability(data.assistantEnabled)
  } catch (error) {
    enabledStatus.value = error instanceof Error ? error.message : t('agentAdmin.availabilityFailed')
  } finally {
    enabledSaving.value = false
  }
}

const canSubmit = computed(() => loaded.value && !saving.value && selectedModelIds.value.length > 0
  && !(form.value.provider === 'cloudflare' && !cloudflareAvailable.value)
  && !(form.value.provider === 'compatible' && (!form.value.baseUrl || (!form.value.apiKey.trim() && !canUseSavedKey.value))))

async function submit() {
  saving.value = true
  status.value = null
  try {
    const data = await saveAgentAdminSettings(form.value)
    form.value = { ...form.value, apiKey: '', model: data.config.models.join(', '), rates: data.config.rates }
    hasSavedKey.value = data.config.hasApiKey
    savedEndpoint.value = `${data.config.preset}|${data.config.baseUrl}`
    status.value = t('agentAdmin.saved')
  } catch (error) {
    status.value = error instanceof Error ? error.message : t('agentAdmin.saveFailed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <AdminSystemPage id="agent-admin" :title="t('agentAdmin.title')" :description="t('agentAdmin.description')">
    <template #actions>
      <UButton color="neutral" variant="outline" icon="i-lucide-chart-column" to="/ai-usage" :label="t('agentAdmin.viewUsage')" />
    </template>

    <UCard>
      <div class="flex items-center justify-between gap-4">
        <div>
          <p class="font-medium text-highlighted">
            {{ t('agentAdmin.enable') }}
          </p>
          <p class="mt-1 text-sm text-muted">
            {{ t('agentAdmin.enableHint') }}
          </p>
        </div>
        <USwitch :model-value="assistantEnabled" :disabled="!loaded || enabledSaving" :aria-label="t('agentAdmin.enable')" @update:model-value="toggleEnabled" />
      </div>
      <p v-if="enabledStatus" role="status" class="mt-3 text-sm text-error">
        {{ enabledStatus }}
      </p>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="flex items-center gap-2 font-semibold text-highlighted">
          <UIcon name="i-lucide-bot" class="size-5" />{{ t('agentAdmin.provider') }}
        </h2>
        <p class="mt-1 text-sm text-muted">
          {{ t('agentAdmin.providerWarning') }}
        </p>
      </template>
      <form class="space-y-5" @submit.prevent="submit">
        <UFormField :label="t('agentAdmin.providerLabel')" :hint="form.provider === 'cloudflare' && !cloudflareAvailable ? t('agentAdmin.needsBinding') : undefined" :ui="{ hint: 'text-warning' }">
          <USelect :model-value="form.provider" :items="providerItems" :disabled="!loaded" class="w-full" @update:model-value="value => setProvider(value as AgentProviderKind)" />
        </UFormField>
        <template v-if="form.provider === 'compatible'">
          <UFormField :label="t('agentAdmin.template')">
            <USelect :model-value="form.preset" :items="presetItems" class="w-full" @update:model-value="value => setPreset(value as AgentProviderPreset)" />
          </UFormField>
          <UFormField :label="t('agentAdmin.baseUrl')" required>
            <UInput :model-value="form.baseUrl" type="url" :readonly="form.preset !== 'custom'" placeholder="https://provider.example/v1" required class="w-full" @update:model-value="value => form = { ...form, baseUrl: String(value), model: '' }" />
          </UFormField>
          <UFormField :label="t('agentAdmin.apiKey')" :help="canUseSavedKey ? t('agentAdmin.keySaved') : t('agentAdmin.keyNote')">
            <UInput v-model="form.apiKey" type="password" autocomplete="new-password" :placeholder="canUseSavedKey ? t('agentAdmin.savedKeyPlaceholder') : t('agentAdmin.enterKeyPlaceholder')" class="w-full" />
          </UFormField>
        </template>

        <div class="space-y-2">
          <p class="text-sm font-medium">
            {{ t('agentAdmin.models') }}
          </p>
          <div class="max-h-64 space-y-2 overflow-y-auto rounded-md border border-default p-3">
            <p v-if="modelsLoading" class="text-sm text-muted">
              {{ t('agentAdmin.loadingModels') }}
            </p>
            <p v-else-if="!models.length" class="text-sm text-muted">
              {{ t('agentAdmin.modelsUnavailable') }}
            </p>
            <UCheckbox
              v-for="item in models"
              :key="item.id"
              :model-value="selectedModelIds.includes(item.id)"
              :label="item.name === item.id ? item.id : `${item.name} · ${item.id}`"
              @update:model-value="value => form = { ...form, model: toggleAgentModelId(form.model, item.id, value === true) }"
            />
          </div>
          <p v-if="modelSource === 'suggested'" class="text-xs text-muted">
            {{ t('agentAdmin.suggested') }}
          </p>
          <p v-if="modelError" class="text-xs text-warning">
            {{ modelError }}
          </p>
          <UFormField :label="t('agentAdmin.orEnterIds')" :help="t('agentAdmin.toolCalling')" class="pt-2" :ui="{ label: 'text-xs text-muted' }">
            <UInput v-model="form.model" :placeholder="form.provider === 'cloudflare' ? DEFAULT_CLOUDFLARE_MODEL : 'provider/model-id, provider/another-model'" required class="w-full" />
          </UFormField>
        </div>

        <div class="space-y-3">
          <p class="text-sm font-medium">
            {{ t('agentAdmin.rates') }}
          </p>
          <p class="text-xs text-muted">
            {{ t('agentAdmin.ratesHint') }}
          </p>
          <template v-for="model in selectedModelIds" :key="model">
            <div v-if="models.find(item => item.id === model)?.rates" class="grid gap-2 rounded-lg border border-default p-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto]">
              <span class="min-w-0 break-all">{{ model }}</span>
              <span class="text-muted">{{ t('agentAdmin.rateLine', { input: form.rates[model]?.input ?? '', output: form.rates[model]?.output ?? '' }) }} <span class="text-xs">{{ t('agentAdmin.fromProvider') }}</span></span>
            </div>
            <div v-else class="grid gap-2 rounded-lg border border-default p-3 sm:grid-cols-[minmax(0,1fr)_7rem_7rem]">
              <span class="min-w-0 break-all text-sm">{{ model }}</span>
              <UFormField :label="t('agentAdmin.input')" :ui="{ label: 'text-xs text-muted' }">
                <UInput type="number" min="0" step="any" :model-value="String(form.rates[model]?.input ?? '')" :placeholder="t('agentAdmin.usdPerM')" @update:model-value="value => form = updateAgentModelRate(form, model, 'input', value)" />
              </UFormField>
              <UFormField :label="t('agentAdmin.output')" :ui="{ label: 'text-xs text-muted' }">
                <UInput type="number" min="0" step="any" :model-value="String(form.rates[model]?.output ?? '')" :placeholder="t('agentAdmin.usdPerM')" @update:model-value="value => form = updateAgentModelRate(form, model, 'output', value)" />
              </UFormField>
            </div>
          </template>
        </div>

        <p v-if="status" role="status" class="text-sm text-toned">
          {{ status }}
        </p>
        <UButton type="submit" :loading="saving" :disabled="!canSubmit" :label="saving ? t('common.saving') : t('agentAdmin.save')" />
      </form>
    </UCard>
  </AdminSystemPage>
</template>
