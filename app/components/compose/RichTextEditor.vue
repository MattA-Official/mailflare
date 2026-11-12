<script setup lang="ts">
// A small HTML editor built on contentEditable, ported from
// legacy/src/components/compose/rich-text-editor.tsx. It stays deliberately light: inline styles,
// lists, quotes and links, with pasted content flattened to text so a message never carries another
// site's markup. Nuxt UI's UEditor (TipTap) is not used: its schema would drop the
// data-mailflare-signature and quote markers and rewrite arbitrary email HTML in drafts.
import { sanitizeEditorHtml, sanitizeEmailHtml } from '#lib/email/html'
import type { TranslationKey } from '#lib/i18n/types'

interface ToolbarCommand { command: string, labelKey: TranslationKey, icon: string, value?: string }

const COMMANDS: ToolbarCommand[] = [
  { command: 'bold', labelKey: 'editor.bold', icon: 'i-lucide-bold' },
  { command: 'italic', labelKey: 'editor.italic', icon: 'i-lucide-italic' },
  { command: 'underline', labelKey: 'editor.underline', icon: 'i-lucide-underline' },
  { command: 'strikeThrough', labelKey: 'editor.strikethrough', icon: 'i-lucide-strikethrough' },
  { command: 'insertUnorderedList', labelKey: 'editor.bulletedList', icon: 'i-lucide-list' },
  { command: 'insertOrderedList', labelKey: 'editor.numberedList', icon: 'i-lucide-list-ordered' },
  { command: 'formatBlock', labelKey: 'editor.quote', icon: 'i-lucide-quote', value: 'blockquote' },
]

defineProps<{
  id: string
  /** Quoted or forwarded HTML shown folded under the editable area. */
  quotedHtml?: string | null
  disabled?: boolean
  placeholder?: string
}>()
const model = defineModel<string>({ required: true })
const { t } = useLanguage()
const editor = useTemplateRef<HTMLDivElement>('editor')
const active = ref<Record<string, boolean>>({})
const linkOpen = ref(false)
const linkUrl = ref('')
const showQuoted = ref(false)
let savedRange: Range | null = null
// The value this editor last emitted. Something else may add attributes to the editor DOM (browser
// extensions do), so comparing innerHTML would rewrite it on every keystroke and move the caret.
let lastEmitted: string | null = null

// Keep the DOM in step with the value without resetting the caret on every keystroke.
watch([model, editor], () => {
  const element = editor.value
  if (!element) return
  if (lastEmitted !== null && model.value === lastEmitted) return
  const safeValue = sanitizeEditorHtml(model.value)
  if (element.innerHTML !== safeValue) element.innerHTML = safeValue
  lastEmitted = null
}, { immediate: true, flush: 'post' })

function refresh() {
  const element = editor.value
  if (!element || !element.contains(document.activeElement)) return
  const next: Record<string, boolean> = {}
  for (const item of COMMANDS) {
    next[item.command] = item.command === 'formatBlock'
      ? document.queryCommandValue('formatBlock').toLowerCase() === 'blockquote'
      : document.queryCommandState(item.command)
  }
  active.value = next
}
onMounted(() => document.addEventListener('selectionchange', refresh))
onBeforeUnmount(() => document.removeEventListener('selectionchange', refresh))

function emit() {
  // Export validated original resource addresses, never the blocked preview placeholders.
  const output = sanitizeEmailHtml(editor.value?.innerHTML ?? '', { forOutgoing: true }) ?? ''
  lastEmitted = output
  model.value = output
}

function run(command: string, commandValue?: string) {
  editor.value?.focus()
  if (command === 'formatBlock' && active.value.formatBlock) document.execCommand('formatBlock', false, 'div')
  else document.execCommand(command, false, commandValue)
  emit()
}

function openLink() {
  const selection = window.getSelection()
  savedRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null
  linkUrl.value = ''
  linkOpen.value = true
}

