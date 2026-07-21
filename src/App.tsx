import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, AlertTriangle, Archive, BarChart3, Bot, BrainCircuit, Check, ChevronDown, Clock3, Crosshair,
  Map, Music, Music2, RotateCcw, Save, Search, Sparkles, Swords, Target, Trash2, TrendingUp, Wifi,
  X,
} from 'lucide-react'
import { analyzeDraft, type Dimension, type MatchupAnalysis } from './analysisEngine'
import { chooseHero, coachSuggestions, DRAFT_ORDER, teamName } from './draftEngine'
import { fallbackHeroes, loadHeroes } from './heroData'
import { loadRecentProMeta } from './recentMeta'
import type { DraftAction, DraftMode, Hero, RecentProMeta, Strategy, Team } from './types'

const strategies: { id: Strategy; label: string; description: string; icon: typeof BrainCircuit }[] = [
  { id: 'balanced', label: 'Adaptive', description: 'Fills gaps, reacts to reveals', icon: BrainCircuit },
  { id: 'meta', label: 'Meta', description: 'Current-patch winners', icon: Sparkles },
  { id: 'counter', label: 'Counter', description: 'Targets & denies matchups', icon: Target },
  { id: 'cheese', label: 'Cheese', description: 'Off-meta surprise threats', icon: Swords },
]

const attrLabels = { str: 'Strength', agi: 'Agility', int: 'Intelligence', all: 'Universal' }
const SAVED_REPORTS_KEY = 'draftsmith_saved_reports'
const MUSIC_PREF_KEY = 'draftsmith_music_enabled'
const MUSIC_VOLUME = 0.48
const DRAFT_BGM_SOURCE = '/audio/draft.mpeg'
const DRAFT_START_CUE_SOURCE = '/audio/01.mpeg'
const CAPTAINS_CUE_SOURCE = '/audio/captains.mpeg'
const HERO_PICKED_CUE_SOURCE = '/audio/hero_picked.mpeg'
const HERO_BAN_CUE_SOURCE = '/audio/hero_ban.mpeg'
const DRAFT_DONE_CUE_SOURCE = '/audio/draft_done.mpeg'
const FIRST_TURN_CUE_DELAY_MS = 3000
const TURN_TIME_SECONDS = 30
const STARTING_RESERVE_SECONDS = 70
const TURN_CUES = {
  enemy_ban: '/audio/enemy_ban.mpeg',
  enemy_pick: '/audio/enemy_pick.mpeg',
  user_ban: '/audio/user_ban.mpeg',
  user_pick: '/audio/user_pick.mpeg',
} as const

type ReportTeam = {
  heroes: string[]
  archetype: string
  damageProfile: string
  riskLevel: string
  peakWindow: string
  laneEvidence: string
  lanes: { lane: string; heroes: string; evidence: string }[]
  scores: Record<Dimension, number>
  strengths: string[]
  gaps: string[]
  winConditions: string[]
  responseItems: string[]
  objectivePlan: { window: string; action: string }[]
  spikes: { hero: string; label: string; window: string; impact: string }[]
}

type ReportSequenceEntry = {
  order: number
  type: 'pick' | 'ban'
  team: Team
  hero: string
  phase: number
}

type SavedDraftReport = {
  id: string
  createdAt: number
  title: string
  headline: string
  probability: Record<Team, number>
  favored: Team | 'even'
  stageEdge: MatchupAnalysis['stageEdge']
  simulationRuns: number
  samplingMargin: number
  modelBasis: string
  decidingFactors: string[]
  simulationInsights: string[]
  sequence?: ReportSequenceEntry[]
  radiant: ReportTeam
  dire: ReportTeam
}

const makeId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
const randomDelay = (min: number, max: number) => Math.round(min + Math.random() * (max - min))

function aiTurnDelay(type: DraftAction['type'], watchMode: boolean) {
  if (watchMode) return type === 'pick' ? randomDelay(1400, 3400) : randomDelay(1000, 2600)
  return type === 'pick' ? randomDelay(2600, 7600) : randomDelay(1800, 5200)
}

function formatClock(seconds: number) {
  const clamped = Math.max(0, seconds)
  return `${Math.floor(clamped / 60)}:${String(clamped % 60).padStart(2, '0')}`
}

