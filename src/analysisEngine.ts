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
const SAVE = ['abaddon', 'dazzle', 'oracle', 'shadow_demon', 'tusk', 'vengefulspirit', 'winter_wyvern', 'wisp']
const TEAMFIGHT_ULT = ['ancient_apparition', 'dark_seer', 'disruptor', 'earthshaker', 'enigma', 'faceless_void', 'magnataur', 'mars', 'phoenix', 'sand_king', 'tidehunter', 'warlock']
const SPLIT_PUSH = ['arc_warden', 'broodmother', 'furion', 'lone_druid', 'lycan', 'naga_siren', 'terrorblade', 'tinker']
const BKB_PIERCING = ['axe', 'bane', 'beastmaster', 'batrider', 'doom_bringer', 'enigma', 'faceless_void', 'legion_commander', 'magnataur', 'pudge', 'shadow_demon', 'spirit_breaker']

const key = (hero: Hero) => hero.name.replace('npc_dota_hero_', '')
const inList = (hero: Hero, list: string[]) => list.includes(key(hero))
const roleCount = (heroes: Hero[], role: string) => heroes.filter((h) => h.roles.includes(role)).length
const listCount = (heroes: Hero[], list: string[]) => heroes.filter((h) => inList(h, list)).length
const clamp = (value: number) => Math.max(18, Math.min(96, Math.round(value)))
const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
const names = (heroes: Hero[], limit = 2) => heroes.slice(0, limit).map((hero) => hero.localizedName).join(' + ')
const scoreDelta = (team: TeamAnalysis, opponent: TeamAnalysis, dimension: Dimension) => team.scores[dimension] - opponent.scores[dimension]

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
  const saves = listCount(heroes, SAVE)
  const teamfightUltimates = listCount(heroes, TEAMFIGHT_ULT)
  const splitPush = listCount(heroes, SPLIT_PUSH)
  const bkbPierce = listCount(heroes, BKB_PIERCING)

  return {
    Laning: clamp(34 + ranged * 7 + supports * 7 + nukers * 5 + saves * 3 - Math.max(0, carries - 3) * 5),
    Teamfight: clamp(28 + initiators * 10 + disablers * 6 + durable * 4 + supports * 2 + teamfightUltimates * 8),
    Pickoff: clamp(27 + disablers * 8 + nukers * 5 + escape * 3 + listCount(heroes, PICKOFF) * 7 + bkbPierce * 4),
    Push: clamp(24 + pushers * 10 + carries * 3 + splitPush * 6),
    Sustain: clamp(28 + supports * 8 + durable * 5 + saves * 9),
    Scaling: clamp(27 + carries * 8 + hardCarry * 11 + heroes.filter((h) => h.primaryAttr === 'agi').length * 3),
    Roshan: clamp(24 + listCount(heroes, ROSHAN) * 14 + carries * 4 + durable * 3),
    Execution: clamp(88 - micro * 14 - Math.max(0, carries - 2) * 7 + disablers * 2),
  }
}

