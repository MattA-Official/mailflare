<script setup lang="ts">
// Email Routing status for the zone, with a setup that also deals with conflicting MX records.
// Ported from legacy/src/app/(admin)/domains/CloudflareReceivingConfig.tsx.
import { errorMessage, runReceivingSetup } from '~/utils/admin/email/domains'
import { useAdminConfirm } from '~/utils/admin/email/confirm'

const props = defineProps<{ domainId: string, routingOk: boolean, routingLabel: string, manual: boolean }>()
const emit = defineEmits<{ changed: [] }>()
const { t } = useLanguage()
const { confirmMxReplacement } = useAdminConfirm()
const busy = ref(false)
const error = ref('')

async function setup() {
  busy.value = true
  error.value = ''
  try {
    if (await runReceivingSetup(props.domainId, confirmMxReplacement)) emit('changed')
  } catch (err) {
    error.value = errorMessage(err, t('domains.setupFailed'))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="space-y-2">
    <ul class="space-y-2">
      <AdminEmailDomainStatusRow :ok="routingOk" :title="t('domains.emailRouting')" :hint="t('domains.emailRoutingHint')">
        {{ routingLabel }}
        <template v-if="!routingOk" #action>
          <UButton size="sm" color="neutral" variant="outline" :disabled="busy || manual" :title="manual ? t('domains.manualDns') : undefined" :label="busy ? t('domains.settingUp') : t('domains.setup')" @click="setup" />
        </template>
      </AdminEmailDomainStatusRow>
    </ul>
    <p v-if="error" role="alert" class="text-xs text-error">
      {{ error }}
    </p>
  </div>
</template>
