import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { RecentProMeta } from '../src/types.js'

type CliOptions = {
  proBatch: string
  highRankBatch: string
  highRankLimit: string
  explorerBatch: string
  roleBackfill: string
  datasetLimit: string
  skipHeroes: boolean
}

function optionValue(args: string[], name: string, fallback: string, position: number) {
  const index = args.indexOf(name)
  if (index >= 0 && args[index + 1]) return args[index + 1]
  return args[position] && !args[position].startsWith('--') ? args[position] : fallback
}

function parseOptions(): CliOptions {
  const args = process.argv.slice(2)
  return {
    proBatch: optionValue(args, '--pro-batch', '120', 0),
    highRankBatch: optionValue(args, '--high-rank-batch', optionValue(args, '--public-batch', '600', 1), 1),
    highRankLimit: optionValue(args, '--high-rank-limit', '100000', 6),
    explorerBatch: optionValue(args, '--explorer-batch', '240', 2),
    roleBackfill: optionValue(args, '--role-backfill', '220', 3),
    datasetLimit: optionValue(args, '--dataset-limit', '12000', 4),
    skipHeroes: args.includes('--skip-heroes') || args.includes('skip-heroes') || args[5] === 'true',
  }
}

async function readCurrentMeta() {
  try {
    const path = resolve(process.cwd(), 'data', 'recent-pro-meta.json')
    return JSON.parse(await readFile(path, 'utf8')) as RecentProMeta
  } catch {
    return null
  }
}

const options = parseOptions()
process.env.PRO_MATCH_BATCH_SIZE = options.proBatch
process.env.HIGH_RANK_BATCH_SIZE = options.highRankBatch
process.env.HIGH_RANK_DATASET_LIMIT = options.highRankLimit
process.env.EXPLORER_MATCH_BATCH_SIZE = options.explorerBatch
process.env.PRO_POSITION_BACKFILL_SIZE = options.roleBackfill
process.env.PRO_DATASET_LIMIT = options.datasetLimit

const before = await readCurrentMeta()
const { refreshHeroes, refreshProData } = await import('./ingest.js')

if (!options.skipHeroes) {
  const heroes = await refreshHeroes(true)
  console.log(`Updated hero stats: ${heroes.length} heroes.`)
}

const meta = await refreshProData(true)
console.log([
  `Updated draft model: ${meta.matchesAnalyzed} active patch drafts.`,
  `Stored dataset: ${meta.datasetSize ?? meta.matchesAnalyzed} drafts.`,
  `High-rank matches: ${meta.publicMatchesAnalyzed ?? 0} in model (${meta.publicDatasetSize ?? 0} stored, min tier ${meta.publicMinRankTier ?? '?'}).`,
  `Role evidence: ${meta.matchesWithPositions ?? 0} matches.`,
  `Lane evidence: ${meta.matchesWithLanes ?? 0} matches.`,
  `Patch: ${meta.patch ?? 'unknown'}.`,
].join('\n'))

if (before) {
  console.log([
    'Delta:',
    `Drafts ${before.matchesAnalyzed} -> ${meta.matchesAnalyzed}.`,
    `High-rank ${before.publicMatchesAnalyzed ?? 0} -> ${meta.publicMatchesAnalyzed ?? 0}.`,
    `Role evidence ${before.matchesWithPositions ?? 0} -> ${meta.matchesWithPositions ?? 0}.`,
    `Lane evidence ${before.matchesWithLanes ?? 0} -> ${meta.matchesWithLanes ?? 0}.`,
  ].join('\n'))
}
