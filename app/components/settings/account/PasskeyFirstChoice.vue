<script setup lang="ts">
// Asks what should happen to password sign-in right after the first passkey is enrolled (or a
// password is added to a passkey-only account). The options depend on whether an authenticator
// app is set up. Ported from legacy/src/components/settings/passkey-first-choice.tsx.
import type { PasskeyPolicyChoice } from '~/types/settings/account'

const props = withDefaults(defineProps<{
  totpEnabled: boolean
  context?: 'first-passkey' | 'add-password'
  busy?: boolean
}>(), { context: 'first-passkey', busy: false })

const emit = defineEmits<{ choose: [choice: PasskeyPolicyChoice] }>()
// The dialog only closes by choosing, so there is no close button and no dismissal.
const open = defineModel<boolean>('open', { default: false })
const { t } = useLanguage()

interface Option { id: PasskeyPolicyChoice, title: string, hint: string, notes?: string[], icon: string, iconClass: string }

const addingPassword = computed(() => props.context === 'add-password')
const options = computed<Option[]>(() => props.totpEnabled && !addingPassword.value
  ? [
      { id: 'passkey-only', title: t('passkey.choicePasskeyOnly'), hint: t('passkey.choiceRemovesPasswordAndCodes'), notes: [t('passkey.choiceTwoSteps')], icon: 'i-lucide-key-round', iconClass: 'text-muted' },
      { id: 'keep', title: t('passkey.choiceKeepCurrent'), hint: t('passkey.choiceKeepCurrentHint'), icon: 'i-lucide-shield-check', iconClass: 'text-success' },
    ]
  : [
      {
        id: 'passkey-only',
        title: t(addingPassword.value ? 'passkey.choiceKeepPasskeysOnly' : 'passkey.choicePasskeyOnly'),
        hint: t(addingPassword.value ? 'passkey.choiceDiscardPassword' : 'passkey.choiceRemovesPassword'),
        icon: 'i-lucide-key-round',
        iconClass: 'text-muted',
      },
      {
        id: 'password-and-passkey',
        title: t('passkey.choicePasswordAndPasskey'),
        hint: t(props.totpEnabled ? 'twoStep.requireDescription' : 'passkey.choicePasswordAndPasskeyHint'),
        icon: 'i-lucide-shield-check',
        iconClass: 'text-success',
      },
      { id: 'keep', title: t('passkey.choiceKeepPasswordOnly'), hint: t('passkey.choiceKeepPasswordOnlyHint'), icon: 'i-lucide-triangle-alert', iconClass: 'text-warning' },
    ])
</script>

<template>
  <UModal
    v-model:open="open"
    :dismissible="false"
    :close="false"
    :title="t('passkey.firstChoiceTitle')"
    :description="t(addingPassword ? 'passkey.passwordChoiceDescription' : 'passkey.firstChoiceDescription')"
  >
    <template #body>
      <div :aria-busy="busy">
        <p class="mb-4 flex items-start gap-2 text-xs leading-5 text-muted">
          <UIcon name="i-lucide-info" class="mt-0.5 size-4 shrink-0" />
          <span>{{ t('passkey.choiceRecoveryNote') }}</span>
        </p>
        <div class="space-y-2">
          <button
            v-for="option in options"
            :key="option.id"
            type="button"
            :disabled="busy"
            class="flex w-full items-start gap-3 rounded-lg border border-default p-3 text-start transition-colors hover:bg-elevated/50 disabled:cursor-wait"
            @click="emit('choose', option.id)"
          >
            <UIcon :name="option.icon" class="mt-0.5 size-4 shrink-0" :class="option.iconClass" />
            <span class="min-w-0">
              <span class="block text-sm font-medium text-highlighted">{{ option.title }}</span>
              <span class="mt-0.5 block text-sm leading-5 text-muted">{{ option.hint }}</span>
              <span v-for="note in option.notes" :key="note" class="mt-1 flex items-start gap-1.5 text-xs leading-5 text-dimmed">
                <UIcon name="i-lucide-info" class="mt-0.5 size-3 shrink-0" />
                {{ note }}
              </span>
            </span>
          </button>
        </div>
      </div>
    </template>
  </UModal>
</template>
