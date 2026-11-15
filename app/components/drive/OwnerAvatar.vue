<script setup lang="ts">
// Owner's profile picture (or a coloured initial), with "me" or their name on hover.
// Ported from legacy/src/app/(drive)/drive-owner-avatar.tsx.
import { getAvatarColorStyle } from '#lib/avatar-colors'
import type { DriveItemDto } from '#lib/drive/types'

const props = defineProps<{ item: Pick<DriveItemDto, 'ownerId' | 'ownerName' | 'ownerHasAvatar' | 'role'> }>()
const { t } = useLanguage()
const label = computed(() => props.item.role === 'owner' ? t('drive.me') : props.item.ownerName)
</script>

<template>
  <UTooltip :text="label">
    <UAvatar
      :src="item.ownerHasAvatar ? `/api/drive/owners/${encodeURIComponent(item.ownerId)}/avatar` : undefined"
      :alt="label"
      :text="(item.ownerName.trim().slice(0, 1) || '?').toUpperCase()"
      size="xs"
      role="img"
      :aria-label="label"
      :style="getAvatarColorStyle(item.ownerName || item.ownerId)"
      :ui="{ fallback: 'text-inherit font-semibold' }"
    />
  </UTooltip>
</template>
