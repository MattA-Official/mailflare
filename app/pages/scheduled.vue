<script setup lang="ts">
import { scheduledFolderConfig } from '~/utils/messages/folder-configs'

definePageMeta({ layout: 'dashboard', auth: { requireMailbox: true } })
</script>

<template>
  <MessagesSplitLayout :config="scheduledFolderConfig" />
</template>
