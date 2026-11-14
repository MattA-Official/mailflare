<script setup lang="ts">
// Fork-only. One app registered with the OIDC provider: connection details, settings, people, delete.
import type { AppFormDraft } from '~/components/admin/system/AppForm.vue'
import { appToDraft, deleteOidcApp, draftToInput, fetchOidcApp, rotateOidcAppSecret, updateOidcApp } from '~/utils/admin/system/apps'

definePageMeta({ layout: 'dashboard', nav: 'admin', auth: { role: 'admin', primary: true, requireMailbox: true } })

const { t } = useLanguage()
const route = useRoute()
const id = computed(() => String(route.params.id))
const { data, error, refresh } = useAsyncData(() => `oidc-app-${id.value}`, () => fetchOidcApp(id.value))
const { data: discovery } = useAsyncData('oidc-discovery', () => $fetch<{ issuer: string }>('/.well-known/openid-configuration'), { server: false })
useHead({ title: () => data.value?.app.name ?? t('oidc.apps.title') })

const draft = ref<AppFormDraft | null>(null)
watch(() => data.value?.app, (app) => {
  if (app) draft.value = appToDraft(app)
}, { immediate: true })

const saving = ref(false)
const message = ref<string | null>(null)
const secret = ref<string | null>(null)
const rotateOpen = ref(false)
const rotating = ref(false)
const deleteOpen = ref(false)
const deleting = ref(false)
const copied = ref<string | null>(null)

const discoveryUrl = computed(() => discovery.value ? `${discovery.value.issuer}/.well-known/openid-configuration` : '')
const roleLabels = computed(() => new Map((data.value?.app.roles ?? []).map(role => [role.key, role.label])))

async function save() {
  if (!draft.value) return
  saving.value = true
  message.value = null
  try {
    await updateOidcApp(id.value, draftToInput(draft.value))
    await refresh()
    message.value = t('oidc.apps.saved')
  } catch (cause) {
    message.value = cause instanceof Error ? cause.message : t('oidc.apps.saveFailed')
  } finally {
    saving.value = false
  }
}

async function rotate() {
  rotating.value = true
  message.value = null
  try {
    secret.value = (await rotateOidcAppSecret(id.value)).clientSecret
    rotateOpen.value = false
    await refresh()
  } catch {
    message.value = t('oidc.apps.rotateFailed')
  } finally {
    rotating.value = false
  }
}

async function remove() {
  deleting.value = true
  try {
    await deleteOidcApp(id.value)
    await navigateTo('/apps', { replace: true })
  } catch {
    message.value = t('oidc.apps.deleteFailed')
    deleteOpen.value = false
  } finally {
    deleting.value = false
  }
}

async function copy(value: string) {
  await navigator.clipboard.writeText(value)
  copied.value = value
}
</script>

