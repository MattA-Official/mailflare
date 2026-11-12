<script setup lang="ts">
// Lists, checks, adds, renames and removes passkeys, and offers the policy choice after the first
// one. Ported from legacy/src/components/settings/passkey-settings.tsx.
import { browserSupportsWebAuthn } from '@simplewebauthn/browser'
import { authErrorText } from '#lib/auth/error-messages'
import { isPasskeyCancellation, isPasskeyUnsupported } from '#lib/auth/webauthn/browser-errors'
import type { StepUpAction } from '#lib/auth/webauthn/step-up-types'
import { ClientRequestError } from '#lib/http/client-error'
import type { PasskeyPolicyChoice, PasskeySummary } from '~/types/settings/account'
import { disableMfa } from '~/utils/settings/account/account'
import { addPasskey, checkPasskey, passkeyProvider, removePasskey, removePassword, renamePasskey, setSecondFactorRequirement } from '~/utils/settings/account/passkey-settings'
import { refreshSecurityStatus, useSecurityStatus } from '~/utils/settings/account/security-status'

/** The security changes the first-passkey choice can ask for, in order. */
type PolicyStep = 'mfa.disable' | 'password.remove' | 'second_factor.toggle'
type PendingAction
  = | { type: 'add', name: string, first: boolean, hadPassword: boolean }
    | { type: 'remove', id: string, name: string }
    | { type: 'policy', steps: PolicyStep[], index: number }

const { t } = useLanguage()
const { status, error: loadFailed } = useSecurityStatus()

const addOpen = ref(false)
const name = ref('')
const pending = ref<PendingAction | null>(null)
const confirmRemove = ref<{ id: string, name: string } | null>(null)
const rename = ref<{ id: string, name: string } | null>(null)
const renameError = ref<string | null>(null)
const renaming = ref(false)
const checking = ref(false)
const checkedId = ref<string | null>(null)
const checkError = ref<string | null>(null)
const choiceOpen = ref(false)
const notice = ref<string | null>(null)
/** Set when the step that just finished enrolled the first passkey. */
let choiceAfterAdd = false

// Keep the recognition badge long enough to notice, then return the list to its resting state.
let checkedTimer: ReturnType<typeof setTimeout> | undefined
watch(checkedId, (id) => {
  clearTimeout(checkedTimer)
  if (id) checkedTimer = setTimeout(() => { checkedId.value = null }, 10_000)
})
onBeforeUnmount(() => clearTimeout(checkedTimer))

const passkeys = computed(() => status.value?.passkeys ?? [])

function displayName(passkey: Readonly<PasskeySummary>) {
  if (passkey.name.trim()) return passkey.name
  return passkeyProvider(passkey.aaguid) ?? t('passkey.defaultName', { date: new Date(passkey.createdAt).toLocaleDateString() })
}

function codeText(err: unknown, fallback: Parameters<typeof authErrorText>[2]) {
  return authErrorText(err instanceof ClientRequestError ? err.code : undefined, t, fallback)
}

async function onCheck() {
  if (!browserSupportsWebAuthn()) {
    checkError.value = t('passkey.browserUnsupported')
    return
  }
  checking.value = true
  checkError.value = null
  checkedId.value = null
  try {
    checkedId.value = await checkPasskey()
    await refreshSecurityStatus(true)
  } catch (err) {
    if (isPasskeyCancellation(err)) return
    checkError.value = isPasskeyUnsupported(err) ? t('passkey.browserUnsupported') : codeText(err, 'passkey.verifyFailed')
  } finally {
    checking.value = false
  }
}

/** Runs the confirmed change. Returning true keeps the step-up dialog open for the next step. */
async function authorized(token: string): Promise<boolean> {
  const action = pending.value
  if (!action) return false
  try {
    if (action.type === 'add') {
      await addPasskey(action.name, token)
      name.value = ''
      await refreshSecurityStatus(true)
      choiceAfterAdd = action.first && action.hadPassword
    } else if (action.type === 'remove') {
      await removePasskey(action.id, token)
      await refreshSecurityStatus(true)
    } else {
      const step = action.steps[action.index]
      if (step === 'mfa.disable') {
        await disableMfa({ stepUpToken: token })
        await refreshSecurityStatus(true)
        notice.value = t('passkey.authenticatorOffNotice')
      } else if (step === 'password.remove') {
        await removePassword(token)
        await refreshSecurityStatus(true)
      } else {
        await setSecondFactorRequirement(true, token)
        await refreshSecurityStatus(true)
      }
      if (action.index + 1 < action.steps.length) {
        pending.value = { ...action, index: action.index + 1 }
        return true
      }
    }
  } catch (err) {
    // The server may have applied part of the change; re-read the state before another attempt.
    await refreshSecurityStatus(true)
    throw err
  }
  return false
}

