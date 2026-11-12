<script setup lang="ts">
// The header button that opens and closes the email assistant; hidden when it is not available.
const { t } = useLanguage()
const { enabled, open, toggle } = useAssistant()
</script>

<template>
  <UButton
    v-if="enabled"
    icon="i-lucide-sparkles"
    :color="open ? 'primary' : 'neutral'"
    :variant="open ? 'soft' : 'ghost'"
    :aria-label="open ? t('agent.assistant.close') : t('agent.assistant.open')"
    :aria-expanded="open"
    aria-controls="email-assistant-panel"
    @click="toggle()"
  />
</template>
