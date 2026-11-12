<script setup lang="ts">
// The header-level unsubscribe action. The route decides the mechanism (one-click POST, sent
// mailto, or a link to open); this reflects the outcome and then shows "Unsubscribed".
// Ported from legacy/src/components/messages/unsubscribe-button.tsx.
import { openUnsubscribeUrl } from '~/utils/messages/message-actions-utils'
import { requestUnsubscribe } from '~/utils/messages/unsubscribe-utils'

const props = withDefaults(defineProps<{ messageId: string, variant?: 'header' | 'row' }>(), { variant: 'header' })
const { t } = useLanguage()
const { showNotice } = useCompose()
const pending = ref(false)
const done = ref(false)
const confirmOpen = ref(false)

// The confirm dialog closes at once; progress and the outcome are notices.
async function onUnsubscribe() {
  confirmOpen.value = false
  pending.value = true
  showNotice(t('actions.unsubscribing'), { tone: 'loading' })
  try {
    const result = await requestUnsubscribe(props.messageId)
    done.value = true
    if (result.method === 'link') {
      openUnsubscribeUrl(result.url)
      showNotice(t('actions.unsubscribeLinkOpened'))
    }
    else if (result.method === 'mailto') {
      showNotice(t('actions.unsubscribeEmailSent'))
    }
    else {
      showNotice(t('actions.unsubscribed'))
    }
  }
  catch {
    showNotice(t('actions.unsubscribeFailed'), { tone: 'error' })
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <span v-if="done" role="status" class="flex items-center gap-1 px-1 text-xs font-medium text-success">
    <UIcon name="i-lucide-mail-check" class="size-3.5" aria-hidden="true" />
    {{ t('actions.unsubscribed') }}
  </span>
  <template v-else>
    <UButton
      size="xs"
      :variant="variant === 'row' ? 'outline' : 'link'"
      :color="variant === 'row' ? 'neutral' : 'primary'"
      :class="variant === 'row' ? 'h-5 px-2' : 'h-5 px-2'"
      :disabled="pending"
      :label="t('actions.unsubscribe')"
      @click.prevent.stop="confirmOpen = true"
    />
    <UModal v-model:open="confirmOpen" :title="t('actions.unsubscribeConfirmTitle')" :description="t('actions.unsubscribeConfirmDescription')">
      <template #footer>
        <div class="flex w-full justify-end gap-2" @click.stop>
          <UButton color="neutral" variant="outline" size="sm" :label="t('common.cancel')" @click="confirmOpen = false" />
          <UButton size="sm" :label="t('actions.unsubscribe')" @click="onUnsubscribe" />
        </div>
      </template>
    </UModal>
  </template>
</template>
