// Writes .output/server/wrangler.local.json: the generated config minus bindings that need a
// Cloudflare login (AI, Images, routes), so `bun run preview` runs fully offline.
// APP_URL becomes the local origin so passkeys (whose RP ID is APP_URL's host) work in local tests.
import { readFile, writeFile } from 'node:fs/promises'

const src = new URL('../.output/server/wrangler.json', import.meta.url)
const config = JSON.parse(await readFile(src, 'utf8'))
for (const key of ['ai', 'images', 'routes', 'services', 'upload_source_maps', 'previews']) delete config[key]
config.vars = { ...config.vars, APP_URL: 'http://localhost:8787' }
await writeFile(new URL('../.output/server/wrangler.local.json', import.meta.url), JSON.stringify(config, null, 2))
console.log('Wrote .output/server/wrangler.local.json')
