<script setup lang="ts">
// Renders an HTML signature through the reader's sanitiser into a shadow root, as upstream's
// EmailHtmlRenderer does for the signature preview (without quote folding, which a signature never needs).
import { prepareReaderEmailHtml } from '#lib/remote-images/reader'

const props = defineProps<{ html: string }>()
const host = ref<HTMLDivElement | null>(null)

function render() {
  if (!host.value) return
  const root = host.value.shadowRoot ?? host.value.attachShadow({ mode: 'open' })
  const prepared = prepareReaderEmailHtml(props.html, { reader: true, allowRemote: false })
  const style = document.createElement('style')
  style.textContent = `:host { display:block; min-width:0; } ${prepared.rootTag} { display:block; font:14px/1.5 Arial,sans-serif; color:#202124; background:#fff; color-scheme:light; } ${prepared.bodyTag} { display:block; }`
  const content = document.createElement('template')
  content.innerHTML = prepared.html
  root.replaceChildren(style, content.content)
}

onMounted(render)
watch(() => props.html, render)
</script>

<template>
  <div ref="host" class="rounded-md border border-default bg-white p-4 text-sm" />
</template>
