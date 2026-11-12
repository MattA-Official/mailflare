<script setup lang="ts">
// A user-created folder. Ported from legacy/src/app/(dashboard)/folders/[folderId]/layout.tsx and
// use-custom-folder-config.ts.
import { useCustomFolderConfig } from '~/composables/messages/useCustomFolderConfig'

definePageMeta({ layout: 'dashboard', auth: { requireMailbox: true } })
const route = useRoute()
const config = useCustomFolderConfig(() => String(route.params.folderId))
</script>

<template>
  <MessagesSplitLayout :config="config" />
</template>
