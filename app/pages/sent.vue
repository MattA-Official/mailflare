<script setup lang="ts">
import { sentFolderConfig } from '~/utils/messages/folder-configs'

definePageMeta({ layout: 'dashboard', auth: { requireMailbox: true } })
</script>

<template>
  <MessagesSplitLayout :config="sentFolderConfig" />
</template>
