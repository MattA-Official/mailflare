<script setup lang="ts">
// Ported from legacy/src/app/(admin)/accounts/page.tsx. The licence overlay and seat counter are
// gone: the fork has no licence gate, so there is no seat limit.
import type { Account, AccountAliasDraft, AccountDomain } from '~/types/admin/system/accounts'
import { createAccount, fetchAccounts, fetchDomains, restoreAccount } from '~/utils/admin/system/accounts'

definePageMeta({ layout: 'dashboard', nav: 'admin', auth: { role: 'admin', requireMailbox: true } })

const { t } = useLanguage()
const currentUser = useCurrentUser()
useHead({ title: () => t('accounts.title') })

const canManage = computed(() => !!currentUser.value && (currentUser.value.isPrimaryAdmin || currentUser.value.canManageUsers))
const canChooseRole = computed(() => !!currentUser.value?.isPrimaryAdmin)

const accounts = ref<Account[]>([])
const domains = ref<AccountDomain[]>([])
const loading = ref(true)
const message = ref<string | null>(null)
const selected = ref<Set<string>>(new Set())
const deleteOpen = ref(false)
const restoringId = ref<string | null>(null)

const createOpen = ref(false)
const saving = ref(false)
const form = reactive({ username: '', domainId: '', role: 'user' as 'admin' | 'user', password: '', useAllDomains: false, aliases: [] as AccountAliasDraft[] })

const domainItems = computed(() => domains.value.map(domain => ({ label: domain.hostname, value: domain.id })))
const roleItems = computed(() => [{ label: t('accounts.roleUser'), value: 'user' }, { label: t('accounts.roleAdmin'), value: 'admin' }])
const selectedAccounts = computed(() => accounts.value.filter(account => selected.value.has(account.id)))

async function loadAccounts() {
  const data = await fetchAccounts()
  accounts.value = data.accounts ?? []
}

onMounted(async () => {
  try {
    await loadAccounts()
    domains.value = await fetchDomains()
    form.domainId = domains.value[0]?.id ?? ''
  } catch (error) {
    message.value = error instanceof Error ? error.message : t('accounts.loadFailed')
  } finally {
    loading.value = false
  }
})

async function submit() {
  saving.value = true
  message.value = null
  try {
    await createAccount({
      username: form.username,
      domainId: form.domainId,
      password: form.password,
      role: form.role,
      useAllDomains: form.useAllDomains,
      aliases: form.aliases.map(({ domainId, localPart }) => ({ domainId, localPart })),
    })
    Object.assign(form, { username: '', password: '', useAllDomains: false, aliases: [] })
    createOpen.value = false
    await loadAccounts()
  } catch (error) {
    message.value = error instanceof Error ? error.message : t('accounts.createFailed')
  } finally {
    saving.value = false
  }
}

async function restore(account: Account) {
  restoringId.value = account.id
  message.value = null
  try {
    await restoreAccount(account.id)
    await loadAccounts()
  } catch (error) {
    message.value = error instanceof Error ? error.message : t('accounts.restoreFailed')
  } finally {
    restoringId.value = null
  }
}

async function onDeleted() {
  deleteOpen.value = false
  selected.value = new Set()
  await loadAccounts()
}
</script>

<template>
  <AdminSystemPage id="accounts" :title="t('accounts.title')" :description="t('accounts.description')">
    <template #actions>
      <UButton v-if="canManage" icon="i-lucide-plus" :label="t('accounts.new')" @click="createOpen = true" />
    </template>

    <p v-if="message && !createOpen" role="alert" class="text-sm text-error">
      {{ message }}
    </p>

    <AdminSystemAccountsTable
      v-model:selected="selected"
      :accounts="accounts"
      :current-user-id="currentUser?.id"
      :is-primary-admin="!!currentUser?.isPrimaryAdmin"
      :loading="loading"
      :restoring-id="restoringId"
      @delete-selected="deleteOpen = true"
      @restore="restore"
    />

    <AdminSystemDeleteAccountsModal v-model:open="deleteOpen" :accounts="selectedAccounts" :candidates="accounts" @deleted="onDeleted" />

    <UModal v-model:open="createOpen" :title="t('accounts.addTitle')" :description="t('accounts.addDescription')" :ui="{ content: 'sm:max-w-xl' }">
      <template #body>
        <form class="space-y-4" @submit.prevent="submit">
          <fieldset :disabled="saving" class="space-y-4">
            <UFormField :label="t('auth.email')" required>
              <UFieldGroup class="w-full">
                <UInput v-model="form.username" :placeholder="t('accounts.username')" required class="min-w-0 flex-1" />
                <UBadge color="neutral" variant="outline" size="lg" label="@" />
                <USelect v-model="form.domainId" :items="domainItems" :placeholder="t('accounts.selectDomain')" :aria-label="t('accounts.domain')" class="min-w-0 max-w-[55%]" />
              </UFieldGroup>
            </UFormField>
            <UFormField :label="t('auth.password')" required>
              <UInput v-model="form.password" type="password" minlength="8" autocomplete="new-password" required class="w-full" />
            </UFormField>
            <UFormField v-if="canChooseRole" :label="t('accounts.role')">
              <USelect v-model="form.role" :items="roleItems" class="w-full" />
            </UFormField>
            <AdminSystemAccountAliases
              v-model:use-all-domains="form.useAllDomains"
              v-model:aliases="form.aliases"
              :domains="domains"
              :domain-id="form.domainId"
              :username="form.username"
            />
            <p v-if="message" role="alert" class="text-sm text-error">
              {{ message }}
            </p>
            <UButton type="submit" :loading="saving" :disabled="!form.domainId" :label="saving ? t('accounts.creating') : t('accounts.create')" />
          </fieldset>
        </form>
      </template>
    </UModal>
  </AdminSystemPage>
</template>
