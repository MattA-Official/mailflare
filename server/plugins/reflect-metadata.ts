// Passkeys need the Reflect metadata API (see server/worker.ts). The built Worker gets it from its
// entry; `nuxt dev` runs Nitro's own entry instead, so load it here too.
import 'reflect-metadata'

export default defineNitroPlugin(() => {})
