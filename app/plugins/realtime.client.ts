// Realtime updates and the new-message toast, app-wide as upstream's Providers ran them.
import { getEmailDisplayName } from '#lib/email/address'
import { startRealtime } from '~/utils/realtime/client'

export default defineNuxtPlugin(() => {
  const toast = useToast()
  const { t } = useLanguage()
  let lastToastId: string | null = null

  startRealtime((event) => {
    if (lastToastId) toast.remove(lastToastId)
    lastToastId = `new-message-${event.messageId}`
    toast.add({
      id: lastToastId,
      icon: 'i-lucide-mail',
      title: t('notification.newEmail'),
      description: `${event.subject || t('list.noSubject')} · ${t('notification.from', { sender: event.fromName ?? getEmailDisplayName(event.from) })}`,
      duration: 8_000,
      actions: [{ label: t('notification.open'), color: 'neutral', variant: 'outline', to: `/inbox/${event.messageId}` }],
    })
  }, () => {
    if (lastToastId) toast.remove(lastToastId)
    lastToastId = null
  })
})