function choose(choice: PasskeyPolicyChoice) {
  choiceOpen.value = false
  if (choice === 'keep') return
  if (choice === 'password-and-passkey') {
    pending.value = { type: 'policy', steps: ['second_factor.toggle'], index: 0 }
    return
  }
  // The authenticator goes first so the password removal leaves no second-factor requirement behind.
  const steps: PolicyStep[] = status.value?.totpEnabled ? ['mfa.disable', 'password.remove'] : ['password.remove']
  pending.value = { type: 'policy', steps, index: 0 }
}

async function submitRename() {
  if (!rename.value) return
  renaming.value = true
  renameError.value = null
  try {
    await renamePasskey(rename.value.id, rename.value.name)
    rename.value = null
    await refreshSecurityStatus(true)
  } catch (err) {
    renameError.value = codeText(err, 'passkey.renameFailed')
  } finally {
    renaming.value = false
  }
}

function submitAdd() {
  if (!status.value) return
  addOpen.value = false
  pending.value = { type: 'add', name: name.value.trim(), first: passkeys.value.length === 0, hadPassword: status.value.passwordSet }
}

function startRemove() {
  if (!confirmRemove.value) return
  const target = confirmRemove.value
  confirmRemove.value = null
  pending.value = { type: 'remove', ...target }
}

// Password accounts can fall back to password sign-in; passkey-only accounts cannot.
const canRemove = computed(() => passkeys.value.length > 1 || !!status.value?.passwordSet)
const warnsLastSecondFactor = computed(() => !!status.value && passkeys.value.length === 1 && status.value.passwordSet && status.value.requireSecondFactor && !status.value.totpEnabled)
const checkedPasskey = computed(() => checkedId.value ? passkeys.value.find(passkey => passkey.id === checkedId.value) ?? null : null)

const policy = computed(() => pending.value?.type === 'policy' ? pending.value : null)
const policyStep = computed(() => policy.value ? policy.value.steps[policy.value.index] : null)
const stepUpAction = computed<StepUpAction>(() => pending.value?.type === 'add'
  ? 'passkey.add'
  : pending.value?.type === 'remove' ? 'passkey.remove' : policyStep.value ?? 'passkey.add')
const stepUpTitle = computed(() => {
  if (!policy.value) return undefined
  if (policyStep.value === 'mfa.disable') return t('mfa.turnOffTitle')
  if (policyStep.value === 'password.remove') return t('passkey.removePasswordTitle')
  return t('twoStep.requireTitle')
})
const stepUpDescription = computed(() => {
  if (!policy.value) return undefined
  if (policyStep.value === 'mfa.disable') return t('mfa.turnOffDescription')
  if (policyStep.value === 'password.remove') return t('passkey.removePasswordDescription')
  return t('twoStep.requireDescription')
})
const stepUpStep = computed(() => policy.value && policy.value.steps.length > 1 ? { current: policy.value.index + 1, total: policy.value.steps.length } : undefined)

const stepUpOpen = computed({
  get: () => pending.value !== null,
  set(value) {
    if (value) return
    pending.value = null
    if (!choiceAfterAdd) return
    choiceAfterAdd = false
    choiceOpen.value = true
  },
})
const removeOpen = computed({ get: () => confirmRemove.value !== null, set: (v) => { if (!v) confirmRemove.value = null } })
const renameOpen = computed({ get: () => rename.value !== null, set: (v) => { if (!v) rename.value = null } })
</script>

