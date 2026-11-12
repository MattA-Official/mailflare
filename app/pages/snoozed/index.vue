<script setup lang="ts">
import { snoozedFolderConfig } from '~/utils/messages/folder-configs'

definePageMeta({ layout: 'dashboard', auth: { requireMailbox: true } })
</script>

<template>
  <MessagesFolderPage :config="snoozedFolderConfig" />
</template>
