import express from 'express'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureProData, getCachedHeroes, getCachedMeta } from './ingest.js'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const port = Number(process.env.PORT ?? 5173)
const host = process.env.HOST ?? '127.0.0.1'
const isDev = process.argv.includes('--dev')
const app = express()

app.disable('x-powered-by')
app.get('/api/health', async (_request, response) => {
  const meta = await getCachedMeta().catch(() => null)
  response.status(meta ? 200 : 503).json({ ok: Boolean(meta), datasetSize: meta?.datasetSize ?? 0, patch: meta?.patch ?? null })
})
app.get('/api/meta/recent', async (_request, response) => {
  try {
    response.setHeader('Cache-Control', 'no-cache, stale-while-revalidate=300')
    response.setHeader('X-DraftGG-Data-Source', 'live')
    response.json(await getCachedMeta())
  } catch {
    response.status(503).json({ error: 'Professional draft model is warming up' })
  }
})
app.get('/api/heroes', async (_request, response) => {
  try {
    response.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
    response.setHeader('X-DraftGG-Data-Source', 'live')
    response.json(await getCachedHeroes())
  } catch {
    response.status(503).json({ error: 'Hero metadata is unavailable' })
  }
})

if (isDev) {
  const { createServer } = await import('vite')
  const vite = await createServer({ root, server: { middlewareMode: true }, appType: 'spa' })
  app.use(vite.middlewares)
} else {
  app.use(express.static(resolve(root, 'dist'), { maxAge: '1h' }))
  app.use((_request, response) => response.sendFile(resolve(root, 'dist', 'index.html')))
}

app.listen(port, host, () => console.log(`DraftGG listening on http://${host}:${port}`))
void ensureProData().catch((error: unknown) => console.error('Initial pro-meta refresh failed:', error))
setInterval(() => void ensureProData(true).catch((error: unknown) => console.error('Scheduled pro-meta refresh failed:', error)), 6 * 60 * 60 * 1000).unref()
