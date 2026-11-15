<script setup lang="ts">
// Initial-on-colour avatar with the uploaded image over it, as upstream's account lists draw them.
import { getAvatarColorStyle } from '#lib/avatar-colors'

const props = withDefaults(defineProps<{ name: string, email: string, src?: string | null, size?: 'md' | 'lg' | 'xl' }>(), { size: 'md', src: null })
// UAvatar falls back to the initial by itself when the picture fails to load.
const avatarSize = computed(() => ({ md: 'xl', lg: '3xl', xl: '3xl' } as const)[props.size])
</script>

<template>
  <UAvatar
    :src="src ?? undefined"
    alt=""
    :text="name.charAt(0).toUpperCase()"
    :size="avatarSize"
    :style="getAvatarColorStyle(email)"
    :class="{ md: 'text-base', lg: 'text-lg', xl: 'size-16 text-xl' }[size]"
    :ui="{ fallback: 'text-inherit font-semibold' }"
  />
</template>
