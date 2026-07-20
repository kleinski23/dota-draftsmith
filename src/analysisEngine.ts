import type { Hero, RecentProMeta, Team } from './types'

export type Dimension = 'Laning' | 'Teamfight' | 'Pickoff' | 'Push' | 'Sustain' | 'Scaling' | 'Roshan' | 'Execution'

export interface PowerSpike {
  hero: Hero
  label: string
  minuteStart: number
  minuteEnd: number
  impact: 'major' | 'supporting'
}

export interface LaneAssignment {
  lane: 'Safe lane' | 'Mid lane' | 'Off lane'
  heroes: Hero[]
  evidence: string
}

export interface ObjectiveStep {
  window: string
  action: string
}

export interface TeamAnalysis {
  scores: Record<Dimension, number>
  archetype: string
  pressureProfile: string
  riskLevel: 'Low' | 'Medium' | 'High'
  strengths: string[]
  gaps: string[]
  winConditions: string[]
  spikes: PowerSpike[]
  peakWindow: string
  lanePlan: LaneAssignment[]
  laneEvidence: string
  damageProfile: string
  responseItems: string[]
  objectivePlan: ObjectiveStep[]
}

export interface MatchupAnalysis {
  radiant: TeamAnalysis
  dire: TeamAnalysis
  probability: Record<Team, number>
  stageEdge: { early: Team | 'even'; mid: Team | 'even'; late: Team | 'even' }
  favored: Team | 'even'
  headline: string
  decidingFactors: string[]
  simulationInsights: string[]
  simulationRuns: number
  samplingMargin: number
  modelBasis: string
}

const PUSH = ['beastmaster', 'broodmother', 'chen', 'death_prophet', 'jakiro', 'lone_druid', 'lycan', 'pugna', 'shadow_shaman', 'visage']
const ROSHAN = ['huskar', 'ursa', 'templar_assassin', 'slardar', 'troll_warlord', 'lone_druid', 'lycan', 'meepo']
const PICKOFF = ['axe', 'bane', 'batrider', 'beastmaster', 'clockwerk', 'doom_bringer', 'legion_commander', 'lion', 'nyx_assassin', 'pudge', 'shadow_shaman', 'spirit_breaker']
const HARD_CARRY = ['antimage', 'arc_warden', 'drow_ranger', 'faceless_void', 'medusa', 'morphling', 'naga_siren', 'phantom_lancer', 'spectre', 'terrorblade']
const MICRO = ['arc_warden', 'beastmaster', 'brewmaster', 'broodmother', 'chen', 'lone_druid', 'lycan', 'meepo', 'naga_siren', 'visage']
const BLINK = ['axe', 'centaur', 'earthshaker', 'enigma', 'legion_commander', 'lion', 'magnataur', 'mars', 'sand_king', 'slardar', 'tidehunter', 'tiny']
const AURA = ['beastmaster', 'chen', 'dark_seer', 'death_prophet', 'enigma', 'lycan', 'tidehunter', 'underlord', 'visage']
const BATTLE_FURY = ['antimage', 'juggernaut', 'phantom_assassin', 'ursa']

const key = (hero: Hero) => hero.name.replace('npc_dota_hero_', '')
const inList = (hero: Hero, list: string[]) => list.includes(key(hero))
const roleCount = (heroes: Hero[], role: string) => heroes.filter((h) => h.roles.includes(role)).length
const listCount = (heroes: Hero[], list: string[]) => heroes.filter((h) => inList(h, list)).length
const clamp = (value: number) => Math.max(18, Math.min(96, Math.round(value)))
const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0

