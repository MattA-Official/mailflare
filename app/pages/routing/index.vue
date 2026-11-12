<script setup lang="ts">
// Domain routing admin. Ported from legacy/src/app/(admin)/routing/page.tsx.
import { errorMessage } from '~/utils/admin/email/domains'
import { fetchAdminRoutingDomains } from '~/utils/admin/email/routing'

definePageMeta({ layout: 'dashboard', nav: 'admin', auth: { role: 'admin', requireMailbox: true } })
const { t } = useLanguage()
useHead({ title: () => t('routingAdmin.title') })

const { data: domains, status, error } = useAsyncData('admin-routing-domains', fetchAdminRoutingDomains)
const domainId = ref<string | undefined>()
const selectedDomain = computed(() => domains.value?.find(domain => domain.id === domainId.value) ?? domains.value?.[0])
const domainItems = computed(() => (domains.value ?? []).map(domain => ({ label: domain.hostname, value: domain.id })))
</script>

<template>
  <UDashboardPanel id="routing">
    <template #header>
      <UDashboardNavbar :title="t('routingAdmin.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <div class="mx-auto w-full max-w-3xl space-y-8">
        <p class="text-sm text-muted">
          {{ t('routingAdmin.description') }}
        </p>
        <section class="space-y-4">
          <div>
            <h2 class="text-xl font-semibold text-highlighted">
              {{ t('routingAdmin.domain') }}
            </h2>
            <p class="mt-1 text-sm text-muted">
              {{ t('routingAdmin.chooseDomain') }}
            </p>
          </div>
          <UCard>
            <USkeleton v-if="status === 'pending' && !domains" class="h-10 w-full" />
            <p v-else-if="error" role="alert" class="text-sm text-error">
              {{ errorMessage(error, t('routing.requestFailed')) }}
            </p>
            <p v-else-if="!domains?.length" class="text-sm text-muted">
              {{ t('routingAdmin.addDomainFirst') }}
            </p>
            <UFormField v-else :label="t('routingAdmin.managedDomain')">
              <USelect :model-value="selectedDomain?.id" :items="domainItems" class="w-full" @update:model-value="value => domainId = value as string" />
            </UFormField>
          </UCard>
        </section>
        <AdminEmailDomainRouting v-if="selectedDomain" :key="selectedDomain.id" :domain="selectedDomain" />
      </div>
    </template>
  </UDashboardPanel>
</template>
