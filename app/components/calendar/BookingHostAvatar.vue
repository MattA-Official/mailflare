<script setup lang="ts">
// Host avatar: the uploaded picture when there is one, else a coloured initial.
// Ported from legacy/src/app/(calendar)/booking/booking-host-avatar.tsx.
import { getAvatarColorStyle } from '#lib/avatar-colors'
import type { BookingHost } from '~/types/calendar'

const props = withDefaults(defineProps<{ host: BookingHost, currentUserId: string, size?: 'small' | 'medium' }>(), { size: 'medium' })
const { t } = useLanguage()
const src = computed(() => props.host.hasAvatar ? (props.host.id === props.currentUserId ? '/api/profile/avatar' : `/api/accounts/${props.host.id}/avatar`) : undefined)
const label = computed(() => props.host.name || props.host.email)
</script>

<template>
  <UAvatar
    :src="src"
    :alt="t('account.profilePicture', { name: label })"
    :text="label.slice(0, 1).toUpperCase()"
    :size="size === 'small' ? '2xs' : 'md'"
    :style="src ? undefined : getAvatarColorStyle(host.email)"
    class="shrink-0"
  />
</template>