function scoreTeam(heroes: Hero[]): Record<Dimension, number> {
  const ranged = heroes.filter((h) => h.attackType === 'Ranged').length
  const supports = roleCount(heroes, 'Support')
  const disablers = roleCount(heroes, 'Disabler')
  const initiators = roleCount(heroes, 'Initiator')
  const nukers = roleCount(heroes, 'Nuker')
  const carries = roleCount(heroes, 'Carry')
  const durable = roleCount(heroes, 'Durable')
  const escape = roleCount(heroes, 'Escape')
  const pushers = roleCount(heroes, 'Pusher') + listCount(heroes, PUSH)
  const hardCarry = listCount(heroes, HARD_CARRY)
  const micro = listCount(heroes, MICRO)

  return {
    Laning: clamp(34 + ranged * 7 + supports * 7 + nukers * 5 - Math.max(0, carries - 3) * 5),
    Teamfight: clamp(28 + initiators * 12 + disablers * 7 + durable * 4 + supports * 2),
    Pickoff: clamp(27 + disablers * 9 + nukers * 6 + escape * 3 + listCount(heroes, PICKOFF) * 7),
    Push: clamp(24 + pushers * 10 + carries * 3),
    Sustain: clamp(28 + supports * 9 + durable * 5),
    Scaling: clamp(27 + carries * 8 + hardCarry * 11 + heroes.filter((h) => h.primaryAttr === 'agi').length * 3),
    Roshan: clamp(24 + listCount(heroes, ROSHAN) * 14 + carries * 4 + durable * 3),
    Execution: clamp(88 - micro * 14 - Math.max(0, carries - 2) * 7 + disablers * 2),
  }
}

function buildSpikes(heroes: Hero[]): PowerSpike[] {
  return heroes.flatMap((hero): PowerSpike[] => {
    if (inList(hero, BLINK)) return [{ hero, label: 'Blink Dagger initiation', minuteStart: 12, minuteEnd: 17, impact: 'major' }]
    if (inList(hero, BATTLE_FURY)) return [
      { hero, label: 'Farming accelerator', minuteStart: 12, minuteEnd: 16, impact: 'supporting' },
      { hero, label: 'BKB + damage threshold', minuteStart: 24, minuteEnd: 30, impact: 'major' },
    ]
    if (inList(hero, AURA)) return [{ hero, label: 'First team aura', minuteStart: 15, minuteEnd: 21, impact: 'major' }]
    if (hero.roles.includes('Carry')) return [{ hero, label: 'BKB / second core item', minuteStart: 21, minuteEnd: 28, impact: 'major' }]
    if (hero.roles.includes('Support')) return [{ hero, label: 'Force / Glimmer utility', minuteStart: 16, minuteEnd: 23, impact: 'supporting' }]
    return [{ hero, label: 'First major utility item', minuteStart: 17, minuteEnd: 23, impact: 'supporting' }]
  }).sort((a, b) => a.minuteStart - b.minuteStart)
}

function strongest(scores: Record<Dimension, number>) {
  return (Object.entries(scores) as [Dimension, number][]).sort((a, b) => b[1] - a[1]).slice(0, 3)
}

function coreScore(hero: Hero, position: 1 | 2 | 3) {
  const carry = hero.roles.includes('Carry') ? 12 : 0
  const nuker = hero.roles.includes('Nuker') ? 9 : 0
  const initiator = hero.roles.includes('Initiator') ? 10 : 0
  const durable = hero.roles.includes('Durable') ? 8 : 0
  const support = hero.roles.includes('Support') ? -7 : 0
  if (position === 1) return carry + (inList(hero, HARD_CARRY) ? 16 : 0) + (hero.primaryAttr === 'agi' ? 5 : 0) + support
  if (position === 2) return nuker + carry * 0.6 + (hero.roles.includes('Escape') ? 7 : 0) + (hero.attackType === 'Ranged' ? 3 : 0) + support
  return initiator + durable + (hero.primaryAttr === 'str' ? 4 : 0) + support * 0.3
}

function laneProbability(hero: Hero, lane: 0 | 1 | 2, meta?: RecentProMeta | null) {
  const observed = meta?.laneSignals?.[hero.id]
  if (observed && observed.samples >= 0.5) {
    const values = [observed.safe + observed.roam * 0.5, observed.mid, observed.off + observed.roam * 0.5]
    return (values[lane] + 0.6) / (values.reduce((sum, value) => sum + value, 0) + 1.8)
  }
  const supportFlex = hero.roles.includes('Support') ? 12 : 0
  const fallback = [coreScore(hero, 1) + supportFlex, coreScore(hero, 2), coreScore(hero, 3) + supportFlex]
  const shifted = fallback.map((value) => Math.max(1, value + 12))
  return shifted[lane] / shifted.reduce((sum, value) => sum + value, 0)
}

