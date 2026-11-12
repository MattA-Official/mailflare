<script setup lang="ts">
import { spamFolderConfig } from '~/utils/messages/folder-configs'

definePageMeta({ layout: 'dashboard', auth: { requireMailbox: true } })
</script>

<template>
  <MessagesFolderPage :config="spamFolderConfig" />
</template>
