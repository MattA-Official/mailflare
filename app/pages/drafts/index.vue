<script setup lang="ts">
// The drafts list. Opening a draft goes to the composer's drafts/[messageId] page.
import { draftsFolderConfig } from '~/utils/messages/folder-configs'

definePageMeta({ layout: 'dashboard', auth: { requireMailbox: true } })
</script>

<template>
  <MessagesFolderPage :config="draftsFolderConfig" />
</template>