function readSavedReports(): SavedDraftReport[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_REPORTS_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function buildReportSnapshot(actions: DraftAction[], analysis: MatchupAnalysis, id = makeId()): SavedDraftReport {
  const summarizeTeam = (team: Team): ReportTeam => {
    const side = analysis[team]
    const heroes = actions.filter((action) => action.team === team && action.type === 'pick').map((action) => action.hero.localizedName)
    return {
      heroes,
      archetype: side.archetype,
      damageProfile: side.damageProfile,
      riskLevel: side.riskLevel,
      peakWindow: side.peakWindow,
      laneEvidence: side.laneEvidence,
      lanes: side.lanePlan.map((lane) => ({ lane: lane.lane, heroes: lane.heroes.map((hero) => hero.localizedName).join(' + ') || 'Unassigned', evidence: lane.matchup ? `${lane.evidence} · ${lane.matchup}` : lane.evidence })),
      scores: side.scores,
      strengths: side.strengths,
      gaps: side.gaps,
      winConditions: side.winConditions,
      responseItems: side.responseItems,
      objectivePlan: side.objectivePlan,
      spikes: side.spikes.map((spike) => ({ hero: spike.hero.localizedName, label: spike.label, window: `${spike.minuteStart}-${spike.minuteEnd} min`, impact: spike.impact })),
    }
  }
  const radiantNames = actions.filter((action) => action.team === 'radiant' && action.type === 'pick').map((action) => action.hero.localizedName)
  const direNames = actions.filter((action) => action.team === 'dire' && action.type === 'pick').map((action) => action.hero.localizedName)
  return {
    id,
    createdAt: Date.now(),
    title: `${radiantNames.join(', ')} vs ${direNames.join(', ')}`,
    headline: analysis.headline,
    probability: analysis.probability,
    favored: analysis.favored,
    stageEdge: analysis.stageEdge,
    simulationRuns: analysis.simulationRuns,
    samplingMargin: analysis.samplingMargin,
    modelBasis: analysis.modelBasis,
    decidingFactors: analysis.decidingFactors,
    simulationInsights: analysis.simulationInsights,
    sequence: actions.map((action, index) => ({
      order: index + 1,
      type: action.type,
      team: action.team,
      hero: action.hero.localizedName,
      phase: action.phase,
    })),
    radiant: summarizeTeam('radiant'),
    dire: summarizeTeam('dire'),
  }
}

function htmlEscape(value: string | number) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function reportStamp(report: SavedDraftReport) {
  return new Date(report.createdAt).toISOString().slice(0, 16).replace(/[:T]/g, '-')
}

export function buildReportHtml(report: SavedDraftReport) {
  const dimensions = Object.keys(report.radiant.scores) as Dimension[]
  const list = (items: string[]) => items.map((item) => `<li>${htmlEscape(item)}</li>`).join('')
  const pills = (items: string[]) => items.map((item) => `<span>${htmlEscape(item)}</span>`).join('')
  const lineup = (team: ReportTeam, side: Team) => `<div class="lineup ${side}"><small>${side.toUpperCase()}</small>${team.heroes.map((hero, index) => `<span><b>${index + 1}</b>${htmlEscape(hero)}</span>`).join('')}</div>`
  const sequenceItems = (report.sequence ?? []).map((entry) => `
    <li class="${entry.type} ${entry.team}"><small>#${entry.order} · ${entry.team === 'radiant' ? 'Radiant' : 'Dire'} ${entry.type}</small><span>${htmlEscape(entry.hero)}</span></li>
  `).join('')
  const sequenceSection = sequenceItems ? `
    <section class="panel sequence-panel"><h3>Draft sequence</h3><ol class="sequence">${sequenceItems}</ol></section>
  ` : ''
  const lanes = (team: ReportTeam) => team.lanes.map((lane) => `
    <tr><th>${htmlEscape(lane.lane)}</th><td>${htmlEscape(lane.heroes)}</td><td>${htmlEscape(lane.evidence)}</td></tr>
  `).join('')
  const objectives = (team: ReportTeam) => team.objectivePlan.map((step) => `
    <li><strong>${htmlEscape(step.window)}</strong><span>${htmlEscape(step.action)}</span></li>
  `).join('')
  const spikes = (team: ReportTeam) => team.spikes.map((spike) => `
    <tr><td>${htmlEscape(spike.hero)}</td><td>${htmlEscape(spike.label)}</td><td>${htmlEscape(spike.window)}</td><td>${htmlEscape(spike.impact)}</td></tr>
  `).join('')
  const scoreRows = dimensions.map((dimension) => `
    <tr>
      <th>${htmlEscape(dimension)}</th>
      <td>${report.radiant.scores[dimension]}</td>
      <td><div class="meter"><i style="width:${report.radiant.scores[dimension]}%"></i><b style="width:${report.dire.scores[dimension]}%"></b></div></td>
      <td>${report.dire.scores[dimension]}</td>
    </tr>
  `).join('')
  const teamCard = (label: 'Radiant' | 'Dire', team: ReportTeam, side: Team) => `
    <section class="team-card ${side}">
      <header>
        <small>${label}</small>
        <h2>${htmlEscape(team.archetype)}</h2>
        <p>${htmlEscape(team.damageProfile)} · ${htmlEscape(team.riskLevel)} risk · peak ${htmlEscape(team.peakWindow)}</p>
      </header>
      <div class="hero-strip">${team.heroes.map((hero) => `<span>${htmlEscape(hero)}</span>`).join('')}</div>
      <div class="grid-two">
        <div><h3>Win conditions</h3><ul>${list(team.winConditions)}</ul></div>
        <div><h3>What's lacking</h3><ul>${list(team.gaps)}</ul></div>
      </div>
      <h3>Likely lanes <em>${htmlEscape(team.laneEvidence)}</em></h3>
      <table><tbody>${lanes(team)}</tbody></table>
      <div class="grid-two">
        <div><h3>Priority responses</h3><div class="pills">${pills(team.responseItems)}</div></div>
        <div><h3>Objective sequence</h3><ol class="objectives">${objectives(team)}</ol></div>
      </div>
      <h3>Item timing windows</h3>
      <table><thead><tr><th>Hero</th><th>Timing</th><th>Window</th><th>Impact</th></tr></thead><tbody>${spikes(team)}</tbody></table>
    </section>
  `

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>DraftGG Intelligence Report</title>
  <style>
    :root { --ink:#17201e; --muted:#66716e; --line:#d8ddd9; --paper:#fbfaf4; --panel:#ffffff; --radiant:#6f9636; --dire:#bf493e; --gold:#b9924f; }
    * { box-sizing:border-box; }
    body { margin:0; background:#111; color:var(--ink); font-family:Inter, Arial, sans-serif; }
    .sheet { max-width:1120px; margin:24px auto; background:var(--paper); padding:34px; box-shadow:0 22px 70px rgba(0,0,0,.35); }
    .print-actions { display:flex; justify-content:flex-end; gap:10px; margin-bottom:18px; }
    button { border:0; background:#1d2422; color:#fff; padding:10px 14px; border-radius:4px; cursor:pointer; font-weight:800; text-transform:uppercase; letter-spacing:.04em; }
    .lineup-hero { border-bottom:4px solid var(--ink); padding-bottom:18px; margin-bottom:18px; }
    .lineup-title { display:flex; justify-content:space-between; align-items:flex-end; gap:16px; margin-bottom:12px; }
    .lineup-title h1 { margin:0; font-size:28px; line-height:1; letter-spacing:-.02em; text-transform:uppercase; }
    .lineup-title p { margin:0; text-align:right; font-size:13px; }
    .lineup-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .lineup { border:1px solid var(--line); background:#fff; padding:12px; display:grid; grid-template-columns:repeat(5,1fr); gap:7px; }
    .lineup small { grid-column:1/-1; font-size:11px; font-weight:900; letter-spacing:.15em; color:var(--muted); }
    .lineup span { min-height:54px; display:flex; flex-direction:column; justify-content:space-between; border:1px solid #ddd7c8; background:#f7f2e7; padding:8px; font-weight:900; font-size:13px; line-height:1.05; text-transform:uppercase; }
    .lineup span b { color:var(--muted); font-size:10px; }
    .lineup.radiant { border-top:5px solid var(--radiant); }.lineup.dire { border-top:5px solid var(--dire); }
    .mast { display:grid; grid-template-columns:1fr auto; gap:24px; align-items:end; padding-bottom:10px; }
    .kicker, h3 { color:var(--gold); font-size:11px; font-weight:900; letter-spacing:.14em; text-transform:uppercase; }
    h1 { margin:6px 0 8px; font-size:34px; line-height:.95; letter-spacing:-.03em; text-transform:uppercase; }
    .read-title { margin:4px 0 0; font-size:19px; line-height:1; letter-spacing:.01em; text-transform:uppercase; }
    p { color:var(--muted); line-height:1.5; }
    .model { max-width:520px; text-align:right; }
    .model p { margin:0; font-size:11px; }
    .sequence-panel { margin-bottom:14px; }
    .sequence { list-style:none; margin:10px 0 0; padding:0; display:grid; grid-template-columns:repeat(4,1fr); gap:6px; }
    .sequence li { border:1px solid var(--line); border-left-width:4px; background:#fff; padding:6px 8px; display:flex; flex-direction:column; gap:2px; }
    .sequence li.radiant { border-left-color:var(--radiant); }
    .sequence li.dire { border-left-color:var(--dire); }
    .sequence li small { color:var(--muted); font-size:9px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; }
    .sequence li span { font-size:12px; font-weight:900; text-transform:uppercase; line-height:1.1; }
    .sequence li.ban span { color:#8a918d; font-weight:700; text-decoration:line-through; text-decoration-thickness:1px; }
    .prob { display:grid; grid-template-columns:100px 1fr 100px; align-items:center; gap:12px; margin:22px 0; font-weight:900; font-size:28px; }
    .prob small { display:block; font-size:10px; color:var(--muted); letter-spacing:.12em; }
    .prob .dire { text-align:right; color:var(--dire); }.prob .radiant { color:var(--radiant); }
    .bar { height:13px; background:#e6bfba; position:relative; overflow:hidden; }.bar i { display:block; height:100%; background:#a4c85d; }
    .stage { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:20px; }.stage div { background:#fff; border:1px solid var(--line); padding:10px; display:flex; justify-content:space-between; text-transform:uppercase; font-weight:900; }
    .summary { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:18px; }
    .panel, .team-card { background:var(--panel); border:1px solid var(--line); padding:16px; break-inside:avoid; }
    ul, ol { margin:8px 0 0; padding-left:18px; } li { margin:5px 0; color:#38423f; line-height:1.45; }
    table { width:100%; border-collapse:collapse; margin-top:8px; font-size:13px; } th, td { border-bottom:1px solid #e2e5e1; padding:8px; text-align:left; vertical-align:top; } th { color:#39423f; text-transform:uppercase; font-size:11px; letter-spacing:.06em; }
    .meter { height:8px; display:flex; background:#eee; }.meter i { background:var(--radiant); }.meter b { background:var(--dire); }
    .teams { display:grid; grid-template-columns:1fr 1fr; gap:14px; }.team-card header { border-bottom:1px solid var(--line); margin:-16px -16px 14px; padding:14px 16px; }
    .team-card h2 { margin:4px 0; text-transform:uppercase; letter-spacing:.02em; }.team-card.radiant header { border-top:5px solid var(--radiant); }.team-card.dire header { border-top:5px solid var(--dire); }
    .hero-strip { display:flex; flex-wrap:wrap; gap:7px; margin-bottom:14px; }.hero-strip span, .pills span { border:1px solid #d7d2c5; background:#f7f3e9; padding:6px 8px; font-size:12px; font-weight:800; }
    .grid-two { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:12px; } h3 em { color:var(--muted); font-style:normal; font-weight:600; letter-spacing:0; text-transform:none; }
    .pills { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }.objectives { list-style:none; padding-left:0; }.objectives li { display:grid; grid-template-columns:54px 1fr; gap:8px; }
    .foot { margin-top:18px; border-top:1px solid var(--line); padding-top:10px; color:#7b837f; font-size:11px; }
    @media print { body { background:#fff; } .sheet { margin:0; max-width:none; box-shadow:none; padding:12mm; } .print-actions { display:none; } .sequence-panel { break-inside:avoid; } @page { size:A4; margin:10mm; } }
    @media screen and (max-width:800px) { .sheet { margin:0; padding:18px; } .mast,.summary,.teams,.grid-two,.lineup-grid { grid-template-columns:1fr; } .lineup { grid-template-columns:1fr; } .lineup-title { display:block; } .lineup-title p { text-align:left; } .model { text-align:left; } .sequence { grid-template-columns:1fr 1fr; } .prob { grid-template-columns:72px 1fr 72px; font-size:22px; } }
  </style>
</head>
<body>
  <main class="sheet">
    <div class="print-actions"><button onclick="window.print()">Print / Save as PDF</button></div>
    <section class="lineup-hero">
      <div class="lineup-title">
        <div><div class="kicker">DraftGG Intelligence Report</div><h1>Radiant vs Dire hero lineup</h1></div>
        <p>${htmlEscape(report.headline)}</p>
      </div>
      <div class="lineup-grid">${lineup(report.radiant, 'radiant')}${lineup(report.dire, 'dire')}</div>
    </section>
    <header class="mast">
      <div>
        <div class="kicker">Matchup simulation</div>
        <h2 class="read-title">Draft read</h2>
      </div>
      <aside class="model">
        <p>${report.simulationRuns.toLocaleString()} synthetic trials · ${htmlEscape(report.modelBasis)} · ±${report.samplingMargin} point sampling error<br/>Generated ${htmlEscape(new Date(report.createdAt).toLocaleString())}</p>
      </aside>
    </header>
    ${sequenceSection}
    <section class="prob"><div class="radiant">${report.probability.radiant}%<small>Radiant</small></div><div class="bar"><i style="width:${report.probability.radiant}%"></i></div><div class="dire">${report.probability.dire}%<small>Dire</small></div></section>
    <section class="stage"><div><span>Early</span><b>${htmlEscape(report.stageEdge.early)}</b></div><div><span>Mid</span><b>${htmlEscape(report.stageEdge.mid)}</b></div><div><span>Late</span><b>${htmlEscape(report.stageEdge.late)}</b></div></section>
    <section class="summary"><div class="panel"><h3>Deciding factors</h3><ul>${list(report.decidingFactors)}</ul></div><div class="panel"><h3>Simulation read</h3><ul>${list(report.simulationInsights)}</ul></div></section>
    <section class="panel"><h3>Dimension matchup</h3><table><thead><tr><th>Dimension</th><th>Radiant</th><th>Edge</th><th>Dire</th></tr></thead><tbody>${scoreRows}</tbody></table></section>
    <section class="teams">${teamCard('Radiant', report.radiant, 'radiant')}${teamCard('Dire', report.dire, 'dire')}</section>
    <p class="foot">Unofficial fan project. Dota 2 and hero imagery are trademarks and property of Valve Corporation. Meta data by OpenDota where available.</p>
  </main>
</body>
</html>`
}

function openPrintableReport(report: SavedDraftReport) {
  const blob = new Blob([buildReportHtml(report)], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener,noreferrer')
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

function HeroImage({ hero, className = '' }: { hero: Hero; className?: string }) {
  const [failed, setFailed] = useState(false)
  return failed ? (
    <div className={`hero-fallback ${className}`} aria-label={hero.localizedName}>{hero.localizedName.slice(0, 2)}</div>
  ) : (
    <img className={className} src={hero.image} alt={hero.localizedName} loading="lazy" onError={() => setFailed(true)} />
  )
}

function draftOrderNumber(team: Team, type: DraftAction['type'], slotIndex: number) {
  let seen = 0
  const orderIndex = DRAFT_ORDER.findIndex((step) => {
    if (step.team !== team || step.type !== type) return false
    seen += 1
    return seen === slotIndex + 1
  })
  return orderIndex >= 0 ? orderIndex + 1 : slotIndex + 1
}

function DraftSlot({ action, type, index, team, orderNumber }: { action?: DraftAction; type: 'pick' | 'ban'; index: number; team: Team; orderNumber: number }) {
  return (
    <div className={`draft-slot ${type} ${action ? 'filled' : ''}`}>
      {action ? <HeroImage hero={action.hero} /> : <span>{orderNumber}</span>}
      {action && <b className="slot-number">{orderNumber}</b>}
      {action && type === 'pick' && <small>{action.hero.localizedName}</small>}
      <span className={`slot-accent ${team}`} />
    </div>
  )
}

function TeamRail({ team, actions }: { team: Team; actions: DraftAction[] }) {
  const picks = actions.filter((a) => a.team === team && a.type === 'pick')
  const bans = actions.filter((a) => a.team === team && a.type === 'ban')
  return (
    <aside className={`team-rail ${team}`} aria-label={`${teamName(team)} draft`}>
      <div className="team-heading">
        <span className="team-gem" />
        <div><small>{team === 'radiant' ? 'THE' : 'THE'}</small><strong>{teamName(team).toUpperCase()}</strong></div>
      </div>
      <div className="pick-stack">
        {Array.from({ length: 5 }, (_, index) => <DraftSlot key={index} action={picks[index]} type="pick" index={index} team={team} orderNumber={draftOrderNumber(team, 'pick', index)} />)}
      </div>
      <div className="ban-label"><span>BANS</span><i /></div>
      <div className="ban-grid">
        {Array.from({ length: 7 }, (_, index) => <DraftSlot key={index} action={bans[index]} type="ban" index={index} team={team} orderNumber={draftOrderNumber(team, 'ban', index)} />)}
      </div>
    </aside>
  )
}

function StartScreen({ onStart, heroLive }: { onStart: (mode: DraftMode) => void; heroLive: boolean }) {
  return (
    <main className="start-screen">
      <div className="start-noise" />
      <section className="start-content">
        <div className="wordmark large"><img className="brand-logo" src="/logo.png" alt="DraftGG" /></div>
        <div className="eyebrow"><span /> INTELLIGENT CAPTAIN'S MODE <span /></div>
        <h1>Outdraft the<br /><em>machine.</em></h1>
        <p className="intro">A frictionless Dota 2 draft room with an adaptive system captain. Read the meta, build a plan, or force something weird.</p>

        <div className="start-actions">
          <button className="primary-action radiant-action" onClick={() => onStart({ playerTeam: 'radiant', strategy: 'balanced' })}>
            <span>Draft as Radiant</span><small>You pick first</small>
          </button>
          <button className="primary-action dire-action" onClick={() => onStart({ playerTeam: 'dire', strategy: 'balanced' })}>
            <span>Draft as Dire</span><small>AI opens draft</small>
          </button>
          <button className="watch-action" onClick={() => onStart({ playerTeam: null, strategy: 'balanced' })}><Bot size={18} /> Watch AI vs AI</button>
        </div>

        <div className="start-meta">
          <span className={heroLive ? 'online' : 'local'}>{heroLive ? <Wifi size={13} /> : <Archive size={13} />}{heroLive ? 'Live OpenDota roster' : 'Bundled roster ready'}</span>
          <span>No login</span><span>Free to practice</span><span>Local feedback</span>
        </div>
      </section>
      <div className="start-orb orb-one" /><div className="start-orb orb-two" />
    </main>
  )
}

function DraftComplete({
  actions,
  recentMeta,
  onRestart,
  onSaveReport,
}: {
  actions: DraftAction[]
  recentMeta: RecentProMeta | null
  onRestart: () => void
  onSaveReport: (report: SavedDraftReport) => void
}) {
  const [rated, setRated] = useState(false)
  const [saved, setSaved] = useState(false)
  const [tab, setTab] = useState<'overview' | 'timings' | 'conditions' | 'plan'>('overview')
  const reportId = useRef(makeId())
  const radiant = actions.filter((a) => a.team === 'radiant' && a.type === 'pick')
  const dire = actions.filter((a) => a.team === 'dire' && a.type === 'pick')
  const radiantHeroes = useMemo(() => radiant.map((a) => a.hero), [radiant])
  const direHeroes = useMemo(() => dire.map((a) => a.hero), [dire])
  const analysis = useMemo(() => analyzeDraft(radiantHeroes, direHeroes, recentMeta), [radiantHeroes, direHeroes, recentMeta])
  const report = useMemo(() => buildReportSnapshot(actions, analysis, reportId.current), [actions, analysis])
  const dimensions = Object.keys(analysis.radiant.scores) as Dimension[]
  const rate = (value: 'good' | 'poor') => {
    const current = JSON.parse(localStorage.getItem('draftsmith_feedback') ?? '[]') as string[]
    localStorage.setItem('draftsmith_feedback', JSON.stringify([...current.slice(-49), value]))
    setRated(true)
  }
  const saveReport = () => {
    onSaveReport(report)
    setSaved(true)
  }
  return (
    <div className="complete-overlay" role="dialog" aria-modal="true" aria-labelledby="complete-title">
      <div className="complete-card analysis-card">
        <div className="report-head">
          <div><div className="complete-kicker"><Activity size={14} /> MATCHUP SIMULATION</div><h2 id="complete-title">Draft intelligence report</h2><p>{analysis.headline}</p></div>
          <span className="model-note"><Bot size={14} /> {analysis.simulationRuns.toLocaleString()} synthetic model trials<small>{analysis.modelBasis} · ±{analysis.samplingMargin} point sampling error</small></span>
        </div>
        <div className="final-lineups">
          <div><small>RADIANT</small><span>{radiant.map((h) => <HeroImage hero={h.hero} key={h.hero.id} />)}</span></div>
          <div><small>DIRE</small><span>{dire.map((h) => <HeroImage hero={h.hero} key={h.hero.id} />)}</span></div>
        </div>
        <div className="probability-block">
          <strong className="radiant-prob">{analysis.probability.radiant}% <small>RADIANT</small></strong>
          <div className="probability-track"><i style={{ width: `${analysis.probability.radiant}%` }} /><span /></div>
          <strong className="dire-prob"><small>DIRE</small> {analysis.probability.dire}%</strong>
        </div>
        <div className="stage-edges">
          {(['early', 'mid', 'late'] as const).map((stage) => <span key={stage}><small>{stage.toUpperCase()} GAME</small><strong className={analysis.stageEdge[stage]}>{analysis.stageEdge[stage] === 'even' ? 'Even' : teamName(analysis.stageEdge[stage])}</strong></span>)}
        </div>
        <div className="report-tabs" role="tablist" aria-label="Analysis sections">
          <button role="tab" aria-selected={tab === 'overview'} className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}><BarChart3 size={14} /> Matchup</button>
          <button role="tab" aria-selected={tab === 'timings'} className={tab === 'timings' ? 'active' : ''} onClick={() => setTab('timings')}><Clock3 size={14} /> Item timings</button>
          <button role="tab" aria-selected={tab === 'conditions'} className={tab === 'conditions' ? 'active' : ''} onClick={() => setTab('conditions')}><Crosshair size={14} /> Win conditions</button>
          <button role="tab" aria-selected={tab === 'plan'} className={tab === 'plan' ? 'active' : ''} onClick={() => setTab('plan')}><Map size={14} /> Game plan</button>
        </div>
        <div className="report-body">
          {tab === 'overview' && <>
            <div className="dimension-table">
              {dimensions.map((dimension) => {
                const radiantScore = analysis.radiant.scores[dimension]
                const direScore = analysis.dire.scores[dimension]
                const delta = radiantScore - direScore
                const lead = delta >= 8 ? 'lead-radiant' : delta <= -8 ? 'lead-dire' : ''
                return <div className="dimension-row" key={dimension}><strong>{radiantScore}</strong><div><small className={lead}>{dimension}{lead && <b>{delta > 0 ? `+${delta}` : delta}</b>}</small><span><i className="r-bar" style={{ width: `${radiantScore / 2}%` }} /><i className="d-bar" style={{ width: `${direScore / 2}%` }} /></span></div><strong>{direScore}</strong></div>
              })}
            </div>
            <div className="factor-panel"><small>DECIDING FACTORS</small>{analysis.decidingFactors.map((factor) => <p key={factor}><TrendingUp size={13} />{factor}</p>)}</div>
            <div className="simulation-panel"><small>SIMULATION READ</small>{analysis.simulationInsights.map((insight) => <p key={insight}><Activity size={13} />{insight}</p>)}</div>
          </>}
          {tab === 'timings' && <div className="timing-columns">
            {(['radiant', 'dire'] as const).map((team) => <section key={team} className={team}><header><strong>{teamName(team)}</strong><span>Peak window {analysis[team].peakWindow}</span></header>{analysis[team].spikes.map((spike, index) => <div className="spike-row" key={`${spike.hero.id}-${index}`}><HeroImage hero={spike.hero} /><div><strong>{spike.hero.localizedName}</strong><span>{spike.label}</span></div><time>{spike.minuteStart}–{spike.minuteEnd}<small>MIN</small></time></div>)}</section>)}
            <p className="estimate-note"><AlertTriangle size={13} /> Timing ranges are composition-based estimates. Lane result, role assignment, patch, and build choice can move them substantially.</p>
          </div>}
          {tab === 'conditions' && <div className="condition-columns">
            {(['radiant', 'dire'] as const).map((team) => <section key={team}><header><strong>{teamName(team)}</strong><span>{analysis[team].archetype} · {analysis[team].riskLevel} risk</span></header><div className="condition-group profile"><small>PRESSURE PROFILE</small><p><Activity size={13} />{analysis[team].pressureProfile}</p></div><div className="condition-group"><small>WIN CONDITIONS</small>{analysis[team].winConditions.map((item) => <p key={item}><Check size={13} />{item}</p>)}</div><div className="condition-group gaps"><small>WHAT'S LACKING</small>{analysis[team].gaps.map((item) => <p key={item}><AlertTriangle size={13} />{item}</p>)}</div></section>)}
          </div>}
          {tab === 'plan' && <div className="plan-columns">
            {(['radiant', 'dire'] as const).map((team) => <section key={team} className={team}><header><div><strong>{teamName(team)}</strong><span>{analysis[team].damageProfile}</span></div><small>{analysis[team].laneEvidence}</small></header><div className="lane-plan"><small>LIKELY LANES</small>{analysis[team].lanePlan.map((lane) => <div key={lane.lane}><strong>{lane.lane}</strong><span>{lane.heroes.map((hero) => hero.localizedName).join(' + ')}</span><em>{lane.evidence}</em>{lane.matchup && <i className={lane.matchup.startsWith('Favored') ? 'edge-favored' : lane.matchup.startsWith('Tough') ? 'edge-tough' : 'edge-even'}>{lane.matchup}</i>}</div>)}</div><div className="response-items"><small>PRIORITY RESPONSES</small><div>{analysis[team].responseItems.map((item) => <span key={item}>{item}</span>)}</div></div><div className="objective-plan"><small>OBJECTIVE SEQUENCE</small>{analysis[team].objectivePlan.map((step) => <p key={`${step.window}-${step.action}`}><time>{step.window}</time><span>{step.action}</span></p>)}</div></section>)}
            <p className="estimate-note"><AlertTriangle size={13} /> Lane grouping uses observed pro lane and farm-priority roles where available, with role-tag estimates for low-sample heroes. Role-fit percentages expose uncertainty; lane edges blend observed hero counters with laning-power heuristics.</p>
          </div>}
        </div>
        <div className="feedback-row">
          {rated ? <span className="thanks"><Check size={15} /> Feedback saved locally for future evaluation</span> : <><span>Was this analysis useful?</span><button onClick={() => rate('good')}>Useful read</button><button onClick={() => rate('poor')}>Needs work</button></>}
        </div>
        <div className="report-actions">
          <button onClick={saveReport} className={saved ? 'saved' : ''}><Save size={15} /> {saved ? 'Saved to local profile' : 'Save to local profile'}</button>
          <button onClick={() => openPrintableReport(report)}><Archive size={15} /> Print / save PDF</button>
        </div>
        <button className="restart-large" onClick={onRestart}><RotateCcw size={17} /> Start a new draft</button>
      </div>
    </div>
  )
}

function SavedReportsDrawer({
  reports,
  onClose,
  onOpen,
  onDelete,
}: {
  reports: SavedDraftReport[]
  onClose: () => void
  onOpen: (report: SavedDraftReport) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="saved-overlay" role="dialog" aria-modal="true" aria-labelledby="saved-title">
      <section className="saved-drawer">
        <header>
          <div><small>LOCAL PROFILE</small><h2 id="saved-title">Saved intelligence reports</h2></div>
          <button onClick={onClose} aria-label="Close saved reports"><X size={18} /></button>
        </header>
        {reports.length === 0 ? (
          <div className="empty-saved"><Archive size={28} /><strong>No saved reports yet</strong><p>Finish a draft, then save the intelligence report here. Everything stays in this browser profile.</p></div>
        ) : (
          <div className="saved-list">
            {reports.map((report) => (
              <article key={report.id} className="saved-card">
                <small>{new Date(report.createdAt).toLocaleString()}</small>
                <h3>{report.probability.radiant}% Radiant / {report.probability.dire}% Dire</h3>
                <p>{report.headline}</p>
                <div><span>Radiant: {report.radiant.heroes.join(', ')}</span><span>Dire: {report.dire.heroes.join(', ')}</span></div>
                <footer>
                  <button onClick={() => onOpen(report)}><BarChart3 size={14} /> Open report</button>
                  <button onClick={() => openPrintableReport(report)}><Archive size={14} /> PDF / Print</button>
                  <button onClick={() => onDelete(report.id)}><Trash2 size={14} /> Delete</button>
                </footer>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function SavedReportViewer({ report, onClose }: { report: SavedDraftReport; onClose: () => void }) {
  const dimensions = Object.keys(report.radiant.scores) as Dimension[]
  const teamSection = (label: 'Radiant' | 'Dire', team: ReportTeam, side: Team) => (
    <section className={`saved-report-team ${side}`}>
      <header><small>{label}</small><strong>{team.archetype}</strong><span>{team.damageProfile} · {team.riskLevel} risk · {team.peakWindow}</span></header>
      <div className="saved-report-heroes">{team.heroes.map((hero, index) => <span key={hero}><em>{index + 1}</em>{hero}</span>)}</div>
      <div className="saved-report-grid">
        <div><h4>Likely lanes</h4>{team.lanes.map((lane) => <p key={lane.lane}><strong>{lane.lane}</strong><span>{lane.heroes}</span><small>{lane.evidence}</small></p>)}</div>
        <div><h4>Priority responses</h4><div className="saved-report-pills">{team.responseItems.map((item) => <span key={item}>{item}</span>)}</div></div>
        <div><h4>Win conditions</h4><ul>{team.winConditions.map((item) => <li key={item}>{item}</li>)}</ul></div>
        <div><h4>What's lacking</h4><ul>{team.gaps.map((item) => <li key={item}>{item}</li>)}</ul></div>
        <div className="wide"><h4>Objective sequence</h4>{team.objectivePlan.map((step) => <p key={`${step.window}-${step.action}`}><strong>{step.window}</strong><span>{step.action}</span></p>)}</div>
      </div>
    </section>
  )
  return (
    <div className="complete-overlay" role="dialog" aria-modal="true" aria-labelledby="saved-report-title">
      <article className="complete-card analysis-card saved-report-view">
        <div className="report-head">
          <div><div className="complete-kicker"><Activity size={14} /> SAVED INTELLIGENCE REPORT</div><h2 id="saved-report-title">Draft intelligence report</h2><p>{report.headline}</p></div>
          <span className="model-note"><Bot size={14} /> {report.simulationRuns.toLocaleString()} synthetic model trials<small>{report.modelBasis} · ±{report.samplingMargin} point sampling error</small></span>
        </div>
        <div className="saved-report-lineups">
          <div><small>RADIANT</small>{report.radiant.heroes.map((hero) => <span key={hero}>{hero}</span>)}</div>
          <div><small>DIRE</small>{report.dire.heroes.map((hero) => <span key={hero}>{hero}</span>)}</div>
        </div>
        <div className="probability-block">
          <strong className="radiant-prob">{report.probability.radiant}% <small>RADIANT</small></strong>
          <div className="probability-track"><i style={{ width: `${report.probability.radiant}%` }} /><span /></div>
          <strong className="dire-prob"><small>DIRE</small> {report.probability.dire}%</strong>
        </div>
        <div className="stage-edges">
          {(['early', 'mid', 'late'] as const).map((stage) => <span key={stage}><small>{stage.toUpperCase()} GAME</small><strong className={report.stageEdge[stage]}>{report.stageEdge[stage] === 'even' ? 'Even' : teamName(report.stageEdge[stage])}</strong></span>)}
        </div>
        <div className="dimension-table saved-dimensions">
          {dimensions.map((dimension) => <div className="dimension-row" key={dimension}><strong>{report.radiant.scores[dimension]}</strong><div><small>{dimension}</small><span><i className="r-bar" style={{ width: `${report.radiant.scores[dimension] / 2}%` }} /><i className="d-bar" style={{ width: `${report.dire.scores[dimension] / 2}%` }} /></span></div><strong>{report.dire.scores[dimension]}</strong></div>)}
        </div>
        <div className="simulation-panel saved-simulation"><small>SIMULATION READ</small>{report.simulationInsights.map((insight) => <p key={insight}><Activity size={13} />{insight}</p>)}</div>
        <div className="saved-report-teams">{teamSection('Radiant', report.radiant, 'radiant')}{teamSection('Dire', report.dire, 'dire')}</div>
        <div className="report-actions">
          <button onClick={() => openPrintableReport(report)}><Archive size={15} /> Print / save PDF</button>
          <button onClick={onClose}><X size={15} /> Close report</button>
        </div>
      </article>
    </div>
  )
}

export default function App() {
  const [heroes, setHeroes] = useState<Hero[]>(fallbackHeroes)
  const [live, setLive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<DraftMode | null>(null)
  const [actions, setActions] = useState<DraftAction[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [attr, setAttr] = useState<'all' | Hero['primaryAttr']>('all')
  const [role, setRole] = useState('All roles')
  const [countdown, setCountdown] = useState(TURN_TIME_SECONDS)
  const [reserveTime, setReserveTime] = useState<Record<Team, number>>({ radiant: STARTING_RESERVE_SECONDS, dire: STARTING_RESERVE_SECONDS })
  const [thinking, setThinking] = useState(false)
  const [showIntel, setShowIntel] = useState(true)
  const [draftSeed, setDraftSeed] = useState(() => (Math.random() * 1e9) | 0)
  const [recentMeta, setRecentMeta] = useState<RecentProMeta | null>(null)
  const [metaLoading, setMetaLoading] = useState(true)
  const [savedReports, setSavedReports] = useState<SavedDraftReport[]>(readSavedReports)
  const [showSavedReports, setShowSavedReports] = useState(false)
  const [activeSavedReport, setActiveSavedReport] = useState<SavedDraftReport | null>(null)
  const [musicEnabled, setMusicEnabled] = useState(() => localStorage.getItem(MUSIC_PREF_KEY) !== 'false')
  const completionLogged = useRef(false)
  const draftDonePlayed = useRef(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const draftStartCueRef = useRef<HTMLAudioElement | null>(null)
  const captainsCueRef = useRef<HTMLAudioElement | null>(null)
  const heroPickedCueRef = useRef<HTMLAudioElement | null>(null)
  const heroBanCueRef = useRef<HTMLAudioElement | null>(null)
  const draftDoneCueRef = useRef<HTMLAudioElement | null>(null)
  const cueRefs = useRef<Partial<Record<keyof typeof TURN_CUES, HTMLAudioElement>>>({})
  const lastCueStep = useRef(-1)
  const turnCueTimer = useRef<number | null>(null)
  const openingSequenceId = useRef(0)
  const fadeTimer = useRef<number | null>(null)
  const loopFadeActive = useRef(false)

  useEffect(() => {
    loadHeroes().then(({ heroes: loaded, live: isLive }) => {
      setHeroes(loaded); setLive(isLive); setLoading(false)
    })
  }, [])

  useEffect(() => {
    loadRecentProMeta().then(({ meta }) => {
      setRecentMeta(meta)
      setMetaLoading(false)
    })
  }, [])

  useEffect(() => {
    localStorage.setItem(SAVED_REPORTS_KEY, JSON.stringify(savedReports.slice(0, 20)))
  }, [savedReports])

  useEffect(() => {
    const draftStartCue = new Audio(DRAFT_START_CUE_SOURCE)
    draftStartCue.preload = 'auto'
    draftStartCue.volume = 0.82
    draftStartCueRef.current = draftStartCue
    const captainsCue = new Audio(CAPTAINS_CUE_SOURCE)
    captainsCue.preload = 'auto'
    captainsCue.volume = 0.86
    captainsCueRef.current = captainsCue
    const heroPickedCue = new Audio(HERO_PICKED_CUE_SOURCE)
    heroPickedCue.preload = 'auto'
    heroPickedCue.volume = 0.78
    heroPickedCueRef.current = heroPickedCue
    const heroBanCue = new Audio(HERO_BAN_CUE_SOURCE)
    heroBanCue.preload = 'auto'
    heroBanCue.volume = 0.78
    heroBanCueRef.current = heroBanCue
    const draftDoneCue = new Audio(DRAFT_DONE_CUE_SOURCE)
    draftDoneCue.preload = 'auto'
    draftDoneCue.volume = 0.86
    draftDoneCueRef.current = draftDoneCue
    cueRefs.current = Object.fromEntries(
      Object.entries(TURN_CUES).map(([key, source]) => {
        const audio = new Audio(source)
        audio.preload = 'auto'
        audio.volume = 0.72
        return [key, audio]
      }),
    ) as Partial<Record<keyof typeof TURN_CUES, HTMLAudioElement>>
    return () => {
      if (turnCueTimer.current) window.clearTimeout(turnCueTimer.current)
      draftStartCue.pause()
      draftStartCue.src = ''
      captainsCue.pause()
      captainsCue.src = ''
      heroPickedCue.pause()
      heroPickedCue.src = ''
      heroBanCue.pause()
      heroBanCue.src = ''
      draftDoneCue.pause()
      draftDoneCue.src = ''
      Object.values(cueRefs.current).forEach((audio) => {
        audio.pause()
        audio.src = ''
      })
    }
  }, [])

  const clearFade = () => {
    if (fadeTimer.current) {
      window.clearInterval(fadeTimer.current)
      fadeTimer.current = null
    }
  }

  const fadeAudioTo = (target: number, duration = 900, onDone?: () => void) => {
    const audio = audioRef.current
    if (!audio) return
    clearFade()
    const start = audio.volume
    const startedAt = performance.now()
    fadeTimer.current = window.setInterval(() => {
      const progress = Math.min(1, (performance.now() - startedAt) / duration)
      audio.volume = start + (target - start) * progress
      if (progress >= 1) {
        clearFade()
        onDone?.()
      }
    }, 35)
  }

  const startMusic = (force = false) => {
    const audio = audioRef.current
    if (!audio || (!force && !musicEnabled)) return
    audio.volume = 0
    audio.play().then(() => fadeAudioTo(MUSIC_VOLUME, 1200)).catch(() => {
      setMusicEnabled(false)
      localStorage.setItem(MUSIC_PREF_KEY, 'false')
    })
  }

  const playOneShot = (audio: HTMLAudioElement | null, volume: number) => new Promise<void>((resolve) => {
    if (!audio || !musicEnabled) {
      resolve()
      return
    }
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      audio.removeEventListener('ended', finish)
      audio.removeEventListener('error', finish)
      resolve()
    }
    audio.currentTime = 0
    audio.volume = volume
    audio.addEventListener('ended', finish, { once: true })
    audio.addEventListener('error', finish, { once: true })
    audio.play().catch(finish)
    window.setTimeout(finish, 7000)
  })

  const playOpeningSequence = async (draftMode: DraftMode) => {
    if (!musicEnabled) return
    const sequenceId = openingSequenceId.current + 1
    openingSequenceId.current = sequenceId
    await playOneShot(draftStartCueRef.current, 0.82)
    if (openingSequenceId.current !== sequenceId || !musicEnabled) return
    await playOneShot(captainsCueRef.current, 0.86)
    if (openingSequenceId.current !== sequenceId || !musicEnabled) return
    turnCueTimer.current = window.setTimeout(() => {
      if (openingSequenceId.current === sequenceId && actions.length === 0) playTurnCue(DRAFT_ORDER[0], draftMode)
      turnCueTimer.current = null
    }, FIRST_TURN_CUE_DELAY_MS)
  }

  const playDraftActionCue = (action: DraftAction) => {
    if (!musicEnabled) return
    const cue = action.type === 'ban' ? heroBanCueRef.current : heroPickedCueRef.current
    if (!cue) return
    cue.currentTime = 0
    cue.volume = 0.78
    cue.play().catch(() => undefined)
  }

  const playDraftDoneCue = () => {
    if (!musicEnabled) return
    const cue = draftDoneCueRef.current
    if (!cue) return
    cue.currentTime = 0
    cue.volume = 0.86
    cue.play().catch(() => undefined)
  }

  const stopMusic = () => {
    const audio = audioRef.current
    openingSequenceId.current += 1
    if (turnCueTimer.current) {
      window.clearTimeout(turnCueTimer.current)
      turnCueTimer.current = null
    }
    draftStartCueRef.current?.pause()
    if (draftStartCueRef.current) draftStartCueRef.current.currentTime = 0
    captainsCueRef.current?.pause()
    if (captainsCueRef.current) captainsCueRef.current.currentTime = 0
    heroPickedCueRef.current?.pause()
    if (heroPickedCueRef.current) heroPickedCueRef.current.currentTime = 0
    heroBanCueRef.current?.pause()
    if (heroBanCueRef.current) heroBanCueRef.current.currentTime = 0
    draftDoneCueRef.current?.pause()
    if (draftDoneCueRef.current) draftDoneCueRef.current.currentTime = 0
    Object.values(cueRefs.current).forEach((cue) => {
      cue.pause()
      cue.currentTime = 0
    })
    if (!audio) return
    fadeAudioTo(0, 800, () => {
      audio.pause()
      loopFadeActive.current = false
    })
  }

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = MUSIC_VOLUME
    const onTimeUpdate = () => {
      if (!musicEnabled || !Number.isFinite(audio.duration)) return
      const remaining = audio.duration - audio.currentTime
      if (remaining <= 2 && remaining > 0 && !loopFadeActive.current) {
        loopFadeActive.current = true
        fadeAudioTo(0.08, 1100)
      }
    }
    const onEnded = () => {
      if (!musicEnabled) return
      audio.currentTime = 0
      audio.volume = 0
      loopFadeActive.current = false
      audio.play().then(() => fadeAudioTo(MUSIC_VOLUME, 1300)).catch(() => undefined)
    }
    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('ended', onEnded)
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('ended', onEnded)
      clearFade()
    }
  }, [musicEnabled])

  const step = DRAFT_ORDER[actions.length]
  const complete = actions.length === DRAFT_ORDER.length
  const selected = heroes.find((hero) => hero.id === selectedId)
  const used = useMemo(() => new Set(actions.map((action) => action.hero.id)), [actions])
  const isHumanTurn = Boolean(step && mode?.playerTeam === step.team)
  const roles = useMemo(() => ['All roles', ...Array.from(new Set(heroes.flatMap((h) => h.roles))).sort()], [heroes])
  const filtered = useMemo(() => heroes.filter((hero) => {
    const matchesQuery = hero.localizedName.toLowerCase().includes(query.toLowerCase())
    const matchesAttr = attr === 'all' || hero.primaryAttr === attr
    const matchesRole = role === 'All roles' || hero.roles.includes(role)
    return matchesQuery && matchesAttr && matchesRole
  }), [heroes, query, attr, role])
  const coachAdvice = useMemo(
    () => step && mode?.playerTeam && mode.playerTeam === step.team ? coachSuggestions(heroes, actions, step, mode.playerTeam, recentMeta, 4, draftSeed + actions.length) : [],
    [heroes, actions, step, mode?.playerTeam, recentMeta, draftSeed],
  )
  const suggestedIds = useMemo(() => new Set(coachAdvice.map((suggestion) => suggestion.hero.id)), [coachAdvice])

  const playTurnCue = (currentStep: typeof step, draftMode = mode) => {
    if (!currentStep || !draftMode || !musicEnabled) return
    const actor = draftMode.playerTeam === currentStep.team ? 'user' : 'enemy'
    const cueKey = `${actor}_${currentStep.type}` as keyof typeof TURN_CUES
    const cue = cueRefs.current[cueKey]
    if (!cue) return
    cue.currentTime = 0
    cue.volume = 0.72
    cue.play().catch(() => undefined)
  }

  useEffect(() => {
    if (!mode || !step || complete || lastCueStep.current === actions.length) return
    if (actions.length === 0) return
    lastCueStep.current = actions.length
    if (turnCueTimer.current) window.clearTimeout(turnCueTimer.current)
    playTurnCue(step)
    return () => {
      if (turnCueTimer.current) {
        window.clearTimeout(turnCueTimer.current)
        turnCueTimer.current = null
      }
    }
  }, [actions.length, complete, mode, musicEnabled, step])

  useEffect(() => {
    if (!mode || actions.length === 0) return
    const latest = actions[actions.length - 1]
    if (latest) playDraftActionCue(latest)
  }, [actions.length, mode, musicEnabled])

  useEffect(() => {
    if (!mode || !step || isHumanTurn) return
    setThinking(true)
    const delay = aiTurnDelay(step.type, mode.playerTeam === null)
    const timer = window.setTimeout(() => {
      const result = chooseHero(heroes, actions, step, mode.strategy, recentMeta)
      setActions((current) => [...current, { ...step, hero: result.hero, reason: result.reason }])
      setSelectedId(null); setCountdown(TURN_TIME_SECONDS); setThinking(false)
    }, delay)
    return () => window.clearTimeout(timer)
  }, [actions, heroes, isHumanTurn, mode, recentMeta, step])

  useEffect(() => {
    if (!isHumanTurn || !step) return
    const timer = window.setInterval(() => {
      setCountdown((value) => {
        if (value > 0) return value - 1
        setReserveTime((current) => current[step.team] > 0 ? { ...current, [step.team]: current[step.team] - 1 } : current)
        return 0
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [isHumanTurn, step])

  useEffect(() => {
    if (countdown !== 0 || reserveTime[step?.team ?? 'radiant'] !== 0 || !isHumanTurn || !step) return
    const result = chooseHero(heroes, actions, step, mode?.strategy ?? 'balanced', recentMeta)
    setActions((current) => [...current, { ...step, hero: result.hero, reason: 'Auto-selected when reserve time expired.' }])
    setSelectedId(null); setCountdown(TURN_TIME_SECONDS)
  }, [countdown, reserveTime, isHumanTurn, step, heroes, actions, mode, recentMeta])

  useEffect(() => {
    if (complete && !completionLogged.current && !draftDonePlayed.current) {
      const sessions = Number(localStorage.getItem('draftsmith_sessions') ?? 0) + 1
      localStorage.setItem('draftsmith_sessions', String(sessions))
      completionLogged.current = true
      draftDonePlayed.current = true
      window.setTimeout(playDraftDoneCue, 650)
    }
  }, [complete])

  const confirm = () => {
    if (!selected || !step || used.has(selected.id)) return
    setActions((current) => [...current, { ...step, hero: selected, reason: `Captain selected ${selected.localizedName}.` }])
    setSelectedId(null); setCountdown(TURN_TIME_SECONDS)
  }

  const restart = () => {
    openingSequenceId.current += 1
    if (turnCueTimer.current) {
      window.clearTimeout(turnCueTimer.current)
      turnCueTimer.current = null
    }
    setActions([]); setSelectedId(null); setCountdown(TURN_TIME_SECONDS); setReserveTime({ radiant: STARTING_RESERVE_SECONDS, dire: STARTING_RESERVE_SECONDS }); completionLogged.current = false; draftDonePlayed.current = false; lastCueStep.current = -1
    setDraftSeed((Math.random() * 1e9) | 0)
    if (mode) {
      window.setTimeout(startMusic, 0)
      window.setTimeout(() => playOpeningSequence(mode), 0)
    }
  }

  const startDraft = (draftMode: DraftMode) => {
    lastCueStep.current = -1
    draftDonePlayed.current = false
    setDraftSeed((Math.random() * 1e9) | 0)
    setMode(draftMode)
    window.setTimeout(startMusic, 0)
    window.setTimeout(() => playOpeningSequence(draftMode), 0)
  }

  const toggleMusic = () => {
    setMusicEnabled((enabled) => {
      const next = !enabled
      localStorage.setItem(MUSIC_PREF_KEY, String(next))
      if (next) window.setTimeout(() => startMusic(true), 0)
      else stopMusic()
      return next
    })
  }

  const saveReportToProfile = (report: SavedDraftReport) => {
    setSavedReports((current) => [report, ...current.filter((item) => item.id !== report.id)].slice(0, 20))
  }

  const deleteSavedReport = (id: string) => {
    setSavedReports((current) => current.filter((report) => report.id !== id))
  }

  if (!mode) return (
    <>
      <StartScreen onStart={startDraft} heroLive={live} />
      <audio ref={audioRef} src={DRAFT_BGM_SOURCE} preload="auto" />
    </>
  )

  const lastAiAction = [...actions].reverse().find((a) => a.reason && (mode.playerTeam === null || a.team !== mode.playerTeam))
  const latestAction = actions[actions.length - 1]
  const updateMode = (partial: Partial<DraftMode>) => setMode((current) => current ? { ...current, ...partial } : current)
  const activeReserve = step ? reserveTime[step.team] : 0
  const isReserveActive = countdown === 0 && activeReserve > 0
  const metaStatus = metaLoading
    ? { className: '', icon: <Activity size={13} />, label: 'Loading pro meta' }
    : recentMeta
      ? { className: 'online', icon: <Wifi size={13} />, label: recentMeta.publicMatchesAnalyzed ? `${recentMeta.matchesAnalyzed} pro + ${recentMeta.publicMatchesAnalyzed} high-rank` : `${recentMeta.matchesAnalyzed} pro drafts` }
      : { className: 'local', icon: <Archive size={13} />, label: 'Role model fallback' }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="wordmark" onClick={restart} aria-label="Start new draft"><img className="brand-logo small" src="/logo.png" alt="DraftGG" /></button>
        <div className="phase-status">
          <small>CAPTAIN'S MODE · PHASE {step?.phase ?? 3}</small>
          <div><i className="radiant-dot" /> {step ? `${teamName(step.team)} to ${step.type}` : 'Draft complete'} <i className="dire-dot" /></div>
          <span className="draft-progress" aria-label={`${actions.length} of ${DRAFT_ORDER.length} draft actions complete`}><i style={{ width: `${actions.length / DRAFT_ORDER.length * 100}%` }} /></span>
        </div>
        <div className="top-actions">
          <span className={`data-status ${metaStatus.className}`}>{metaStatus.icon}{metaStatus.label}</span>
          <button onClick={toggleMusic} aria-pressed={musicEnabled}>{musicEnabled ? <Music2 size={15} /> : <Music size={15} />}<span>{musicEnabled ? 'Audio on' : 'Audio off'}</span></button>
          <button onClick={() => setShowSavedReports(true)}><Archive size={15} /><span>Reports ({savedReports.length})</span></button>
          <button onClick={restart}><RotateCcw size={15} /><span>Restart</span></button>
        </div>
      </header>

      <div className="draft-layout">
        <TeamRail team="radiant" actions={actions} />
        <main className="hero-panel">
          <div className="turn-banner">
            <div className={`timer ${countdown <= 10 || isReserveActive ? 'urgent' : ''}`}><Clock3 size={15} /><strong>{thinking ? '···' : countdown}</strong><small>{isReserveActive ? 'RES' : 'SEC'}</small></div>
            <div><small>{thinking ? 'SYSTEM CAPTAIN IS THINKING' : isHumanTurn ? 'YOUR TURN' : 'DRAFT IN PROGRESS'}</small><strong>{step ? `${step.type === 'pick' ? 'Choose' : 'Remove'} a hero` : 'Draft complete'}</strong></div>
            <div className={`reserve ${isReserveActive ? 'active' : ''}`}><small>{step ? `${teamName(step.team)} RESERVE` : 'RESERVE'}</small><strong>{formatClock(activeReserve)}</strong></div>
          </div>

          {latestAction && <div key={`${actions.length}-${latestAction.hero.id}`} className={`draft-event ${latestAction.type} ${latestAction.team}`} aria-live="polite"><HeroImage hero={latestAction.hero} /><div><small>{teamName(latestAction.team)} {latestAction.type === 'pick' ? 'locked in' : 'removed'}</small><strong>{latestAction.hero.localizedName}</strong></div><span>{latestAction.type.toUpperCase()}</span></div>}

          <div className="toolbar">
            <label className="search"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search heroes" aria-label="Search heroes" />{query && <button onClick={() => setQuery('')} aria-label="Clear search"><X size={14} /></button>}</label>
            <div className="attr-tabs" aria-label="Hero attribute">
              {(['all', 'str', 'agi', 'int'] as const).map((item) => <button key={item} className={attr === item ? 'active' : ''} onClick={() => setAttr(item)}>{item === 'all' ? 'ALL' : item.toUpperCase()}</button>)}
            </div>
            <label className="role-select"><select value={role} onChange={(e) => setRole(e.target.value)}>{roles.map((r) => <option key={r}>{r}</option>)}</select><ChevronDown size={14} /></label>
          </div>

          <div className="hero-count"><span>{filtered.length} HEROES</span><i /></div>
          <div className="captain-controls">
            <div className="side-picker" aria-label="Player side">
              {(['radiant', 'dire'] as const).map((team) => (
                <button key={team} className={`${team} ${mode.playerTeam === team ? 'active' : ''}`} onClick={() => updateMode({ playerTeam: team })} disabled={actions.length > 0}>
                  {teamName(team)}
                </button>
              ))}
            </div>
            <div className="strategy-picker compact" aria-label="AI strategy">
              {strategies.map(({ id, label, description, icon: Icon }) => (
                <button key={id} className={mode.strategy === id ? 'active' : ''} onClick={() => updateMode({ strategy: id })}>
                  <Icon size={15} /><span><strong>{label}</strong><small>{description}</small></span>
                  {mode.strategy === id && <Check size={13} className="strategy-check" />}
                </button>
              ))}
            </div>
          </div>
          <div className="grid-zone">
          <div className="hero-grid" aria-busy={thinking}>
            {filtered.map((hero) => {
              const unavailable = used.has(hero.id) || !isHumanTurn
              return <button key={hero.id} className={`hero-card ${selectedId === hero.id ? 'selected' : ''} ${used.has(hero.id) ? 'used' : ''} ${isHumanTurn && suggestedIds.has(hero.id) ? 'suggested' : ''}`} onClick={() => !unavailable && setSelectedId(hero.id)} disabled={unavailable} title={`${hero.localizedName} · ${attrLabels[hero.primaryAttr]} · ${hero.roles.join(', ')}`}>
                <HeroImage hero={hero} />
                <span>{hero.localizedName}</span><i className={`attr ${hero.primaryAttr}`} />
              </button>
            })}
          </div>

          <div className={`selection-dock ${selected ? 'visible' : ''}`}>
            {selected ? <><HeroImage hero={selected} /><div><small>SELECTED HERO</small><strong>{selected.localizedName}</strong><span>{selected.roles.slice(0, 3).join(' · ')}</span></div><button onClick={confirm}>{step?.type === 'ban' ? 'Confirm ban' : 'Lock in hero'} <Check size={16} /></button></> : <span>Select a hero to continue</span>}
          </div>
          </div>

          <section className={`intel-bar ${showIntel ? '' : 'collapsed'}`}>
            <button className="intel-toggle" onClick={() => setShowIntel((value) => !value)} aria-expanded={showIntel}><BrainCircuit size={16} /> {coachAdvice.length ? "COACH'S GUIDE" : 'DRAFT INTELLIGENCE'} <ChevronDown size={14} /></button>
            {showIntel && <div className="intel-content">
              {coachAdvice.length ? <div className="coach-guide">
                <small><Target size={13} /> COACH'S GUIDE · BEST {step?.type === 'ban' ? 'BANS' : 'PICKS'} THIS TURN</small>
                <div className="coach-suggestions">
                  {coachAdvice.map((suggestion) => (
                    <button key={suggestion.hero.id} className={selectedId === suggestion.hero.id ? 'active' : ''} onClick={() => setSelectedId(suggestion.hero.id)} title={`Select ${suggestion.hero.localizedName}`}>
                      <HeroImage hero={suggestion.hero} />
                      <span><strong>{suggestion.hero.localizedName}</strong><em>{suggestion.reason}</em></span>
                    </button>
                  ))}
                </div>
              </div> : <>
                <div className="ai-avatar"><Bot size={20} /><i /></div>
                <div className="ai-thought"><small>SYSTEM DRAFTER · {mode.strategy.toUpperCase()} PROFILE</small><p>{thinking ? 'Ranking pro presence, lane pairs, role economy, counter bans, and timing fit…' : lastAiAction?.reason ?? 'Waiting for enough draft information to form a read.'}</p></div>
              </>}
              <div className="intel-metrics"><span><small>PRO MODEL{recentMeta?.patch ? ` · PATCH ${recentMeta.patch}` : ''}</small><strong>{metaLoading ? 'SYNCING' : recentMeta ? `${recentMeta.matchesAnalyzed} DRAFTS` : 'UNAVAILABLE'}</strong></span><span><small>ROLE EVIDENCE</small><strong>{recentMeta?.matchesWithPositions ? `${recentMeta.matchesWithPositions} MATCHES` : 'BACKFILLING'}</strong></span><span><small>MODEL BASIS</small><strong>{recentMeta ? 'OBSERVED + ROLE TAGS' : 'ROLE TAGS'}</strong></span></div>
            </div>}
          </section>
        </main>
        <TeamRail team="dire" actions={actions} />
      </div>

      <footer>
        <span>Unofficial fan project. Dota 2, its hero imagery, and all draft announcer voice lines &amp; sound effects are trademarks and &copy; Valve Corporation. Audio is used for non-commercial fan purposes only; not affiliated with or endorsed by Valve.</span>
        <span className="footer-data">
          Match data &copy; <a href="https://www.opendota.com" target="_blank" rel="noreferrer">OpenDota API</a>
          {recentMeta && <> · Draft model built from <strong>{((recentMeta.datasetSize ?? recentMeta.matchesAnalyzed) + (recentMeta.publicDatasetSize ?? 0)).toLocaleString()}</strong> matches — {(recentMeta.datasetSize ?? recentMeta.matchesAnalyzed).toLocaleString()} pro tournament drafts + {(recentMeta.publicDatasetSize ?? 0).toLocaleString()} Divine+ ranked matches, with recent pro tournament games weighted highest</>}
        </span>
      </footer>
      <audio ref={audioRef} src={DRAFT_BGM_SOURCE} preload="auto" />
      {showSavedReports && <SavedReportsDrawer reports={savedReports} onClose={() => setShowSavedReports(false)} onOpen={(report) => { setActiveSavedReport(report); setShowSavedReports(false) }} onDelete={deleteSavedReport} />}
      {activeSavedReport && <SavedReportViewer report={activeSavedReport} onClose={() => setActiveSavedReport(null)} />}
      {complete && <DraftComplete actions={actions} recentMeta={recentMeta} onRestart={restart} onSaveReport={saveReportToProfile} />}
    </div>
  )
}
