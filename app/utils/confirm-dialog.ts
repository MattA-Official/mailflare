// In-app replacements for window.confirm and window.alert, opened through Nuxt UI's useOverlay.
// Imperative on purpose, so event handlers and plain helpers can `if (!(await confirmDialog(message))) return`.
// Ported from legacy/src/components/ui/confirm-dialog.tsx.
import type AppConfirmModal from '~/components/app/ConfirmModal.vue'

export type ConfirmOptions = {
  message: string
  title?: string
  confirmLabel?: string
  destructive?: boolean
  /** The user must type this text before confirming. */
  requireText?: string
}

type ModalProps = InstanceType<typeof AppConfirmModal>['$props']

/** Opens the shared confirm modal and resolves true only when the user confirms. */
export async function openConfirmModal(props: ModalProps): Promise<boolean> {
  // Loaded on first use, which also keeps this module importable from plain unit tests.
  const { default: component } = await import('~/components/app/ConfirmModal.vue')
  const modal = useOverlay().create(component, { destroyOnClose: true })
  return (await modal.open(props).result) === true
}

function normalize(input: string | ConfirmOptions): ConfirmOptions {
  return typeof input === 'string' ? { message: input } : input
}

function toProps({ destructive, ...options }: ConfirmOptions): ModalProps {
  return { ...options, color: destructive ? 'error' : 'primary' }
}

export function confirmDialog(input: string | ConfirmOptions): Promise<boolean> {
  return openConfirmModal(toProps(normalize(input)))
}

export function confirmDestructive(input: string | ConfirmOptions): Promise<boolean> {
  return confirmDialog({ ...normalize(input), destructive: true })
}

export async function alertDialog(input: string | ConfirmOptions): Promise<void> {
  await openConfirmModal({ ...toProps(normalize(input)), alert: true })
}
