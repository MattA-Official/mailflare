<script setup lang="ts">
// Mounted once in the dashboard layout: the send toast, the floating composer and, on mail pages, the
// phone Compose button. Ported from legacy/src/components/compose/floating-composer.tsx.
const { open, draftId, notice, openComposer, closeComposer } = useCompose()
const { t } = useLanguage()
const route = useRoute()
const router = useRouter()
const showButton = computed(() => (route.meta.nav ?? 'mail') === 'mail')

function onClose() {
  closeComposer()
  if (/^\/drafts\/[^/]+\/?$/.test(route.path)) void router.replace('/drafts')
}
</script>

<template>
  <button
    v-if="showButton && !open"
    type="button"
    :aria-label="t('navigation.compose')"
    class="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-30 flex h-12 items-center gap-3 rounded-2xl bg-primary/15 px-5 text-base font-medium text-highlighted shadow-sm backdrop-blur transition-colors hover:bg-primary/25 md:hidden"
    @click="openComposer"
  >
    <UIcon name="i-lucide-mail-plus" class="size-5" />
    {{ t('navigation.compose') }}
  </button>
  <ComposeNoticeToast v-if="notice" :key="notice.id" :notice="notice" />
  <ComposeForm v-if="open" :key="draftId ?? 'new'" mode="popup" :draft-id-to-load="draftId" @close="onClose" />
</template>
