<script setup lang="ts">
import { inboxFolderConfig } from '~/utils/messages/folder-configs'

definePageMeta({ layout: 'dashboard', auth: { requireMailbox: true } })
</script>

<template>
  <MessagesSplitLayout :config="inboxFolderConfig" />
</template>