<template>
  <AdminSystemPage id="app" :title="data?.app.name ?? t('oidc.apps.title')">
    <template #actions>
      <UButton color="neutral" variant="ghost" icon="i-lucide-arrow-left" to="/apps" :label="t('oidc.apps.back')" />
    </template>

    <p v-if="error" role="alert" class="text-sm text-error">
      {{ error.message || t('oidc.apps.loadFailed') }}
    </p>

    <template v-if="data && draft">
      <UCard>
        <template #header>
          <h2 class="text-sm font-semibold text-highlighted">
            {{ t('oidc.apps.connection') }}
          </h2>
          <p class="mt-1 text-xs text-muted">
            {{ t('oidc.apps.connectionHint') }}
          </p>
        </template>
        <dl class="space-y-4 text-sm">
          <div v-for="row in [{ label: t('oidc.apps.issuer'), value: discovery?.issuer ?? '' }, { label: t('oidc.apps.discovery'), value: discoveryUrl }, { label: t('oidc.apps.clientId'), value: data.app.clientId }]" :key="row.label">
            <dt class="text-xs font-medium text-muted">
              {{ row.label }}
            </dt>
            <dd class="mt-1 flex items-center gap-2">
              <code class="min-w-0 flex-1 break-all rounded bg-elevated px-2 py-1 text-xs">{{ row.value }}</code>
              <UButton v-if="row.value" size="xs" color="neutral" variant="ghost" icon="i-lucide-copy" :aria-label="t('oidc.apps.copy')" :label="copied === row.value ? t('common.copied') : undefined" @click="copy(row.value)" />
            </dd>
          </div>
          <div>
            <dt class="text-xs font-medium text-muted">
              {{ t('oidc.apps.clientSecret') }}
            </dt>
            <dd class="mt-1 flex flex-wrap items-center gap-2">
              <code v-if="secret" class="min-w-0 flex-1 break-all rounded border border-primary/30 bg-primary/5 px-2 py-1 text-xs">{{ secret }}</code>
              <code v-else class="rounded bg-elevated px-2 py-1 text-xs">{{ data.app.clientSecretPrefix ? `${data.app.clientSecretPrefix}…` : t('oidc.apps.noSecret') }}</code>
              <UButton v-if="secret" size="xs" color="neutral" variant="ghost" icon="i-lucide-copy" :label="copied === secret ? t('common.copied') : t('oidc.apps.copy')" @click="copy(secret)" />
              <UButton size="xs" color="neutral" variant="outline" icon="i-lucide-refresh-cw" :label="t('oidc.apps.rotateSecret')" @click="rotateOpen = true" />
            </dd>
            <p v-if="secret" class="mt-1 text-xs text-warning">
              {{ t('oidc.apps.copySecret') }}
            </p>
          </div>
        </dl>
      </UCard>

      <UCard>
        <form class="space-y-5" @submit.prevent="save">
          <AdminSystemAppForm v-model="draft" mode="edit" />
          <div class="flex items-center gap-3">
            <UButton type="submit" :loading="saving" :label="saving ? t('common.saving') : t('oidc.apps.save')" />
            <p v-if="message" role="status" class="text-sm text-muted">
              {{ message }}
            </p>
          </div>
        </form>
      </UCard>

      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <template #header>
          <h2 class="text-sm font-semibold text-highlighted">
            {{ t('oidc.apps.membersTitle') }}
          </h2>
          <p class="mt-1 text-xs text-muted">
            {{ t('oidc.apps.membersHint') }}
          </p>
        </template>
        <p v-if="!data.members.length" class="px-5 py-4 text-sm text-muted">
          {{ t('oidc.apps.noMembers') }}
        </p>
        <ul v-else class="divide-y divide-default">
          <li v-for="member in data.members" :key="member.userId">
            <NuxtLink :to="`/accounts/${member.userId}/apps`" class="flex items-center gap-3 px-5 py-3 hover:bg-elevated/50">
              <AdminSystemAvatar :name="member.name" :email="member.email" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium text-highlighted">{{ member.name }}</span>
                <span class="block truncate text-xs text-muted">{{ member.email }}</span>
              </span>
              <span class="flex flex-wrap justify-end gap-1">
                <UBadge v-for="role in member.roles" :key="role" color="neutral" variant="outline" :label="roleLabels.get(role) ?? role" />
              </span>
            </NuxtLink>
          </li>
        </ul>
      </UCard>

      <div>
        <UButton color="error" variant="outline" icon="i-lucide-trash-2" :label="t('oidc.apps.delete')" @click="deleteOpen = true" />
      </div>
    </template>

    <UModal v-model:open="rotateOpen" :dismissible="!rotating" :title="t('oidc.apps.rotateSecret')" :description="t('oidc.apps.rotateConfirm')">
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" :disabled="rotating" :label="t('common.cancel')" @click="rotateOpen = false" />
          <UButton :loading="rotating" :label="t('oidc.apps.rotateSecret')" @click="rotate" />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="deleteOpen" :dismissible="!deleting" :title="t('oidc.apps.delete')" :description="data ? t('oidc.apps.deleteConfirm', { name: data.app.name }) : ''">
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" :disabled="deleting" :label="t('common.cancel')" @click="deleteOpen = false" />
          <UButton color="error" :loading="deleting" :label="t('oidc.apps.delete')" @click="remove" />
        </div>
      </template>
    </UModal>
  </AdminSystemPage>
</template>
