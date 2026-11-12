<script setup lang="ts">
// Initial-on-colour avatar with the uploaded image over it, as upstream's account lists draw them.
import { getAvatarColorStyle } from '#lib/avatar-colors'

const props = withDefaults(defineProps<{ name: string, email: string, src?: string | null, size?: 'md' | 'lg' | 'xl' }>(), { size: 'md', src: null })
const failed = ref(false)
watch(() => props.src, () => {
  failed.value = false
})
const sizeClass = computed(() => ({ md: 'size-10 text-base', lg: 'size-12 text-lg', xl: 'size-16 text-xl' })[props.size])
</script>

<template>
  <span :style="getAvatarColorStyle(email)" class="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold" :class="sizeClass">
    {{ name.charAt(0).toUpperCase() }}
    <img v-if="src && !failed" :src="src" alt="" class="absolute inset-0 size-full object-cover" @error="failed = true">
  </span>
</template>
