// Promise-based confirmations for the admin email pages, in place of upstream's window.confirm.
// They open the app's shared confirm modal (utils/confirm-dialog).
import type { MxReplaceConfirm } from './domains'

type AdminConfirmOptions = Parameters<typeof openConfirmModal>[0] & { description?: string }

export function useAdminConfirm() {
  const { t } = useLanguage()

  const confirm = ({ description, ...options }: AdminConfirmOptions): Promise<boolean> => openConfirmModal({ ...options, message: description ?? options.message })

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
