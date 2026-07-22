import { refreshHeroes, refreshProData } from './ingest.js'
import { publishSnapshots } from './publish-snapshots.js'

async function refreshSnapshots() {
  const meta = await refreshProData(true)
  const heroes = await refreshHeroes(true)
  await publishSnapshots()
  console.log(`Published ${heroes.length} heroes and a model built from ${meta.datasetSize ?? meta.matchesAnalyzed} pro drafts plus ${meta.publicDatasetSize ?? 0} high-rank matches.`)
}

refreshSnapshots().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
