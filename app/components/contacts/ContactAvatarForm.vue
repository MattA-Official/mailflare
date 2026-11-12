<script setup lang="ts">
// Upload or remove the picture shown for a contact. Ported from
// legacy/src/components/contacts/contact-avatar-form.tsx.
import { dispatchContactAvatarChanged } from '#lib/contacts/avatar-client'
import { normalizeEmailAddress } from '#lib/email/address'
import { CONTACT_AVATAR_ACCEPT, removeContactAvatar, uploadContactAvatar, validateContactAvatar } from '~/utils/contacts/contact-utils'

const props = defineProps<{ mailboxId: string, address: string, name: string, hasAvatar: boolean }>()
const emit = defineEmits<{ avatarChange: [hasAvatar: boolean] }>()

const { t } = useLanguage()
const input = useTemplateRef<HTMLInputElement>('input')
const busy = ref(false)
const status = ref<string | null>(null)

async function run(task: () => Promise<void>, hasAvatar: boolean, fallback: string) {
  busy.value = true
  status.value = null
  try {
    await task()
    emit('avatarChange', hasAvatar)
    dispatchContactAvatarChanged({ email: normalizeEmailAddress(props.address), hasAvatar })
  } catch (error) {
    status.value = error instanceof Error ? error.message : fallback
  } finally {
    busy.value = false
  }
}

function onPick(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0] ?? null
  target.value = ''
  if (!file) return
  const validationError = validateContactAvatar(file)
  if (validationError) {
    status.value = validationError
    return
  }
  void run(() => uploadContactAvatar(props.mailboxId, props.address, file), true, t('avatar.uploadFailed'))
}
</script>

<template>
  <div class="flex flex-col items-start gap-2">
    <input ref="input" type="file" :accept="CONTACT_AVATAR_ACCEPT" class="hidden" @change="onPick">
    <div class="flex items-center gap-3">
      <button
        type="button"
        :disabled="busy"
        class="group relative size-14 overflow-hidden rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-wait"
        :aria-label="hasAvatar ? t('avatar.change', { name }) : t('avatar.upload', { name })"
        @click="input?.click()"
      >
        <ContactsContactAvatar :mailbox-id="mailboxId" :address="address" :name="name" :has-managed-avatar="hasAvatar" class="size-14 text-lg" />
        <span class="absolute inset-0 flex items-center justify-center bg-neutral-950/55 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <UIcon :name="busy ? 'i-lucide-loader-circle' : 'i-lucide-camera'" class="size-5 text-white" :class="{ 'animate-spin': busy }" />
        </span>
      </button>
      <div>
        <p class="text-sm font-medium text-highlighted">{{ t('avatar.title') }}</p>
        <p class="text-xs text-muted">{{ t('avatar.contactHint') }}</p>
        <UButton
          v-if="hasAvatar"
          variant="link"
          size="xs"
          class="mt-1 px-0"
          :disabled="busy"
          :label="t('avatar.remove')"
          @click="run(() => removeContactAvatar(mailboxId, address), false, t('avatar.removeFailed'))"
        />
      </div>
    </div>
    <p v-if="status" role="alert" class="text-xs text-error">{{ status }}</p>
  </div>
</template>
