<script setup lang="ts">
import { starredFolderConfig } from '~/utils/messages/folder-configs'

definePageMeta({ layout: 'dashboard', auth: { requireMailbox: true } })
</script>

<template>
  <MessagesFolderPage :config="starredFolderConfig" />
</template>
