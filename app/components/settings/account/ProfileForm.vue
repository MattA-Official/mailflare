<script setup lang="ts">
// Name and picture of the selected inbox, plus the account's recovery email when that inbox is the
// primary one. Ported from legacy/src/components/settings/profile-form.tsx.
import { dispatchProfileNameChanged } from '#lib/profile/name-client'
import { updateProfile } from '~/utils/settings/account/account'
import { getMailboxAddress, updateCurrentMailboxName } from '~/utils/settings/account/mailbox'

const props = defineProps<{ accountName: string, initialResetEmail: string }>()
const { t } = useLanguage()
const { selectedMailbox, setSelectedMailbox, isLoading } = useSelectedMailbox()

const name = ref('')
const savedName = ref('')
const resetEmail = ref(props.initialResetEmail)
const savedResetEmail = ref(props.initialResetEmail)
const profileStatus = ref<string | null>(null)
const recoveryStatus = ref<string | null>(null)
const savingProfile = ref(false)
const savingRecovery = ref(false)

watch(() => [selectedMailbox.value?.id, selectedMailbox.value?.displayName] as const, ([, displayName]) => {
  name.value = displayName ?? ''
  savedName.value = displayName ?? ''
  profileStatus.value = null
}, { immediate: true })

// Name and avatar belong to the selected inbox. Only the primary inbox is the account itself, so
// the recovery email applies to it alone.
const isPrimary = computed(() => !!selectedMailbox.value?.isPrimary && selectedMailbox.value.type === 'personal')
const canManage = computed(() => selectedMailbox.value?.permission === 'full_access')
const address = computed(() => selectedMailbox.value ? getMailboxAddress(selectedMailbox.value) : '')

async function submitProfile() {
  const mailbox = selectedMailbox.value
  if (!mailbox) return
  savingProfile.value = true
  profileStatus.value = null
  try {
    const updated = await updateCurrentMailboxName(mailbox.id, name.value)
    setSelectedMailbox({ ...mailbox, ...updated })
    name.value = updated.displayName ?? ''
    savedName.value = updated.displayName ?? ''
    // The primary inbox is the account, so its name is the profile name.
    if (isPrimary.value) dispatchProfileNameChanged(updated.displayName ?? '')
    profileStatus.value = t('common.saved')
  } catch (error) {
    profileStatus.value = error instanceof Error ? error.message : t('settings.profile.updateFailed')
  } finally {
    savingProfile.value = false
  }
}

async function submitRecovery() {
  savingRecovery.value = true
  recoveryStatus.value = null
  try {
    const saved = await updateProfile(props.accountName, resetEmail.value)
    resetEmail.value = saved
    savedResetEmail.value = saved
    recoveryStatus.value = t('common.saved')
  } catch (error) {
    recoveryStatus.value = error instanceof Error ? error.message : t('settings.profile.recoveryFailed')
  } finally {
    savingRecovery.value = false
  }
}
</script>

<template>
  <UCard v-if="isLoading || !selectedMailbox">
    <p class="text-sm text-muted">
      {{ isLoading ? t('settings.signature.loadingInbox') : t('settings.signature.selectInbox') }}
    </p>
  </UCard>
  <template v-else>
    <UCard>
      <form class="space-y-6" @submit.prevent="submitProfile">
        <SettingsAccountInboxSwitcher />
        <div class="flex items-center gap-4">
          <SettingsAccountProfileAvatarForm
            :mailbox-id="selectedMailbox.id"
            :initial-has-avatar="!!selectedMailbox.hasAvatar"
            :name="savedName || selectedMailbox.localPart"
            :color-seed="address"
          />
          <div>
            <p class="text-sm font-medium text-highlighted">
              {{ t('settings.profile.pictureTitle') }}
            </p>
            <p class="mt-1 text-sm text-muted">
              {{ t('settings.profile.pictureDescription') }}
            </p>
          </div>
        </div>
        <UFormField :label="t('common.name')" name="name">
          <UInput
            id="name"
            v-model="name"
            autocomplete="name"
            :placeholder="selectedMailbox.localPart"
            :required="isPrimary"
            :disabled="!canManage || savingProfile"
            class="w-full"
          />
        </UFormField>
        <UFormField :label="t('settings.profile.currentEmail')" name="accountEmail">
          <UInput id="accountEmail" :model-value="address" type="email" autocomplete="email" readonly aria-readonly="true" variant="soft" class="w-full" />
        </UFormField>
        <div class="flex items-center gap-3">
          <UButton
            type="submit"
            :disabled="!canManage || savingProfile || name.trim() === savedName"
            :label="savingProfile ? t('common.saving') : t('settings.profile.save')"
          />
          <p v-if="profileStatus" class="text-sm text-muted">
            {{ profileStatus }}
          </p>
        </div>
      </form>
    </UCard>

    <UCard v-if="isPrimary">
      <form class="space-y-4" @submit.prevent="submitRecovery">
        <div>
          <h3 class="text-lg font-semibold text-highlighted">
            {{ t('settings.profile.recoveryTitle') }}
          </h3>
          <p class="mt-1 text-sm text-muted">
            {{ t('settings.profile.recoveryDescription') }}
          </p>
        </div>
        <UFormField :label="t('settings.profile.emailAddress')" name="resetEmail">
          <UInput id="resetEmail" v-model="resetEmail" type="email" autocomplete="email" placeholder="recovery@example.com" class="w-full" />
        </UFormField>
        <div class="flex items-center gap-3">
          <UButton
            type="submit"
            :disabled="savingRecovery || resetEmail.trim() === savedResetEmail"
            :label="savingRecovery ? t('common.saving') : t('settings.profile.saveRecovery')"
          />
          <p v-if="recoveryStatus" class="text-sm text-muted">
            {{ recoveryStatus }}
          </p>
        </div>
      </form>
    </UCard>
  </template>
</template>
