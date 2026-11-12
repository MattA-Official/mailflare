<script setup lang="ts">
// Ported from legacy/src/app/(dashboard)/drafts/[messageId]: the Drafts list with that draft open in
// the floating composer. Closing the composer returns to /drafts (see <ComposeHost>).
import { draftsFolderConfig } from '~/utils/messages/folder-configs'

definePageMeta({ layout: 'dashboard', auth: { requireMailbox: true } })

const route = useRoute()
const { openDraftComposer } = useCompose()
let openedDraft: string | null = null

watch(() => route.params.messageId as string, (draftId) => {
  if (!draftId || openedDraft === draftId) return
  openedDraft = draftId
  openDraftComposer(draftId)
}, { immediate: true })
</script>

<template>
  <MessagesFolderPage :config="draftsFolderConfig" />
</template>
