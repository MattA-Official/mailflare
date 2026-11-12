<script setup lang="ts">
// Renders sanitised email HTML inside a shadow root so its styles cannot leak into the app.
// Ported from legacy/src/components/messages/email-html-renderer.tsx.
import { prepareReaderEmailHtml } from '#lib/remote-images/reader'
import { collapseQuotedEmailHtml } from '~/utils/messages/quote-collapse-utils'

const props = withDefaults(defineProps<{
  html: string
  /** Tighter block spacing and no white page, for short internal text such as notes. */
  dense?: boolean
  preserveLeadingQuote?: boolean
  /** Load remote content without a click; the reader can still block it. */
  autoAllowRemote?: boolean
}>(), { dense: false, preserveLeadingQuote: false, autoAllowRemote: false })
/** Emitted when the reader chooses to load remote content. */
const emit = defineEmits<{ allowRemote: [] }>()

const BASE_STYLE = `
:host { display:block; min-width:0; isolation:isolate; contain:paint; }
:host(.mf-dark) { filter:invert(1) hue-rotate(180deg); }
:host(.mf-dark) img, :host(.mf-dark) video, :host(.mf-dark) picture { filter:invert(1) hue-rotate(180deg); }
.email-quote-toggle { margin-top:1.4em; }
.email-quote-toggle > summary { cursor:pointer; list-style:none; width:26px; border-radius:20px; background:#ececec; text-align:center; }
.email-quote-toggle > summary::-webkit-details-marker { display:none; }
.email-quote-toggle > summary::before { content:'•••'; }
.email-quote-content { display:flow-root; }
:host(.mf-dense) p { margin-top:0; }
`

const { t } = useLanguage()
const colorMode = useColorMode()
const host = ref<HTMLDivElement | null>(null)
const choice = ref<{ source: string, allow: boolean } | null>(null)
const hasRemote = ref(false)
const allowRemote = computed(() => (choice.value?.source === props.html ? choice.value.allow : props.autoAllowRemote))

// Mail is authored for white paper. Under the dark theme it is inverted (images inverted back)
// instead of glaring as a white slab.
watchEffect(() => {
  host.value?.classList.toggle('mf-dark', colorMode.value === 'dark')
})

function navigate(root: ShadowRoot, event: Event) {
  // Document fragment navigation does not find IDs inside a shadow tree on its own.
  const anchor = (event.target as Element | null)?.closest('a[href]')
  const href = anchor?.getAttribute('href')
  if (!href?.startsWith('#')) return
  event.preventDefault()
  try {
    const id = decodeURIComponent(href.slice(1))
    const destination = root.getElementById(id) ?? Array.from(root.querySelectorAll('a[name]')).find(node => node.getAttribute('name') === id)
    destination?.scrollIntoView({ block: 'start' })
  }
  catch { /* Ignore malformed fragments. */ }
}

watch([host, () => props.html, allowRemote, () => props.preserveLeadingQuote, () => t('message.quote.toggle')], ([element, html, allow, preserveLeadingQuote, toggleLabel], _previous, onCleanup) => {
  if (!element) return
  element.dir = document.documentElement.dir || 'ltr'
  const root = element.shadowRoot ?? element.attachShadow({ mode: 'open' })
  const prepared = prepareReaderEmailHtml(html, {
    reader: true,
    allowRemote: allow,
    proxyRemote: document.documentElement.dataset.remoteImageProxy !== 'disabled',
  })
  hasRemote.value = prepared.hasRemote
  const base = document.createElement('style')
  base.textContent = `${BASE_STYLE}\n${prepared.rootTag} { display:block; font:14px/1.5 Arial,sans-serif; color:#202124; background:#fff; color-scheme:light; }\n${prepared.bodyTag} { display:block; }\n:host(.mf-dark) ${prepared.rootTag} { background:transparent; }\n:host(.mf-dense) ${prepared.rootTag} { background:transparent; }`
  const content = document.createElement('template')
  content.innerHTML = collapseQuotedEmailHtml(prepared.html, preserveLeadingQuote, toggleLabel) ?? ''
  root.replaceChildren(base, content.content)
  const mailBody = root.querySelector(prepared.bodyTag)
  // An LTR scroller cannot reach left-side overflow from an RTL email.
  if (mailBody) element.dir = window.getComputedStyle(mailBody).direction
  const onClick = (event: Event) => navigate(root, event)
  root.addEventListener('click', onClick)
  onCleanup(() => root.removeEventListener('click', onClick))
}, { immediate: true, flush: 'post' })

function toggleRemote() {
  if (!allowRemote.value) emit('allowRemote')
  choice.value = { source: props.html, allow: !allowRemote.value }
}
</script>

<template>
  <div class="min-w-0 max-w-full">
    <div v-if="hasRemote && !allowRemote" class="mb-2 flex justify-end">
      <UButton size="xs" variant="ghost" :aria-pressed="allowRemote" :label="t('message.allowRemote')" @click="toggleRemote" />
    </div>
    <div ref="host" class="max-w-full overflow-x-auto" :class="dense && 'mf-dense'" />
  </div>
</template>
