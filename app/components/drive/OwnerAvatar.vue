<script setup lang="ts">
// Owner's profile picture (or a coloured initial), with "me" or their name on hover.
// Ported from legacy/src/app/(drive)/drive-owner-avatar.tsx.
import { getAvatarColorStyle } from '#lib/avatar-colors'
import type { DriveItemDto } from '#lib/drive/types'

const props = defineProps<{ item: Pick<DriveItemDto, 'ownerId' | 'ownerName' | 'ownerHasAvatar' | 'role'> }>()
const { t } = useLanguage()
const failed = ref(false)
const label = computed(() => props.item.role === 'owner' ? t('drive.me') : props.item.ownerName)
</script>

<template>
  <UTooltip :text="label">
    <img
      v-if="item.ownerHasAvatar && !failed"
      :src="`/api/drive/owners/${encodeURIComponent(item.ownerId)}/avatar`"
      :alt="label"
      class="size-6 shrink-0 rounded-full object-cover"
      @error="failed = true"
    >
    <span
      v-else
      role="img"
      :aria-label="label"
      class="flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
      :style="getAvatarColorStyle(item.ownerName || item.ownerId)"
    >{{ (item.ownerName.trim().slice(0, 1) || '?').toUpperCase() }}</span>
  </UTooltip>
</template>
