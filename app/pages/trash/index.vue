<script setup lang="ts">
import { trashFolderConfig } from '~/utils/messages/folder-configs'

definePageMeta({ layout: 'dashboard', auth: { requireMailbox: true } })
</script>

<template>
  <MessagesFolderPage :config="trashFolderConfig" />
</template>
