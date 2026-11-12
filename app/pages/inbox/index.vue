<script setup lang="ts">
// Placeholder list that proves the stack end to end. The mail workstream replaces it with the
// real message list (legacy/src/app/(dashboard) and legacy/src/components/messages).
definePageMeta({ layout: 'dashboard', auth: { requireMailbox: true } })

const { t } = useLanguage()
useHead({ title: () => t('navigation.inbox') })

interface MessageRow { id: string, subject: string | null, fromAddr: string | null, snippet?: string | null, receivedAt?: string | null }
const { data, status, refresh } = useAsyncData('inbox', () => api<{ messages: MessageRow[], total: number }>('/api/messages?folder=inbox'))
</script>

<template>
  <UDashboardPanel id="inbox">
    <template #header>
      <AppNavbar :title="t('navigation.inbox')" search>
        <template #right>
          <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refresh()" />
        </template>
      </AppNavbar>
    </template>
    <template #body>
      <UEmpty v-if="!data?.messages.length" icon="i-lucide-inbox" :title="t('navigation.inbox')" description="No messages yet." />
      <ul v-else class="divide-y divide-default">
        <li v-for="message in data.messages" :key="message.id" class="py-3">
          <p class="text-sm text-muted">{{ message.fromAddr }}</p>
          <p class="font-medium text-highlighted">{{ message.subject || '(no subject)' }}</p>
        </li>
      </ul>
    </template>
  </UDashboardPanel>
</template>
