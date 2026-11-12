// Playwright's `test` with each test signing in from its own client address. Sign-in is limited to
// twenty attempts a minute per address (LOGIN_RATE_LIMIT), and the local Worker reads the address from
// the cf-connecting-ip header, so without this a full run trips the limit part way through.
import { test as base } from '@playwright/test'

export { expect, type Page } from '@playwright/test'

let next = 0

export const test = base.extend({
  context: async ({ context }, use) => {
    next = (next % 250) + 1
    await context.setExtraHTTPHeaders({ 'cf-connecting-ip': `198.51.100.${next}` })
    await use(context)
  },
})
