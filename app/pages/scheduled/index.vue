<script setup lang="ts">
import { scheduledFolderConfig } from '~/utils/messages/folder-configs'

definePageMeta({ layout: 'dashboard', auth: { requireMailbox: true } })
</script>

<template>
  <MessagesFolderPage :config="scheduledFolderConfig" />
</template>
