<script setup lang="ts">
// Settings > App passwords card for connecting an external mail app over JMAP. Mints a
// mailbox-scoped API key with the `jmap` scope and shows the details once.
// Ported from legacy/src/components/settings/email-clients-settings.tsx.
import QRCode from 'qrcode'
import { createJmapApiKey } from '~/utils/settings/account/account'
import { buildSignInQrPayload } from '~/utils/settings/account/sign-in-qr'

/** Upper bound `POST /api/api-keys` places on `mailboxIds`. */
const MAX_KEY_MAILBOXES = 30

const { t } = useLanguage()
const { mailboxes, selectedMailbox, isLoading } = useSelectedMailbox()
const name = ref('')
// `null` until the user changes the selection, which means every accessible mailbox. The API
// accepts at most 30 mailboxes per key, so past that the default is just the current mailbox.
const chosenMailboxIds = ref<string[] | null>(null)
const mailboxIds = computed(() => chosenMailboxIds.value ?? (mailboxes.value.length <= MAX_KEY_MAILBOXES
  ? mailboxes.value.map(mailbox => mailbox.id)
  : [selectedMailbox.value?.id ?? mailboxes.value[0]?.id].filter((id): id is string => !!id)))
const key = ref<string | null>(null)
const username = ref('')
const error = ref<string | null>(null)
const busy = ref(false)
const copied = ref<string | null>(null)
const qr = ref<string | null>(null)
const server = window.location.origin

// The mobile app scans this to fill in its sign-in form; it carries the key, so it is rendered in
// the browser and never leaves the page.
watch([key, username], async ([value, email]) => {
  qr.value = null
  if (!value) return
  try {
    qr.value = await QRCode.toDataURL(buildSignInQrPayload({ server, email, key: value }), { margin: 1, width: 240, errorCorrectionLevel: 'M' })
  } catch {
    qr.value = null
  }
})

async function submit() {
  busy.value = true
  error.value = null
  try {
    const created = await createJmapApiKey(name.value.trim() || t('emailClients.defaultName'), mailboxIds.value)
    // The server ignores the username, but mail apps want an email address there.
    const first = mailboxes.value.find(mailbox => mailbox.id === mailboxIds.value[0])
    username.value = first ? `${first.localPart}@${first.hostname}` : ''
    key.value = created
    name.value = ''
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('emailClients.createFailed')
  } finally {
    busy.value = false
  }
}

async function copy(label: string, value: string) {
  await navigator.clipboard.writeText(value)
  copied.value = label
}

function toggleMailbox(id: string, on: boolean) {
  chosenMailboxIds.value = on ? [...mailboxIds.value.filter(item => item !== id), id] : mailboxIds.value.filter(item => item !== id)
}

// The translated sentence carries {link} and {url} placeholders that become a link and a code span.
// eslint-disable-next-line no-control-regex -- the markers cannot occur in translated text
const shownOnceParts = computed(() => t('emailClients.shownOnce', { link: '\u0001', url: '\u0002' }).split(/(\u0001|\u0002)/))
</script>

<template>
  <div class="space-y-4">
    <p class="text-sm text-muted">
      {{ t('emailClients.description') }}
    </p>
    <div v-if="key" class="space-y-3 rounded-lg bg-elevated/50 p-4">
      <SettingsAccountCopyField :label="t('emailClients.server')" :value="server" :copied="copied === 'server'" @copy="copy('server', server)" />
      <SettingsAccountCopyField :label="t('emailClients.username')" :value="username || t('emailClients.anyValue')" :copied="copied === 'username'" @copy="copy('username', username || t('emailClients.anyValue'))" />
      <SettingsAccountCopyField :label="t('emailClients.passwordApiKey')" :value="key" :copied="copied === 'key'" mono @copy="copy('key', key)" />
      <div v-if="qr" class="flex flex-col items-center gap-2 rounded-lg bg-white p-4">
        <img :src="qr" :alt="t('emailClients.qrAlt')" width="240" height="240">
        <p class="text-center text-xs text-neutral-500">
          {{ t('emailClients.qrHint') }}
        </p>
      </div>
      <p class="text-xs text-muted">
        <template v-for="(part, index) in shownOnceParts" :key="index">
          <NuxtLink v-if="part === '\u0001'" to="/settings/api-keys" class="text-primary underline">{{ t('settings.nav.apiKeys') }}</NuxtLink>
          <code v-else-if="part === '\u0002'">{{ server }}/.well-known/jmap</code>
          <template v-else>{{ part }}</template>
        </template>
      </p>
    </div>
    <form v-else class="space-y-4" @submit.prevent="submit">
      <div class="flex flex-wrap items-end gap-3">
        <UFormField :label="t('emailClients.deviceName')" name="jmap-key-name" class="min-w-56 flex-1">
          <UInput id="jmap-key-name" v-model="name" :placeholder="t('emailClients.devicePlaceholder')" class="w-full" />
        </UFormField>
        <UButton
          type="submit"
          icon="i-lucide-key-round"
          :disabled="busy || isLoading || !mailboxIds.length || mailboxIds.length > MAX_KEY_MAILBOXES"
          :label="busy ? t('emailClients.creating') : t('emailClients.create')"
        />
      </div>
      <fieldset class="space-y-2">
        <legend class="mb-2 text-sm font-medium">
          {{ t('emailClients.mailboxesLegend') }}
        </legend>
        <p v-if="isLoading" class="text-sm text-muted">
          {{ t('emailClients.loadingMailboxes') }}
        </p>
        <p v-else-if="mailboxes.length === 0" class="text-sm text-muted">
          {{ t('apiKeys.noMailboxes') }}
        </p>
        <template v-else>
          <UCheckbox
            v-for="mailbox in mailboxes"
            :key="mailbox.id"
            :model-value="mailboxIds.includes(mailbox.id)"
            :label="`${mailbox.localPart}@${mailbox.hostname}`"
            @update:model-value="(on) => toggleMailbox(mailbox.id, !!on)"
          />
        </template>
        <p class="text-xs text-muted">
          {{ t('emailClients.aliasLimit', { max: MAX_KEY_MAILBOXES }) }}
        </p>
      </fieldset>
      <p v-if="error" role="alert" class="text-sm text-error">
        {{ error }}
      </p>
    </form>
  </div>
</template>