function positionProbability(hero: Hero, position: 0 | 1 | 2 | 3 | 4, meta?: RecentProMeta | null) {
  const support = hero.roles.includes('Support') ? 15 : 0
  const disabler = hero.roles.includes('Disabler') ? 6 : 0
  const initiator = hero.roles.includes('Initiator') ? 6 : 0
  const fallback = [
    coreScore(hero, 1),
    coreScore(hero, 2),
    coreScore(hero, 3),
    support + disabler + initiator,
    support * 1.25 + disabler,
  ]
  const weights = fallback.map((value, index) => {
    const indexLane = index === 0 || index === 4 ? 0 : index === 1 ? 1 : 2
    return Math.exp(value / 12) * laneProbability(hero, indexLane, meta)
  })
  const heuristic = weights[position] / weights.reduce((sum, value) => sum + value, 0)
  const observed = meta?.positionSignals?.[hero.id]
  if (!observed?.samples) return heuristic
  const observedProbability = (observed.positions[position] + 0.7) / (observed.samples + 3.5)
  const evidenceWeight = Math.min(0.72, observed.samples / (observed.samples + 8))
  return heuristic * (1 - evidenceWeight) + observedProbability * evidenceWeight
}

function inferLanes(heroes: Hero[], meta?: RecentProMeta | null): { plan: LaneAssignment[]; evidence: string } {
  const assignments: Array<0 | 1 | 2 | 3 | 4> = []
  let bestPositions: Array<0 | 1 | 2 | 3 | 4> | null = null
  let bestScore = Number.NEGATIVE_INFINITY
  const search = (index: number) => {
    if (index === heroes.length) {
      if (new Set(assignments).size !== 5) return
      const score = assignments.reduce<number>((sum, position, heroIndex) => sum + Math.log(positionProbability(heroes[heroIndex], position, meta)), 0)
      if (score > bestScore) { bestScore = score; bestPositions = [...assignments] }
      return
    }
    for (const position of [0, 1, 2, 3, 4] as const) {
      assignments.push(position); search(index + 1); assignments.pop()
    }
  }
  search(0)
  const selected: Array<0 | 1 | 2 | 3 | 4> = bestPositions ?? [0, 1, 2, 3, 4]
  const laneNames = ['Safe lane', 'Mid lane', 'Off lane'] as const
  const lanePositions = [[0, 4], [1], [2, 3]]
  const observedHeroes = heroes.filter((hero) => (meta?.positionSignals?.[hero.id]?.samples ?? 0) >= 2.5).length
  const plan = laneNames.map((lane, laneIndex) => {
      const laneHeroes = heroes.filter((_, heroIndex) => lanePositions[laneIndex].includes(selected[heroIndex]))
      const fit = laneHeroes.reduce((sum, hero) => {
        const heroIndex = heroes.indexOf(hero)
        return sum + positionProbability(hero, selected[heroIndex], meta)
      }, 0) / Math.max(1, laneHeroes.length)
      return { lane, heroes: laneHeroes, evidence: fit < 0.25 ? `Low confidence · ${Math.round(fit * 100)}% fit` : `${Math.round(fit * 100)}% role fit` }
    })
  const hasRoleConflict = plan.some((lane) => lane.evidence.startsWith('Low confidence'))
  const evidence = hasRoleConflict ? 'Role conflict · no standard pro assignment' : observedHeroes >= 4 ? `Pro-role model · ${observedHeroes}/5 heroes observed` : observedHeroes >= 2 ? `Mixed role model · ${observedHeroes}/5 heroes observed` : 'Low evidence · role-tag estimate'
  return { evidence, plan }
}

function roleFitScore(lanePlan: LaneAssignment[]) {
  const fits = lanePlan.flatMap((lane) => {
    const match = lane.evidence.match(/(\d+)% fit/)
    return match ? Number(match[1]) : []
  })
  return fits.length ? mean(fits) : 50
}

function inferDamageProfile(heroes: Hero[]) {
  const magical = roleCount(heroes, 'Nuker') * 2 + heroes.filter((hero) => hero.primaryAttr === 'int').length
  const physical = roleCount(heroes, 'Carry') * 2 + heroes.filter((hero) => hero.primaryAttr === 'agi').length
  if (magical > physical + 3) return 'Magic-heavy burst'
  if (physical > magical + 3) return 'Physical-heavy damage'
  return 'Mixed damage'
}