<template>
  <p v-if="!status" :role="loadFailed ? 'alert' : undefined" class="text-sm text-muted">
    {{ loadFailed ? t('passkey.loadFailed') : t('mfa.loading') }}
  </p>
  <div v-else class="space-y-5">
    <div class="rounded-lg bg-elevated/50 p-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex min-w-0 items-start gap-3">
          <UIcon v-if="passkeys.length" name="i-lucide-shield-check" class="mt-0.5 size-5 shrink-0 text-success" />
          <UIcon v-else name="i-lucide-shield-off" class="mt-0.5 size-5 shrink-0 text-dimmed" />
          <p class="text-sm font-medium text-highlighted">
            {{ passkeys.length === 0 ? t('passkey.none') : t('passkey.count', { count: passkeys.length }) }}
          </p>
        </div>
        <div class="flex shrink-0 flex-wrap items-center gap-2">
          <UButton
            v-if="passkeys.length"
            color="neutral"
            variant="outline"
            icon="i-lucide-circle-check"
            :disabled="checking"
            :label="checking ? t('common.pleaseWait') : t('passkey.check')"
            @click="onCheck"
          />
          <UButton icon="i-lucide-plus" :label="t('passkey.add')" @click="addOpen = true" />
        </div>
      </div>
      <p v-if="checkError" role="alert" class="mt-3 text-sm text-error">
        {{ checkError }}
      </p>
      <p v-if="checkedPasskey" role="status" aria-live="polite" class="sr-only">
        {{ t('passkey.justVerified') }}: {{ displayName(checkedPasskey) }}
      </p>
    </div>

    <p v-if="notice" role="status" class="text-sm text-muted">
      {{ notice }}
    </p>

    <ul v-if="passkeys.length" class="divide-y divide-default rounded-lg border border-default">
      <li
        v-for="passkey in passkeys"
        :key="passkey.id"
        class="flex items-center justify-between gap-4 px-4 py-3 transition-colors"
        :class="{ 'bg-success/10': checkedId === passkey.id }"
      >
        <div class="flex min-w-0 items-start gap-3">
          <UIcon name="i-lucide-key-round" class="mt-0.5 size-4 shrink-0 text-dimmed" />
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <p class="truncate text-sm font-medium text-highlighted" :title="displayName(passkey)">
                {{ displayName(passkey) }}
              </p>
              <UBadge v-if="checkedId === passkey.id" color="success" variant="subtle" icon="i-lucide-circle-check" :label="t('passkey.justVerified')" />
            </div>
            <p class="mt-1 text-xs text-muted">
              {{ passkey.lastUsedAt ? t('passkey.lastUsed', { date: new Date(passkey.lastUsedAt).toLocaleString() }) : t('passkey.neverUsed') }}
              ·
              {{ passkey.backedUp ? t('passkey.backedUp') : t('passkey.deviceOnly') }}
            </p>
            <p class="mt-0.5 text-xs text-dimmed">
              {{ t('passkey.createdAt', { date: new Date(passkey.createdAt).toLocaleDateString() }) }}
            </p>
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-pencil"
            :aria-label="t('passkey.renameLabel', { name: displayName(passkey) })"
            @click="renameError = null; rename = { id: passkey.id, name: displayName(passkey) }"
          />
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-trash-2"
            :disabled="!canRemove"
            :title="canRemove ? undefined : t('passkey.lastMethodHint')"
            :aria-label="t('passkey.removeLabel', { name: displayName(passkey) })"
            @click="confirmRemove = { id: passkey.id, name: displayName(passkey) }"
          />
        </div>
      </li>
    </ul>

    <UModal v-model:open="addOpen" :title="t('passkey.addTitle')" :description="t('passkey.addDescription')">
      <template #body>
        <form class="space-y-4" @submit.prevent="submitAdd">
          <UFormField :label="t('passkey.nameOptional')" :help="t('passkey.nameHint')" name="new-passkey-name">
            <UInput id="new-passkey-name" v-model="name" :maxlength="100" autocomplete="off" :placeholder="t('passkey.namePlaceholder')" autofocus class="w-full" />
          </UFormField>
          <UButton type="submit" :label="t('common.continue')" />
        </form>
      </template>
    </UModal>

    <UModal v-model:open="removeOpen" :title="t('passkey.removeTitle')" :description="t('passkey.removeDescription', { name: confirmRemove?.name ?? '' })">
      <template v-if="warnsLastSecondFactor" #body>
        <UAlert color="warning" variant="subtle" icon="i-lucide-triangle-alert" role="alert" :description="t('passkey.removeLastSecondFactorWarning')" />
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" :label="t('common.cancel')" @click="confirmRemove = null" />
          <UButton color="error" :label="t('passkey.remove')" @click="startRemove" />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="renameOpen" :title="t('passkey.renameTitle')" :description="t('passkey.renameDescription')">
      <template #body>
        <form v-if="rename" class="space-y-4" @submit.prevent="submitRename">
          <UFormField :label="t('passkey.name')" name="rename-passkey">
            <UInput id="rename-passkey" v-model="rename.name" :maxlength="100" required autofocus class="w-full" />
          </UFormField>
          <p v-if="renameError" role="alert" class="text-sm text-error">
            {{ renameError }}
          </p>
          <UButton type="submit" :disabled="renaming" :label="renaming ? t('common.pleaseWait') : t('common.save')" />
        </form>
      </template>
    </UModal>

    <SettingsAccountPasskeyFirstChoice v-model:open="choiceOpen" :totp-enabled="status.totpEnabled" @choose="choose" />

    <SettingsAccountStepUpDialog
      v-model:open="stepUpOpen"
      :has-password="status.passwordSet"
      :has-passkey="passkeys.length > 0"
      :require-second-factor="status.requireSecondFactor"
      :totp-enabled="status.totpEnabled"
      :action="stepUpAction"
      :title="stepUpTitle"
      :description="stepUpDescription"
      :step="stepUpStep"
      :on-authorized="authorized"
    />
  </div>
</template>
