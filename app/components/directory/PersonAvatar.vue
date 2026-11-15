<script setup lang="ts">
// Fork-only. A colleague's directory photo, or their initial on a colour from their address.
import { directoryAvatarUrl } from '~/utils/directory/directory'

withDefaults(defineProps<{
  person: { id: string, name: string, email: string, hasAvatar: boolean }
  size?: 'sm' | 'md' | 'lg' | '3xl'
}>(), { size: 'md' })
</script>

<template>
  <AppAccountAvatar :name="person.name" :color-seed="person.email" :has-avatar="person.hasAvatar" :avatar-url="directoryAvatarUrl(person.id)" :size="size" />
</template>
