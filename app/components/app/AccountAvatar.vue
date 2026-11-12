<script setup lang="ts">
// A mailbox or account avatar: the uploaded picture, else the initial on a colour derived from the
// address (upstream mailbox-selector AccountAvatar). `placeholder` shows a neutral icon while the
// mailbox identity is still loading, so the chip never flips from one initial to another.
import { getAvatarColorStyle } from '#lib/avatar-colors'

const props = withDefaults(defineProps<{
  name: string
  colorSeed?: string
  hasAvatar?: boolean
  avatarUrl?: string
  size?: 'sm' | 'md' | 'lg' | '3xl'
  placeholder?: boolean
}>(), { size: 'md', avatarUrl: '/api/profile/avatar', colorSeed: undefined })
const emit = defineEmits<{ error: [] }>()

const { t } = useLanguage()
const failed = ref(false)
watch(() => [props.avatarUrl, props.hasAvatar], () => {
  failed.value = false
})
const initial = computed(() => props.name.trim().slice(0, 1).toUpperCase() || 'M')
const colors = computed(() => getAvatarColorStyle(props.colorSeed ?? props.name))
</script>

<template>
  <UAvatar
    v-if="hasAvatar && !failed"
    :src="avatarUrl"
    :alt="t('account.profilePicture', { name })"
    :size="size"
    @error="failed = true; emit('error')"
  />
  <UAvatar v-else-if="placeholder" icon="i-lucide-user-round" :size="size" aria-hidden="true" />
  <UAvatar v-else :text="initial" :size="size" aria-hidden="true" :style="colors" />
</template>