function objectivePlan(scores: Record<Dimension, number>, peakWindow: string): ObjectiveStep[] {
  return [
    { window: '0–10', action: scores.Laning >= 65 ? 'Pressure lanes and secure both power runes.' : 'Protect core lanes; avoid forced rotations before levels.' },
    { window: '10–18', action: scores.Push >= 60 ? 'Use catapult waves to take the first two outer towers.' : 'Smoke behind a vision ward and convert one pickoff into a tower.' },
    { window: '18–26', action: scores.Roshan >= 60 ? 'Force Roshan after the first clean kill or major cooldown.' : 'Control Roshan vision, but play for a fight before entering the pit.' },
    { window: peakWindow, action: scores.Scaling >= 65 ? 'Take protected map control while cores complete their next item.' : 'Use the lineup peak to claim Aegis and break the outer map.' },
  ]
}

function inferArchetype(scores: Record<Dimension, number>) {
  if (scores.Push >= 68 && scores.Roshan >= 60) return 'Objective tempo'
  if (scores.Pickoff >= 68 && scores.Teamfight < scores.Pickoff) return 'Pickoff map control'
  if (scores.Scaling >= 70 && scores.Execution >= 55) return 'Late-game scaling'
  if (scores.Teamfight >= 68) return 'Five-on-five teamfight'
  if (scores.Sustain >= 65) return 'Reset and sustain'
  return 'Flexible mixed draft'
}

function pressureProfile(scores: Record<Dimension, number>) {
  const tempo = scores.Laning * 0.35 + scores.Push * 0.35 + scores.Pickoff * 0.3
  const late = scores.Scaling * 0.55 + scores.Sustain * 0.2 + scores.Teamfight * 0.25
  if (tempo > late + 10) return 'Wants first Roshan and outer towers before the enemy cores stabilize.'
  if (late > tempo + 10) return 'Comfortable absorbing pressure if the map is not lost before second items.'
  return 'Can play either direction, but needs clean objective conversion after won fights.'
}

function riskLevel(scores: Record<Dimension, number>, laneFit: number): TeamAnalysis['riskLevel'] {
  const risks = [
    scores.Scaling >= 68 && scores.Laning < 58,
    scores.Execution < 54,
    laneFit < 42,
  ].filter(Boolean).length
  return risks >= 2 ? 'High' : risks === 1 ? 'Medium' : 'Low'
}

function responseItems(opponent: TeamAnalysis) {
  const items: string[] = []
  if (opponent.scores.Pickoff >= 65) items.push('Force Staff / Linken’s Sphere')
  if (opponent.scores.Teamfight >= 65) items.push('Black King Bar / Pipe')
  if (opponent.scores.Sustain >= 65) items.push('Spirit Vessel / Shiva’s Guard')
  if (opponent.scores.Scaling >= 65) items.push('Heaven’s Halberd / armor')
  if (opponent.scores.Push >= 60) items.push('Wave clear / Boots of Travel')
  if (opponent.scores.Roshan >= 65) items.push('Early vision around Roshan')
  return items.slice(0, 4).length ? items.slice(0, 4) : ['Flexible dispel and mobility items']
}

function analyzeTeam(heroes: Hero[], meta?: RecentProMeta | null): TeamAnalysis {
  const scores = scoreTeam(heroes)
  const lanes = inferLanes(heroes, meta)
  const laneFit = roleFitScore(lanes.plan)
  const strengths = strongest(scores).map(([dimension, score]) => `${dimension} is a clear asset (${score}/100).`)
  const gaps: string[] = []
  if (scores.Teamfight < 50) gaps.push('No dependable large-scale initiation; fights may start on the opponent’s terms.')
  if (scores.Push < 50) gaps.push('Limited tower conversion; successful kills may not become objectives.')
  if (scores.Pickoff < 50) gaps.push('Low catch density against split-push or mobile cores.')
  if (scores.Sustain < 50) gaps.push('Little reset or save; long engagements become difficult.')
  if (scores.Scaling < 52) gaps.push('The lineup loses relative value if the game reaches late six-slot fights.')
  if (scores.Execution < 52) gaps.push('High execution burden: summons, cooldown layering, or greedy resource distribution must be clean.')
  if (!gaps.length) gaps.push('No structural hole, but the lineup still depends on hitting its item windows on time.')

  const peakScore = (scores.Teamfight + scores.Push + scores.Pickoff) / 3
  const peakWindow = scores.Scaling > peakScore + 8 ? '32–45 min' : peakScore > scores.Scaling + 8 ? '16–28 min' : '22–36 min'
  const winConditions = [
    scores.Push >= 60 ? 'Turn the first won fight into towers or Roshan immediately.' : 'Create vision-led kills before attempting protected objectives.',
    scores.Teamfight >= scores.Pickoff ? 'Fight around major ultimates and force the opponent into grouped engagements.' : 'Keep the map open and isolate targets before five-on-five fights begin.',
    scores.Scaling >= 65 ? 'Protect core farm until the second and third major items arrive.' : `Accelerate the game during the ${peakWindow} power window.`,
  ]

  return {
    scores,
    archetype: inferArchetype(scores),
    pressureProfile: pressureProfile(scores),
    riskLevel: riskLevel(scores, laneFit),
    strengths,
    gaps,
    winConditions,
    spikes: buildSpikes(heroes),
    peakWindow,
    lanePlan: lanes.plan,
    laneEvidence: lanes.evidence,
    damageProfile: inferDamageProfile(heroes),
    responseItems: [],
    objectivePlan: objectivePlan(scores, peakWindow),
  }
}

