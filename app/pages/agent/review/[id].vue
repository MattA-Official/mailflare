<script setup lang="ts">
// A send approval opened from a link (the assistant's notification or the reviewer's email).
// Ported from legacy/src/app/(dashboard)/agent/review/[id]/page.tsx.
import type { AgentReviewResponse } from '~/types/agent/send-review'

definePageMeta({ layout: 'dashboard' })

const { t } = useLanguage()
useHead({ title: () => t('agent.review.title') })
const route = useRoute()
const id = computed(() => String(route.params.id))
const request = ref<AgentReviewResponse | null>(null)
const error = ref<string | null>(null)

watch(id, async (value) => {
  request.value = null
  error.value = null
  try {
    const response = await authFetch(`/api/agent/approvals/${encodeURIComponent(value)}`)
    const data = await response.json().catch(() => ({})) as AgentReviewResponse
    if (!response.ok) throw new Error(data.error || t('agent.review.loadFailed'))
    request.value = data
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('agent.review.loadFailed')
  }
}, { immediate: true })

const reviewable = computed(() => request.value?.status === 'pending' && !request.value.stale && !!request.value.snapshot)
</script>

<template>
  <UDashboardPanel id="agent-review">
    <template #header>
      <UDashboardNavbar :title="t('agent.review.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <p v-if="error" role="alert" class="text-error">{{ error }}</p>
      <p v-else-if="!request">{{ t('agent.review.loading') }}</p>
      <p v-else-if="!reviewable">{{ request.stale ? t('agent.review.stale') : t('agent.review.status', { status: request.status }) }}</p>
      <AgentSendReview
        v-if="request && reviewable"
        :approval-id="id"
        :snapshot="request.snapshot!"
        :unfamiliar-recipients="request.unfamiliarRecipients"
        @close="navigateTo('/drafts')"
        @sent="navigateTo('/sent')"
      />
    </template>
  </UDashboardPanel>
</template>
