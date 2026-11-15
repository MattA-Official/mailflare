// Nuxt's accessibility guide: after a client-side navigation to another page, move focus to the
// page's <main> so keyboard and screen reader users start at the new content instead of the link they
// just used. Mail is left out: opening a message or moving with j/k changes the path, and taking focus
// then would pull it out of the message list. Query-only changes (filters, Drive folders) and the
// first page load leave focus alone too.
export default defineNuxtPlugin((nuxtApp) => {
  let pending = false
  const section = (nav: unknown) => (typeof nav === 'string' ? nav : 'mail')

  useRouter().afterEach((to, from, failure) => {
    pending = !failure
      && from.matched.length > 0
      && to.path !== from.path
      && !(section(to.meta.nav) === 'mail' && section(from.meta.nav) === 'mail')
  })

  nuxtApp.hook('page:finish', () => {
    if (!pending) return
    pending = false
    const main = document.getElementById('main-content')
    const active = document.activeElement
    // Keep focus the new page or a dialog has already taken.
    if (!main || (active && (main.contains(active) || active.closest('[role="dialog"]')))) return
    main.focus({ preventScroll: true })
  })
})
