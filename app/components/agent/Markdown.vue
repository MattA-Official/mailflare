<script setup lang="ts">
// The assistant's reply as Markdown (GitHub flavour). Raw HTML and images are dropped, as upstream's
// react-markdown with skipHtml did; links to app paths navigate in place.
import DOMPurify from 'dompurify'
import { Marked } from 'marked'

const props = defineProps<{ content: string }>()
const router = useRouter()
const marked = new Marked({ gfm: true, async: false, renderer: { html: () => '', image: () => '' } })
const html = computed(() => DOMPurify.sanitize(marked.parse(props.content) as string))

function onClick(event: MouseEvent) {
  const anchor = (event.target as HTMLElement).closest('a')
  const href = anchor?.getAttribute('href')
  if (!href || !href.startsWith('/') || href.startsWith('//') || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
  event.preventDefault()
  void router.push(href)
}
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- sanitised by DOMPurify above -->
  <div class="agent-markdown break-words text-sm leading-relaxed text-highlighted" @click="onClick" v-html="html" />
</template>

<style scoped>
.agent-markdown :deep(a) { color: var(--ui-primary); }
.agent-markdown :deep(p), .agent-markdown :deep(ul), .agent-markdown :deep(ol), .agent-markdown :deep(pre), .agent-markdown :deep(table) { margin-bottom: 0.75rem; }
.agent-markdown :deep(li) { margin-left: 1rem; list-style: disc; }
.agent-markdown :deep(ol > li) { list-style: decimal; }
.agent-markdown :deep(hr) { margin: 1.6em 0; border-color: var(--ui-border); }
.agent-markdown :deep(code) { font-size: 0.85em; }
.agent-markdown :deep(pre) { overflow-x: auto; border-radius: 0.5rem; background: var(--ui-bg-muted); padding: 0.75rem; }
.agent-markdown :deep(h1), .agent-markdown :deep(h2), .agent-markdown :deep(h3) { font-weight: 600; margin: 1rem 0 0.5rem; }
.agent-markdown :deep(table) { border-collapse: collapse; }
.agent-markdown :deep(th), .agent-markdown :deep(td) { border: 1px solid var(--ui-border); padding: 0.25rem 0.5rem; }
</style>
