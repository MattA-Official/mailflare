// Promise-based confirmations for the admin email pages, in place of upstream's window.confirm.
// Call from setup(): the overlay is created once per component.
import ConfirmModal from '~/components/admin/email/ConfirmModal.vue'
import type { MxReplaceConfirm } from './domains'

type ConfirmOptions = InstanceType<typeof ConfirmModal>['$props']

export function useAdminConfirm() {
  const overlay = useOverlay()
  const modal = overlay.create(ConfirmModal)
  const { t } = useLanguage()

  const confirm = async (options: ConfirmOptions): Promise<boolean> => (await modal.open(options).result) === true

  /** Asks before replacing another service's MX records (the 409 MX_CONFLICT flow). */
  const confirmMxReplacement: MxReplaceConfirm = (message, records) => confirm({
    title: t('setup.replaceMx'),
    description: `${message} ${t('setup.replaceMxHint')}`,
    details: records.map(record => `${record.priority} ${record.content}`),
    confirmLabel: t('setup.replaceMx'),
    color: 'warning',
  })

  return { confirm, confirmMxReplacement }
}
