<script setup lang="ts">
import { useCustomFolderConfig } from '~/composables/messages/useCustomFolderConfig'

definePageMeta({ layout: 'dashboard', auth: { requireMailbox: true } })
const route = useRoute()
const config = useCustomFolderConfig(() => String(route.params.folderId))
</script>

<template>
  <MessagesFolderPage :config="config" />
</template>