function edge(a: number, b: number): Team | 'even' {
  if (Math.abs(a - b) < 5) return 'even'
  return a > b ? 'radiant' : 'dire'
}

function seeded(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

function observedDraftScore(team: Hero[], enemies: Hero[], meta?: RecentProMeta | null) {
  if (!meta) return 0
  const evidence: number[] = []
  for (let i = 0; i < team.length; i += 1) {
    for (let j = i + 1; j < team.length; j += 1) {
      const key = team[i].id < team[j].id ? `${team[i].id}:${team[j].id}` : `${team[j].id}:${team[i].id}`
      if (meta.synergy[key] !== undefined) evidence.push(meta.synergy[key])
    }
    for (const enemy of enemies) {
      const value = meta.counters[`${team[i].id}:${enemy.id}`]
      if (value !== undefined) evidence.push(value)
    }
  }
  return evidence.length ? evidence.reduce((sum, value) => sum + value, 0) / evidence.length * 8 : 0
}

function proCoverage(heroes: Hero[], meta?: RecentProMeta | null) {
  if (!meta) return 0
  return heroes.filter((hero) => {
    const signal = meta.heroSignals[hero.id]
    return signal && signal.picks + signal.bans >= 1
  }).length
}

function durationWeights(radiant: TeamAnalysis, dire: TeamAnalysis) {
  const tempo = (radiant.scores.Laning + dire.scores.Laning) * 0.2
    + (radiant.scores.Push + dire.scores.Push) * 0.25
    + (radiant.scores.Pickoff + dire.scores.Pickoff) * 0.15
  const scaling = (radiant.scores.Scaling + dire.scores.Scaling) * 0.28
    + (radiant.scores.Sustain + dire.scores.Sustain) * 0.12
  const early = Math.max(0.18, Math.min(0.42, 0.26 + (tempo - scaling) / 420))
  const late = Math.max(0.16, Math.min(0.36, 0.24 + (scaling - tempo) / 460))
  return { early, mid: Math.max(0.34, 1 - early - late), late }
}

function rolePenalty(team: TeamAnalysis) {
  const fit = roleFitScore(team.lanePlan)
  const confidencePenalty = fit < 35 ? 4.5 : fit < 48 ? 2.5 : 0
  const riskPenalty = team.riskLevel === 'High' ? 3 : team.riskLevel === 'Medium' ? 1.4 : 0
  return confidencePenalty + riskPenalty
}

export function analyzeDraft(radiantHeroes: Hero[], direHeroes: Hero[], meta?: RecentProMeta | null): MatchupAnalysis {
  const radiant = analyzeTeam(radiantHeroes, meta)
  const dire = analyzeTeam(direHeroes, meta)
  radiant.responseItems = responseItems(dire)
  dire.responseItems = responseItems(radiant)
  const observedR = observedDraftScore(radiantHeroes, direHeroes, meta)
  const observedD = observedDraftScore(direHeroes, radiantHeroes, meta)
  const earlyR = radiant.scores.Laning * 0.55 + radiant.scores.Pickoff * 0.25 + radiant.scores.Push * 0.2 + observedR - rolePenalty(radiant)
  const earlyD = dire.scores.Laning * 0.55 + dire.scores.Pickoff * 0.25 + dire.scores.Push * 0.2 + observedD - rolePenalty(dire)
  const midR = radiant.scores.Teamfight * 0.35 + radiant.scores.Pickoff * 0.25 + radiant.scores.Push * 0.25 + radiant.scores.Roshan * 0.15 + observedR - rolePenalty(radiant) * 0.7
  const midD = dire.scores.Teamfight * 0.35 + dire.scores.Pickoff * 0.25 + dire.scores.Push * 0.25 + dire.scores.Roshan * 0.15 + observedD - rolePenalty(dire) * 0.7
  const lateR = radiant.scores.Scaling * 0.52 + radiant.scores.Teamfight * 0.28 + radiant.scores.Sustain * 0.2 + observedR - rolePenalty(radiant) * 0.35
  const lateD = dire.scores.Scaling * 0.52 + dire.scores.Teamfight * 0.28 + dire.scores.Sustain * 0.2 + observedD - rolePenalty(dire) * 0.35
  const seed = [...radiantHeroes, ...direHeroes].reduce((sum, hero, index) => sum + hero.id * (index + 3), 17)
  const random = seeded(seed)
  const simulationRuns = 25_000
  const weights = durationWeights(radiant, dire)
  let radiantWins = 0

  for (let run = 0; run < simulationRuns; run += 1) {
    const durationRoll = random()
    const baseR = durationRoll < weights.early ? earlyR : durationRoll < weights.early + weights.mid ? midR : lateR
    const baseD = durationRoll < weights.early ? earlyD : durationRoll < weights.early + weights.mid ? midD : lateD
    const executionR = (radiant.scores.Execution - 50) * 0.1
    const executionD = (dire.scores.Execution - 50) * 0.1
    const chaos = 15 - (radiant.scores.Execution + dire.scores.Execution - 100) * 0.035
    const varianceR = (random() + random() + random() - 1.5) * chaos
    const varianceD = (random() + random() + random() - 1.5) * chaos
    if (baseR + executionR + varianceR > baseD + executionD + varianceD) radiantWins += 1
  }

  const radiantProbability = Math.max(8, Math.min(92, Math.round(radiantWins / simulationRuns * 100)))
  const direProbability = 100 - radiantProbability
  const samplingMargin = Math.max(1, Math.ceil(1.96 * Math.sqrt((radiantProbability / 100) * (1 - radiantProbability / 100) / simulationRuns) * 100))
  const favored: Team | 'even' = Math.abs(radiantProbability - 50) < 4 ? 'even' : radiantProbability > 50 ? 'radiant' : 'dire'
  const stageEdge = { early: edge(earlyR, earlyD), mid: edge(midR, midD), late: edge(lateR, lateD) }
  const favoriteName = favored === 'even' ? 'Neither team' : favored === 'radiant' ? 'Radiant' : 'Dire'
  const headline = favored === 'even'
    ? 'The draft is structurally even; execution and the first major objective should decide it.'
    : `${favoriteName} holds the cleaner overall path, but the advantage changes across game stages.`

  const dimensions = (Object.keys(radiant.scores) as Dimension[])
    .map((dimension) => ({ dimension, delta: radiant.scores[dimension] - dire.scores[dimension] }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3)
  const decidingFactors = dimensions.map(({ dimension, delta }) => `${delta > 0 ? 'Radiant' : 'Dire'} leads ${dimension.toLowerCase()} by ${Math.abs(delta)} points.`)
  const simulationInsights = [
    `Duration model: ${Math.round(weights.early * 100)}% early, ${Math.round(weights.mid * 100)}% mid, ${Math.round(weights.late * 100)}% late-game trials.`,
    `Role pressure: Radiant ${radiant.riskLevel.toLowerCase()} risk vs Dire ${dire.riskLevel.toLowerCase()} risk.`,
    meta ? `Pro overlap: Radiant ${proCoverage(radiantHeroes, meta)}/5 heroes and Dire ${proCoverage(direHeroes, meta)}/5 heroes appear in the current patch sample.` : 'Pro overlap is unavailable, so this run uses role-tag estimates only.',
  ]

  const modelBasis = meta ? `${meta.matchesAnalyzed} current-patch pro drafts${meta.matchesWithPositions ? ` · ${meta.matchesWithPositions} with role data` : ''}` : 'Role-tag estimates only'
  return { radiant, dire, probability: { radiant: radiantProbability, dire: direProbability }, stageEdge, favored, headline, decidingFactors, simulationInsights, simulationRuns, samplingMargin, modelBasis }
}
