import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = resolve(PROJECT_ROOT, 'data')
const PUBLIC_DATA_DIR = resolve(PROJECT_ROOT, 'public', 'data')

export async function publishSnapshots() {
  await mkdir(PUBLIC_DATA_DIR, { recursive: true })

  const heroCache = JSON.parse(await readFile(resolve(DATA_DIR, 'heroes.json'), 'utf8')) as { heroes?: unknown[] }
  if (!Array.isArray(heroCache.heroes) || heroCache.heroes.length === 0) {
    throw new Error('The cached hero snapshot is empty or invalid')
  }

  await writeFile(resolve(PUBLIC_DATA_DIR, 'heroes.json'), JSON.stringify(heroCache.heroes, null, 2), 'utf8')
  await copyFile(resolve(DATA_DIR, 'recent-pro-meta.json'), resolve(PUBLIC_DATA_DIR, 'recent-pro-meta.json'))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  publishSnapshots().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