function applyLink() {
  const url = linkUrl.value.trim()
  linkOpen.value = false
  if (!url) return
  const href = /^(https?:|mailto:)/i.test(url) ? url : `https://${url}`
  editor.value?.focus()
  const selection = window.getSelection()
  if (savedRange && selection) {
    selection.removeAllRanges()
    selection.addRange(savedRange)
  }
  if (selection && selection.isCollapsed) {
    // The URL field is untrusted text: build the anchor with DOM APIs so it is never parsed as HTML.
    const anchor = document.createElement('a')
    anchor.setAttribute('href', href)
    anchor.textContent = href
    document.execCommand('insertHTML', false, anchor.outerHTML)
  } else {
    document.execCommand('createLink', false, href)
  }
  emit()
}

function onPaste(event: ClipboardEvent) {
  event.preventDefault()
  document.execCommand('insertText', false, event.clipboardData?.getData('text/plain') ?? '')
}

function onKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    // The window-level Cmd/Ctrl+K would also open the command palette over the link popup.
    event.preventDefault()
    event.stopPropagation()
    openLink()
  }
}

defineExpose({ focus: () => editor.value?.focus() })
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="sticky top-0 z-10 flex shrink-0 items-center gap-0.5 overflow-x-auto bg-default px-2 py-1 md:hidden">
      <ComposeFormatButtons :commands="COMMANDS" :active="active" :disabled="disabled" @run="run" @link="openLink" />
    </div>
    <div class="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div
        :id="id"
        ref="editor"
        role="textbox"
        aria-multiline="true"
        :aria-label="t('editor.messageBody')"
        :contenteditable="!disabled"
        :data-placeholder="placeholder"
        class="compose-editor max-w-none min-h-32 grow shrink-0 px-4 py-3 text-sm text-highlighted outline-none empty:before:pointer-events-none empty:before:text-dimmed empty:before:content-[attr(data-placeholder)]"
        :class="disabled && 'cursor-not-allowed opacity-60'"
        @input="emit"
        @blur="emit"
        @paste="onPaste"
        @keydown="onKeydown"
      />
      <div v-if="quotedHtml" class="shrink-0 px-4 pb-3">
        <button
          type="button"
          :aria-expanded="showQuoted"
          :aria-label="showQuoted ? t('editor.hideQuoted') : t('editor.showQuoted')"
          :title="showQuoted ? t('editor.hideQuoted') : t('editor.showQuoted')"
          class="rounded-full border border-default bg-elevated px-2 text-xs leading-5 text-muted hover:bg-accented"
          @click="showQuoted = !showQuoted"
        >
          •••
        </button>
        <MessagesEmailHtmlRenderer v-if="showQuoted" class="mt-2" :html="quotedHtml" preserve-leading-quote />
      </div>
    </div>
    <slot name="footer" />
    <div class="relative flex items-center gap-0.5 border-t border-default px-4 py-3 max-md:gap-2 max-md:border-t-0">
      <slot name="toolbar-start" />
      <div class="contents max-md:hidden">
        <ComposeFormatButtons :commands="COMMANDS" :active="active" :disabled="disabled" @run="run" @link="openLink" />
      </div>
      <slot name="toolbar-end" />
      <div v-if="linkOpen" class="absolute bottom-full left-2 z-10 mb-1 flex items-center gap-2 rounded-lg border border-default bg-default p-2 shadow-lg">
        <UInput
          v-model="linkUrl"
          placeholder="https://example.com"
          :aria-label="t('editor.insertLink')"
          class="w-64"
          size="sm"
          autofocus
          @keydown.enter.prevent="applyLink"
          @keydown.esc="linkOpen = false"
        />
        <UButton size="sm" :label="t('editor.apply')" @click="applyLink" />
      </div>
    </div>
  </div>
</template>

<style>
/* Tailwind's preflight strips list markers and blockquote styling, which the composer's own lists and
   quotes rely on. Matches upstream's .email-body rules. */
.compose-editor ul { list-style: disc; padding-left: 1.5rem; margin: 0.25rem 0; }
.compose-editor ol { list-style: decimal; padding-left: 1.5rem; margin: 0.25rem 0; }
.compose-editor blockquote { border-left: 2px solid var(--ui-border-accented); margin: 0.25rem 0; padding-left: 0.75rem; color: var(--ui-text-muted); }
.compose-editor a { color: var(--ui-primary); text-decoration: underline; }
.compose-editor p { margin: 0 0 0.5rem; }
</style>
