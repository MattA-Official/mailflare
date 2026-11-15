// Loads the catalogue for the saved language. Parallel so the other plugins start meanwhile; the app
// still waits for it before mounting.
export default defineNuxtPlugin({
  name: 'language',
  parallel: true,
  async setup() {
    await initLanguage()
  },
})
