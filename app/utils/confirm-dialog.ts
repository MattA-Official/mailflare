// In-app replacements for window.confirm and window.alert, rendered by AppConfirmDialogHost in app.vue.
// Imperative on purpose, so event handlers and plain helpers can `if (!(await confirmDialog(message))) return`.
// Ported from legacy/src/components/ui/confirm-dialog.tsx.

export type ConfirmOptions = {
  message: string
  title?: string
  confirmLabel?: string
  destructive?: boolean
  /** The user must type this text before confirming. */
  requireText?: string
}

export type ConfirmRequest = {
  kind: 'confirm' | 'alert'
  options: ConfirmOptions
  resolve: (confirmed: boolean) => void
}

let enqueue: ((request: ConfirmRequest) => void) | null = null

/** Called by the host when it mounts and unmounts. */
export function setConfirmDialogHost(handler: ((request: ConfirmRequest) => void) | null) {
  enqueue = handler
}

function normalize(input: string | ConfirmOptions): ConfirmOptions {
  return typeof input === 'string' ? { message: input } : input
}

export function confirmDialog(input: string | ConfirmOptions): Promise<boolean> {
  const options = normalize(input)
  // Before the host mounts, fall back to the native dialog rather than silently confirming or cancelling.
  if (!enqueue) return Promise.resolve(typeof window !== 'undefined' && window.confirm(options.message))
  const add = enqueue
  return new Promise(resolve => add({ kind: 'confirm', options, resolve }))
}

export function confirmDestructive(input: string | ConfirmOptions): Promise<boolean> {
  return confirmDialog({ ...normalize(input), destructive: true })
}

export async function alertDialog(input: string | ConfirmOptions): Promise<void> {
  const options = normalize(input)
  if (!enqueue) {
    if (typeof window !== 'undefined') window.alert(options.message)
    return
  }
  const add = enqueue
  await new Promise<boolean>(resolve => add({ kind: 'alert', options, resolve }))
}