function buildSpikes(heroes: Hero[]): PowerSpike[] {
  return heroes.flatMap((hero): PowerSpike[] => {
    if (inList(hero, BLINK)) return [{ hero, label: 'Blink Dagger initiation', minuteStart: 12, minuteEnd: 17, impact: 'major' }]
    if (inList(hero, SAVE)) return [{ hero, label: 'First save item / defensive level timing', minuteStart: 13, minuteEnd: 20, impact: 'major' }]
    if (inList(hero, BATTLE_FURY)) return [
      { hero, label: 'Farming accelerator', minuteStart: 12, minuteEnd: 16, impact: 'supporting' },
      { hero, label: 'BKB + damage threshold', minuteStart: 24, minuteEnd: 30, impact: 'major' },
    ]
    if (inList(hero, AURA)) return [{ hero, label: 'First team aura', minuteStart: 15, minuteEnd: 21, impact: 'major' }]
    if (inList(hero, ROSHAN)) return [{ hero, label: 'Roshan damage item / sustain threshold', minuteStart: 14, minuteEnd: 22, impact: 'major' }]
    if (inList(hero, SPLIT_PUSH)) return [{ hero, label: 'Wave-control and map-split timing', minuteStart: 18, minuteEnd: 26, impact: 'major' }]
    if (hero.roles.includes('Carry')) return [{ hero, label: 'BKB / second core item timing', minuteStart: 21, minuteEnd: 28, impact: 'major' }]
    if (hero.roles.includes('Support')) return [{ hero, label: 'Force / Glimmer / shard utility window', minuteStart: 16, minuteEnd: 23, impact: 'supporting' }]
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

function matchupWinConditions(team: TeamAnalysis, opponent: TeamAnalysis, heroes: Hero[], opponentHeroes: Hero[]) {
  const cores = heroes.filter((hero) => hero.roles.includes('Carry'))
  const catchHeroes = heroes.filter((hero) => hero.roles.includes('Disabler') || inList(hero, PICKOFF))
  const enemyScalingCores = opponentHeroes.filter((hero) => hero.roles.includes('Carry') || inList(hero, HARD_CARRY))
  const conditions: string[] = []

  if (scoreDelta(team, opponent, 'Laning') >= 8) {
    conditions.push(`Win at least two lanes, then convert the lane lead into rune control and the first tower before ${names(enemyScalingCores, 1) || 'the enemy cores'} stabilize.`)
  } else if (scoreDelta(team, opponent, 'Laning') <= -8) {
    conditions.push(`Keep the first ten minutes low-loss: protect ${names(cores, 1) || 'the main core'} and avoid giving rotation kills into the enemy lane advantage.`)
  } else {
    conditions.push('Play lanes for parity; the draft edge comes from cleaner rotations and first objective conversion, not raw lane dominance.')
  }

  if (scoreDelta(team, opponent, 'Teamfight') >= 8) {
    conditions.push('Force grouped fights around vision and major cooldowns; do not let the opponent split the map before your initiation lands.')
  } else if (scoreDelta(team, opponent, 'Pickoff') >= 8) {
    conditions.push(`Use ${names(catchHeroes) || 'catch heroes'} to break formation first; every smoke should create a numbers advantage before towers or Roshan.`)
  } else if (team.scores.Push >= 62) {
    conditions.push('Convert catapult waves and won skirmishes into tower damage immediately; the draft loses value if kills do not become map control.')
  } else {
    conditions.push('Delay direct objective attempts until a key enemy cooldown or mobility spell is forced out.')
  }

  if (scoreDelta(team, opponent, 'Scaling') >= 8) {
    conditions.push(`Trade space intelligently and protect ${names(cores, 2) || 'core item timings'}; late-game structure favors this lineup if the map is not collapsed early.`)
  } else if (scoreDelta(team, opponent, 'Scaling') <= -8) {
    conditions.push('End the farming phase early: claim Roshan or two outer towers before the opponent reaches their third major core item.')
  } else {
    conditions.push(`Hit the ${team.peakWindow} window with smoke, wards, and buyback discipline; the draft is timing-sensitive rather than purely late-game favored.`)
  }

  return conditions
}

function matchupObjectivePlan(team: TeamAnalysis, opponent: TeamAnalysis): ObjectiveStep[] {
  const laneDelta = scoreDelta(team, opponent, 'Laning')
  const pushDelta = scoreDelta(team, opponent, 'Push')
  const roshanDelta = scoreDelta(team, opponent, 'Roshan')
  const fightDelta = scoreDelta(team, opponent, 'Teamfight')

  return [
    {
      window: '0-10',
      action: laneDelta >= 8
        ? 'Pressure both side lanes, secure power runes, and force defensive teleports before the first catapult.'
        : laneDelta <= -8
          ? 'Prioritize lane survival, pull equilibrium back, and protect the weakest core from first rotation pressure.'
          : 'Keep lanes even and save first smoke for the strongest level-six or first-ultimate timing.',
    },
    {
      window: '10-18',
      action: pushDelta >= 8
        ? 'Group with catapult waves and convert the first pickoff into two outer towers.'
        : team.scores.Pickoff >= opponent.scores.Teamfight
          ? 'Smoke through deep vision, kill the wave-clear hero, then pressure the nearest tower.'
          : 'Avoid blind tower dives; farm toward the first defensive or teamfight item and fight on your ward line.',
    },
    {
      window: '18-26',
      action: roshanDelta >= 8
        ? 'Set Roshan vision early, force one cooldown, then take the pit with buyback and teleport advantage.'
        : fightDelta >= 8
          ? 'Bait the opponent into a grouped fight outside Roshan before committing to the pit.'
          : 'Cut waves and delay Roshan until a pickoff or enemy smoke failure gives a safe entry.',
    },
    {
      window: team.peakWindow,
      action: scoreDelta(team, opponent, 'Scaling') >= 8
        ? 'Take protected map control while cores complete late-game items; avoid coin-flip high-ground pushes.'
        : 'Use the lineup peak to claim Aegis, remove outer map access, and force high ground before scaling falls off.',
    },
  ]
}

function refineMatchupPlans(team: TeamAnalysis, opponent: TeamAnalysis, heroes: Hero[], opponentHeroes: Hero[]) {
  team.winConditions = matchupWinConditions(team, opponent, heroes, opponentHeroes)
  team.objectivePlan = matchupObjectivePlan(team, opponent)

  if (scoreDelta(team, opponent, 'Roshan') <= -10) {
    team.gaps.unshift('Roshan access is contested; this lineup likely needs a pickoff or ward advantage before entering the pit.')
  }
  if (scoreDelta(team, opponent, 'Teamfight') <= -10 && team.scores.Pickoff < 62) {
    team.gaps.unshift('Teamfight deficit without enough catch means the draft must dodge fair five-on-five engagements.')
  }
  if (scoreDelta(team, opponent, 'Push') <= -10) {
    team.gaps.unshift('Tower damage is slower than the opponent; objective conversion must come from clean kills or Aegis.')
  }

  team.gaps = Array.from(new Set(team.gaps)).slice(0, 5)
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

function heroMetaScore(heroes: Hero[], meta?: RecentProMeta | null) {
  if (!meta?.publicHeroSignals) return 0
  const total = heroes.reduce((sum, hero) => {
    const signal = meta.publicHeroSignals?.[hero.id]
    if (!signal || signal.picks <= 0) return sum
    const winRate = signal.wins / signal.picks
    const credibility = signal.picks / (signal.picks + 6)
    return sum + (winRate - 0.5) * 2 * credibility
  }, 0)
  return total * 6
}

function publicCoverage(heroes: Hero[], meta?: RecentProMeta | null) {
  if (!meta?.publicHeroSignals) return 0
  return heroes.filter((hero) => (meta.publicHeroSignals?.[hero.id]?.picks ?? 0) >= 2).length
}

// Observed hero win rates conditioned on game length (short/mid/long) sharpen each stage's
// base strength beyond what role tags imply — e.g. a hard carry's actual long-game record.
function stageMetaScore(heroes: Hero[], meta: RecentProMeta | null | undefined, bucket: 'short' | 'mid' | 'long') {
  if (!meta?.durationSignals) return 0
  const total = heroes.reduce((sum, hero) => {
    const signal = meta.durationSignals?.[hero.id]?.[bucket]
    if (!signal || signal.picks <= 0) return sum
    const winRate = signal.wins / signal.picks
    const credibility = signal.picks / (signal.picks + 5)
    return sum + (winRate - 0.5) * 2 * credibility
  }, 0)
  return total * 5
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

function dimensionImpact(dimension: Dimension) {
  switch (dimension) {
    case 'Laning': return 'stronger opening lanes should decide rune control and the first tower tempo'
    case 'Teamfight': return 'cleaner five-on-five tools make Roshan and high-ground fights easier to force'
    case 'Pickoff': return 'better catch can create numbers advantages before committing to objectives'
    case 'Push': return 'tower damage converts won fights into map control faster'
    case 'Sustain': return 'more save/reset tools should extend fights and punish over-commitment'
    case 'Scaling': return 'the draft has a clearer late-game insurance policy if the map stays playable'
    case 'Roshan': return 'Aegis access is easier, especially after the first clean kill or cooldown trade'
    case 'Execution': return 'the lineup is easier to execute under pressure and less punished by messy fights'
    default: return 'this edge changes how the draft should be played'
  }
}

export function analyzeDraft(radiantHeroes: Hero[], direHeroes: Hero[], meta?: RecentProMeta | null): MatchupAnalysis {
  const radiant = analyzeTeam(radiantHeroes, meta)
  const dire = analyzeTeam(direHeroes, meta)
  radiant.responseItems = responseItems(dire)
  dire.responseItems = responseItems(radiant)
  refineMatchupPlans(radiant, dire, radiantHeroes, direHeroes)
  refineMatchupPlans(dire, radiant, direHeroes, radiantHeroes)
  const observedR = observedDraftScore(radiantHeroes, direHeroes, meta)
  const observedD = observedDraftScore(direHeroes, radiantHeroes, meta)
  const laneFitR = roleFitScore(radiant.lanePlan)
  const laneFitD = roleFitScore(dire.lanePlan)
  const matchupFitR = observedR + heroMetaScore(radiantHeroes, meta) + (laneFitR - 50) * 0.06 - rolePenalty(radiant)
  const matchupFitD = observedD + heroMetaScore(direHeroes, meta) + (laneFitD - 50) * 0.06 - rolePenalty(dire)
  const earlyR = radiant.scores.Laning * 0.5 + radiant.scores.Pickoff * 0.22 + radiant.scores.Push * 0.18 + radiant.scores.Sustain * 0.1 + matchupFitR + stageMetaScore(radiantHeroes, meta, 'short')
  const earlyD = dire.scores.Laning * 0.5 + dire.scores.Pickoff * 0.22 + dire.scores.Push * 0.18 + dire.scores.Sustain * 0.1 + matchupFitD + stageMetaScore(direHeroes, meta, 'short')
  const midR = radiant.scores.Teamfight * 0.32 + radiant.scores.Pickoff * 0.22 + radiant.scores.Push * 0.22 + radiant.scores.Roshan * 0.16 + radiant.scores.Execution * 0.08 + matchupFitR * 0.75 + stageMetaScore(radiantHeroes, meta, 'mid')
  const midD = dire.scores.Teamfight * 0.32 + dire.scores.Pickoff * 0.22 + dire.scores.Push * 0.22 + dire.scores.Roshan * 0.16 + dire.scores.Execution * 0.08 + matchupFitD * 0.75 + stageMetaScore(direHeroes, meta, 'mid')
  const lateR = radiant.scores.Scaling * 0.48 + radiant.scores.Teamfight * 0.25 + radiant.scores.Sustain * 0.18 + radiant.scores.Execution * 0.09 + matchupFitR * 0.35 + stageMetaScore(radiantHeroes, meta, 'long')
  const lateD = dire.scores.Scaling * 0.48 + dire.scores.Teamfight * 0.25 + dire.scores.Sustain * 0.18 + dire.scores.Execution * 0.09 + matchupFitD * 0.35 + stageMetaScore(direHeroes, meta, 'long')
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

  const rawRadiantProbability = Math.max(8, Math.min(92, radiantWins / simulationRuns * 100))
  // Backtest-derived shrink: raw simulation edges overstate real outcomes, so scale the
  // displayed edge by the factor measured against stored match results.
  const shrink = meta?.calibration ? Math.max(0.1, Math.min(1, meta.calibration.shrink)) : 1
  const radiantProbability = Math.round(50 + (rawRadiantProbability - 50) * shrink)
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
  const decidingFactors = dimensions.map(({ dimension, delta }) => {
    const leader = delta > 0 ? 'Radiant' : 'Dire'
    return `${leader} leads ${dimension.toLowerCase()} by ${Math.abs(delta)}: ${dimensionImpact(dimension)}.`
  })
  const confidence = Math.abs(radiantProbability - 50) >= 14 ? 'high' : Math.abs(radiantProbability - 50) >= 8 ? 'moderate' : 'thin'
  const laneFitInsight = `Lane model confidence: Radiant ${Math.round(laneFitR)}% fit (${radiant.laneEvidence}) vs Dire ${Math.round(laneFitD)}% fit (${dire.laneEvidence}).`
  const simulationInsights = [
    `Win estimate confidence is ${confidence}; read small edges as draft pressure, not a guaranteed result.`,
    `Duration model: ${Math.round(weights.early * 100)}% early, ${Math.round(weights.mid * 100)}% mid, ${Math.round(weights.late * 100)}% late-game trials.`,
    laneFitInsight,
    `Role pressure: Radiant ${radiant.riskLevel.toLowerCase()} risk vs Dire ${dire.riskLevel.toLowerCase()} risk.`,
    meta ? `Pro overlap: Radiant ${proCoverage(radiantHeroes, meta)}/5 heroes and Dire ${proCoverage(direHeroes, meta)}/5 heroes appear in the current patch sample.` : 'Pro overlap is unavailable, so this run uses role-tag estimates only.',
  ]
  if (meta?.publicMatchesAnalyzed) {
    simulationInsights.push(`High-rank sample: ${meta.publicMatchesAnalyzed} ranked Divine+ matches back hero win rates (Radiant ${publicCoverage(radiantHeroes, meta)}/5, Dire ${publicCoverage(direHeroes, meta)}/5 heroes well-sampled).`)
  }
  if (meta?.matchesWithDuration) {
    simulationInsights.push(`Stage model uses game-length win rates from ${meta.matchesWithDuration.toLocaleString()} matches with known durations.`)
  }
  if (meta?.calibration) {
    simulationInsights.push(`Backtest: the model's favored side won ${Math.round(meta.calibration.accuracy * 100)}% of ${meta.calibration.matches.toLocaleString()} stored real matches (Brier ${meta.calibration.brier.toFixed(3)}).`)
  }

  const modelBasis = meta
    ? `${meta.matchesAnalyzed} current-patch pro drafts${meta.matchesWithPositions ? ` · ${meta.matchesWithPositions} with role data` : ''}${meta.publicMatchesAnalyzed ? ` · ${meta.publicMatchesAnalyzed} high-rank ranked matches` : ''}${meta.calibration ? ` · ${Math.round(meta.calibration.accuracy * 100)}% backtest accuracy on ${meta.calibration.matches.toLocaleString()} matches` : ''}`
    : 'Role-tag estimates only'
  return { radiant, dire, probability: { radiant: radiantProbability, dire: direProbability }, stageEdge, favored, headline, decidingFactors, simulationInsights, simulationRuns, samplingMargin, modelBasis }
}
