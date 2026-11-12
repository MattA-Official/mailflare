<script setup lang="ts">
// The folded quote under a message composed in Mailflare. Ported from quoted-email-toggle.tsx.
defineProps<{ html: string, autoAllowRemote?: boolean }>()
const emit = defineEmits<{ allowRemote: [] }>()
const { t } = useLanguage()
</script>

<template>
  <details class="email-quote-toggle">
    <summary :aria-label="t('message.quote.toggle')" :title="t('message.quote.title')" />
    <MessagesEmailHtmlRenderer :html="html" preserve-leading-quote :auto-allow-remote="autoAllowRemote" @allow-remote="emit('allowRemote')" />
  </details>
</template>

<style>
/* Upstream kept these in globals.css; the same rules live inside the email shadow root. */
.email-quote-toggle { margin-top: 1.4em; }
.email-quote-toggle > summary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 12px;
  border-radius: 9999px;
  background: var(--ui-bg-accented);
  color: var(--ui-text-toned);
  cursor: pointer;
  list-style: none;
}
.email-quote-toggle > summary::-webkit-details-marker { display: none; }
.email-quote-toggle > summary::marker { content: ""; }
.email-quote-toggle > summary::before {
  content: "•••";
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  transform: translateY(-0.5px);
}
.email-quote-toggle > summary:focus-visible {
  outline: 2px solid var(--ui-primary);
  outline-offset: 2px;
}
</style>
