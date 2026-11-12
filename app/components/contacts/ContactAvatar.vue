<script setup lang="ts">
// A contact's picture, or a coloured initial while there is none or it fails to load.
// Ported from legacy/src/components/contacts/contact-avatar.tsx.
import { twMerge } from 'tailwind-merge'
import { getAvatarColorStyle } from '#lib/avatar-colors'
import { CONTACT_AVATAR_CHANGED_EVENT } from '#lib/contacts/avatar-client'
import type { ContactAvatarChangedDetail } from '#lib/contacts/avatar-client-types'
import { normalizeEmailAddress } from '#lib/email/address'
import { getContactAvatarInitial, getManagedContactAvatarUrl } from '~/utils/contacts/contact-utils'

defineOptions({ inheritAttrs: false })
const attrs = useAttrs()
const props = withDefaults(defineProps<{
  mailboxId: string | null
  address: string
  name: string
  hasManagedAvatar?: boolean
  managedAvatarUrl?: string
}>(), { hasManagedAvatar: false, managedAvatarUrl: undefined })

const managedAvatar = ref(props.hasManagedAvatar)
const imageFailed = ref(false)
const avatarVersion = ref(0)

watch(() => [props.address, props.hasManagedAvatar, props.mailboxId, props.managedAvatarUrl], () => {
  managedAvatar.value = props.hasManagedAvatar
  imageFailed.value = false
  avatarVersion.value = 0
})

const avatarUrl = computed(() => {
  if (props.managedAvatarUrl) return props.managedAvatarUrl
  if (managedAvatar.value && props.mailboxId) return getManagedContactAvatarUrl(props.mailboxId, props.address, avatarVersion.value)
  return null
})
watch(avatarUrl, () => { imageFailed.value = false })

function onAvatarChanged(event: Event) {
  const detail = (event as CustomEvent<Partial<ContactAvatarChangedDetail>>).detail
  if (detail?.email === normalizeEmailAddress(props.address)) {
    managedAvatar.value = !!detail.hasAvatar
    avatarVersion.value = Date.now()
  }
}
onMounted(() => window.addEventListener(CONTACT_AVATAR_CHANGED_EVENT, onAvatarChanged))
onBeforeUnmount(() => window.removeEventListener(CONTACT_AVATAR_CHANGED_EVENT, onAvatarChanged))

function onError() {
  if (!props.managedAvatarUrl && managedAvatar.value) managedAvatar.value = false
  else imageFailed.value = true
}
</script>

<template>
  <span
    v-bind="{ ...attrs, class: undefined }"
    :class="twMerge('relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-semibold', attrs.class as string | undefined)"
    :style="getAvatarColorStyle(normalizeEmailAddress(address) || name)"
    aria-hidden="true"
  >
    {{ getContactAvatarInitial(name, address) }}
    <img v-if="avatarUrl && !imageFailed" :src="avatarUrl" alt="" class="absolute inset-0 size-full object-cover" @error="onError">
  </span>
</template>
