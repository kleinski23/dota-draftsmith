import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { analyzeDraft } from '../src/analysisEngine.js'
import type { Hero, ModelCalibration, RecentProMeta } from '../src/types.js'

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = resolve(PROJECT_ROOT, 'data')

type ApiHero = {
  id: number
  name: string
  localized_name: string
  primary_attr: Hero['primaryAttr']
  attack_type: string
  roles: string[]
  img?: string
  icon?: string
  pro_pick?: number
  pro_ban?: number
  pro_win?: number
}

type StoredDraft = {
  matchId: number
  radiantWin: boolean
  picksBans: Array<{ is_pick: boolean; hero_id: number; team: number }>
}

type StoredPublicMatch = {
  matchId: number
  radiantWin: boolean
  radiant: number[]
  dire: number[]
}

type Evaluated = {
  source: 'pro' | 'public'
  radiantProbability: number
  radiantWin: boolean
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T
}

function toHero(hero: ApiHero): Hero {
  return {
    id: hero.id,
    name: hero.name,
    localizedName: hero.localized_name,
    primaryAttr: hero.primary_attr,
    attackType: hero.attack_type,
    roles: hero.roles,
    image: '',
    icon: '',
    proPick: hero.pro_pick ?? 0,
    proBan: hero.pro_ban ?? 0,
    proWin: hero.pro_win ?? 0,
  }
}

const heroesRaw = await readJson<{ heroes?: ApiHero[] } | ApiHero[]>(resolve(DATA_DIR, 'heroes.json'))
const heroList = (Array.isArray(heroesRaw) ? heroesRaw : heroesRaw.heroes ?? []).map(toHero)
const heroById = new Map(heroList.map((hero) => [hero.id, hero]))
const meta = await readJson<RecentProMeta>(resolve(DATA_DIR, 'recent-pro-meta.json'))
const proDrafts = await readJson<StoredDraft[]>(resolve(DATA_DIR, 'pro-drafts.json'))
const publicMatches = await readJson<StoredPublicMatch[]>(resolve(DATA_DIR, 'high-rank-matches.json')).catch(() => [] as StoredPublicMatch[])

function lineup(ids: number[]): Hero[] | null {
  if (ids.length !== 5) return null
  const heroes = ids.map((id) => heroById.get(id)).filter((hero): hero is Hero => Boolean(hero))
  return heroes.length === 5 ? heroes : null
}

const results: Evaluated[] = []
// Evaluate against raw model output: strip any stored calibration so the computed
// shrink factor always maps uncalibrated probabilities to observed outcomes.
const rawMeta: RecentProMeta = { ...meta, calibration: undefined }

for (const draft of proDrafts) {
  const radiant = lineup(draft.picksBans.filter((a) => a.is_pick && a.team === 0).map((a) => a.hero_id))
  const dire = lineup(draft.picksBans.filter((a) => a.is_pick && a.team === 1).map((a) => a.hero_id))
  if (!radiant || !dire) continue
  const analysis = analyzeDraft(radiant, dire, rawMeta)
  results.push({ source: 'pro', radiantProbability: analysis.probability.radiant / 100, radiantWin: draft.radiantWin })
}

for (const match of publicMatches) {
  const radiant = lineup(match.radiant)
  const dire = lineup(match.dire)
  if (!radiant || !dire) continue
  const analysis = analyzeDraft(radiant, dire, rawMeta)
  results.push({ source: 'public', radiantProbability: analysis.probability.radiant / 100, radiantWin: match.radiantWin })
}

if (!results.length) {
  console.error('No stored matches could be evaluated.')
  process.exit(1)
}

const accuracyOf = (subset: Evaluated[]) =>
  subset.filter((r) => (r.radiantProbability >= 0.5) === r.radiantWin).length / Math.max(1, subset.length)
const brier = results.reduce((sum, r) => sum + (r.radiantProbability - (r.radiantWin ? 1 : 0)) ** 2, 0) / results.length

