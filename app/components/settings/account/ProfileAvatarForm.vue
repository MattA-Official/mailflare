<script setup lang="ts">
// Upload control for a mailbox picture (or, without a mailbox, the profile picture).
// Ported from legacy/src/components/settings/profile-avatar-form.tsx.
import { getAvatarColorStyle } from '#lib/avatar-colors'
import { dispatchMailboxAvatarChanged } from '#lib/mailboxes/avatar-client'
import { dispatchProfileAvatarChanged, getProfileAvatarUrl } from '#lib/profile/avatar-client'
import { getMailboxProfileAvatarUrl, PROFILE_AVATAR_ACCEPT, uploadMailboxProfileAvatar, uploadProfileAvatar, validateProfileAvatar } from '~/utils/settings/account/avatar'

const props = withDefaults(defineProps<{
  mailboxId?: string
  initialHasAvatar?: boolean
  name?: string
  colorSeed?: string
}>(), { mailboxId: undefined, initialHasAvatar: false, name: undefined, colorSeed: undefined })

const { t } = useLanguage()
const displayName = computed(() => props.name ?? t('avatar.profile'))
const hasAvatar = ref(props.initialHasAvatar)
const avatarUrl = ref(props.mailboxId ? `/api/mailboxes/${props.mailboxId}/avatar` : '/api/profile/avatar')
const status = ref<string | null>(null)
const busy = ref(false)
const input = ref<HTMLInputElement | null>(null)

watch(() => [props.mailboxId, props.initialHasAvatar] as const, async ([mailboxId, initial]) => {
  if (mailboxId) {
    hasAvatar.value = initial
    avatarUrl.value = `/api/mailboxes/${mailboxId}/avatar`
    return
  }
  try {
    const response = await authFetch('/api/auth/me', { redirectOnUnauthorized: false })
    const data = response.ok ? (await response.json()) as { user?: { hasAvatar?: boolean } } : null
    hasAvatar.value = !!data?.user?.hasAvatar
  } catch {
    hasAvatar.value = false
  }
}, { immediate: true })

async function onPick(event: Event) {
  const target = event.target as HTMLInputElement
  const picked = target.files?.[0] ?? null
  target.value = ''
  if (!picked) return
  const validationError = validateProfileAvatar(picked)
  if (validationError) {
    status.value = validationError
    return
  }
  busy.value = true
  status.value = null
  try {
    if (props.mailboxId) await uploadMailboxProfileAvatar(props.mailboxId, picked)
    else await uploadProfileAvatar(picked)
    const nextUrl = props.mailboxId ? getMailboxProfileAvatarUrl(props.mailboxId) : getProfileAvatarUrl()
    avatarUrl.value = nextUrl
    hasAvatar.value = true
    if (props.mailboxId) dispatchMailboxAvatarChanged(props.mailboxId, nextUrl)
    else dispatchProfileAvatarChanged(nextUrl)
  } catch (error) {
    status.value = error instanceof Error ? error.message : t('avatar.uploadFailed')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex flex-col items-start gap-2">
    <input ref="input" type="file" :accept="PROFILE_AVATAR_ACCEPT" class="hidden" @change="onPick">
    <button
      type="button"
      :disabled="busy"
      class="group relative size-24 overflow-hidden rounded-full border border-default shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-wait"
      :style="getAvatarColorStyle(colorSeed ?? mailboxId ?? displayName)"
      :aria-label="hasAvatar ? t('avatar.change', { name: displayName }) : t('avatar.upload', { name: displayName })"
      @click="input?.click()"
    >
      <img
        v-if="hasAvatar"
        :src="avatarUrl"
        :alt="t('account.profilePicture', { name: displayName })"
        class="size-full object-cover"
        @error="hasAvatar = false"
      >
      <span v-else class="flex size-full items-center justify-center">
        <UIcon name="i-lucide-user" class="size-9" />
      </span>
      <span class="absolute inset-0 flex items-center justify-center bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" :class="{ 'opacity-100': busy }">
        <UIcon v-if="busy" name="i-lucide-loader-circle" class="size-6 animate-spin" />
        <span v-else class="flex flex-col items-center gap-1 text-[11px] font-medium">
          <UIcon name="i-lucide-camera" class="size-5" />
          {{ hasAvatar ? t('avatar.changeShort') : t('avatar.uploadShort') }}
        </span>
      </span>
    </button>
    <p v-if="status" role="alert" class="max-w-xs text-xs text-error">
      {{ status }}
    </p>
  </div>
</template>
