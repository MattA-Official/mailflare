<script setup lang="ts">
// Ported from legacy/src/app/(admin)/mailboxes/[id]/MailboxAvatarForm.tsx.
import { dispatchMailboxAvatarChanged } from '#lib/mailboxes/avatar-client'
import { errorMessage } from '~/utils/admin/email/domains'
import { getMailboxAvatarUrl, MAILBOX_AVATAR_ACCEPT, uploadMailboxAvatar, validateMailboxAvatar } from '~/utils/admin/email/mailboxes'

const props = defineProps<{ mailboxId: string, hasAvatar: boolean, name: string }>()
const { t } = useLanguage()
const hasAvatar = ref(props.hasAvatar)
const avatarUrl = ref(`/api/mailboxes/${props.mailboxId}/avatar`)
const status = ref<string | null>(null)
const busy = ref(false)
const input = useTemplateRef<HTMLInputElement>('input')

watch(() => [props.hasAvatar, props.mailboxId] as const, ([has, id]) => {
  hasAvatar.value = has
  avatarUrl.value = `/api/mailboxes/${id}/avatar`
})

async function onPick(event: Event) {
  const target = event.target as HTMLInputElement
  const picked = target.files?.[0] ?? null
  target.value = ''
  if (!picked) return
  const validationError = validateMailboxAvatar(picked)
  if (validationError) {
    status.value = validationError
    return
  }
  busy.value = true
  status.value = null
  try {
    await uploadMailboxAvatar(props.mailboxId, picked)
    avatarUrl.value = getMailboxAvatarUrl(props.mailboxId)
    hasAvatar.value = true
    dispatchMailboxAvatarChanged(props.mailboxId, avatarUrl.value)
  } catch (error) {
    status.value = errorMessage(error, t('avatar.uploadFailed'))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex flex-col items-start gap-2">
    <input ref="input" type="file" :accept="MAILBOX_AVATAR_ACCEPT" class="hidden" @change="onPick">
    <button
      type="button"
      :disabled="busy"
      class="group relative size-24 overflow-hidden rounded-full border border-default bg-primary text-inverted shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-wait"
      :aria-label="hasAvatar ? t('avatar.change', { name }) : t('avatar.upload', { name })"
      @click="input?.click()"
    >
      <img v-if="hasAvatar" :src="avatarUrl" :alt="t('account.profilePicture', { name })" class="size-full object-cover" @error="hasAvatar = false">
      <span v-else class="flex size-full items-center justify-center">
        <UIcon name="i-lucide-user" class="size-9" />
      </span>
      <span class="absolute inset-0 flex items-center justify-center bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
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