// Calibration: fold to the favored side's probability and compare against its actual win rate.
const bucketEdges = [
  { range: '50-55%', min: 0.5, max: 0.55 },
  { range: '55-60%', min: 0.55, max: 0.6 },
  { range: '60-65%', min: 0.6, max: 0.65 },
  { range: '65%+', min: 0.65, max: 1.01 },
]
const buckets = bucketEdges.map(({ range, min, max }) => {
  const inBucket = results.map((r) => {
    const favored = Math.max(r.radiantProbability, 1 - r.radiantProbability)
    const favoredWon = r.radiantProbability >= 0.5 ? r.radiantWin : !r.radiantWin
    return { favored, favoredWon }
  }).filter((r) => r.favored >= min && r.favored < max)
  return {
    range,
    matches: inBucket.length,
    expected: inBucket.length ? inBucket.reduce((sum, r) => sum + r.favored, 0) / inBucket.length : 0,
    actual: inBucket.length ? inBucket.filter((r) => r.favoredWon).length / inBucket.length : 0,
  }
})

const proResults = results.filter((r) => r.source === 'pro')
const publicResults = results.filter((r) => r.source === 'public')

// Least-squares fit (through the 50% center) of predicted edge vs observed outcome:
// minimizing sum((0.5 + k*(p-0.5)) - y)^2 gives k = sum((p-.5)(y-.5)) / sum((p-.5)^2).
const shrinkNumerator = results.reduce((sum, r) => sum + (r.radiantProbability - 0.5) * ((r.radiantWin ? 1 : 0) - 0.5), 0)
const shrinkDenominator = results.reduce((sum, r) => sum + (r.radiantProbability - 0.5) ** 2, 0)
const shrink = Math.max(0.1, Math.min(1, shrinkDenominator > 0 ? shrinkNumerator / shrinkDenominator : 1))
const brierShrunk = results.reduce((sum, r) => {
  const calibrated = 0.5 + (r.radiantProbability - 0.5) * shrink
  return sum + (calibrated - (r.radiantWin ? 1 : 0)) ** 2
}, 0) / results.length

const calibration: ModelCalibration = {
  matches: results.length,
  proMatches: proResults.length,
  publicMatches: publicResults.length,
  accuracy: accuracyOf(results),
  brier,
  shrink,
  buckets,
  evaluatedAt: Date.now(),
}

const percent = (value: number) => `${(value * 100).toFixed(1)}%`
console.log([
  `Backtested ${results.length} stored matches (${proResults.length} pro, ${publicResults.length} high-rank).`,
  `Favored-side accuracy: ${percent(calibration.accuracy)} overall · ${percent(accuracyOf(proResults))} pro · ${percent(accuracyOf(publicResults))} high-rank.`,
  `Brier score: ${brier.toFixed(4)} raw -> ${brierShrunk.toFixed(4)} after shrink (0.25 = coin flip; lower is better).`,
  `Probability shrink factor: ${shrink.toFixed(3)} (raw edges are scaled by this before display).`,
  'Calibration (favored side, raw):',
  ...buckets.map((bucket) => `  ${bucket.range}: model ${percent(bucket.expected)} vs actual ${percent(bucket.actual)} over ${bucket.matches} matches`),
  'Caveat: in-sample — the synergy/counter tables were built from these same matches, so treat these numbers as an upper bound.',
].join('\n'))

if (!process.argv.includes('--dry-run')) {
  meta.calibration = calibration
  const serialized = JSON.stringify(meta, null, 2)
  await writeFile(resolve(DATA_DIR, 'recent-pro-meta.json'), serialized, 'utf8')
  await writeFile(resolve(PROJECT_ROOT, 'public', 'data', 'recent-pro-meta.json'), serialized, 'utf8')
  console.log('Calibration written into data/recent-pro-meta.json and public/data/recent-pro-meta.json.')
}
