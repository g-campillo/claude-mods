import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register } from 'claude-code'

import type { UsageWindow } from '../types'
import { formatDate, formatDuration, formatPercent, formatTime, formatWeekday, parseOffset, percentLeft, toneOfLeft } from './format'
import type { Tone, Zone } from './format'
import { fromRateLimits, merge, parseUsageBody, USAGE_URL } from './usage'

const api = atom({ plugin: 'usage-meter', key: 'api' } as const, null)
const live = atom({ plugin: 'usage-meter', key: 'live' } as const, null)
const lastResponseAt = atom({ plugin: 'usage-meter', key: 'lastResponseAt' } as const, null)
const tick = atom({ plugin: 'usage-meter', key: 'tick' } as const, 0)
const error = atom({ plugin: 'usage-meter', key: 'error' } as const, null)
const raw = atom({ plugin: 'usage-meter', key: 'raw' } as const, null)

const MINUTE = 60_000
const POLL_MS = 5 * MINUTE
const MIN_REFETCH_MS = 2 * MINUTE
const BACKOFF_MS = 15 * MINUTE
const TICK_MS = 30_000

const COLOR: Record<Tone, string> = { green: '#22c55e', yellow: '#f59e0b', red: '#ef4444' }

/** One window as drawn: `label value detail` on desktop, `short value shortDetail` in the terminal. */
type Segment = { label: string; short: string; value: string; tone: Tone; detail: string; shortDetail: string }
type Cache = { ttlMs: number; label: string }

// The module's own variables: a reload starts them over, `$.state` keeps the rest.
let zone: Zone = { offsetMinutes: null }
let cache: Cache = { ttlMs: 60 * MINUTE, label: '1h' }
let lastFetchAt = 0
let backoffUntil = 0
let inFlight: Promise<void> | null = null
/** How often each `component/surface` was asked to draw since the last load, for `/usage-meter debug`. */
const drawn = new Map<string, number>()

function noteDrawn(component: string, surface: string): void {
  const key = `${component}/${surface}`
  drawn.set(key, (drawn.get(key) ?? 0) + 1)
}

async function fetchUsage($: EngineInterface, force: boolean): Promise<void> {
  const now = await $.clock.now()
  if (!force && (now - lastFetchAt < MIN_REFETCH_MS || now < backoffUntil)) {
    return
  }
  lastFetchAt = now
  const auth = await $.session.authorize()
  if (!auth) {
    await update($, error, () => 'no Claude subscription login in this session')
    return
  }
  const { version } = await $.session.version()
  const response = await $.http.fetch(USAGE_URL, {
    auth: auth.handle,
    headers: {
      'anthropic-beta': 'oauth-2025-04-20',
      'content-type': 'application/json',
      'user-agent': `claude-code/${version}`,
    },
  })
  if (!response.ok) {
    if (response.status === 429) {
      backoffUntil = now + BACKOFF_MS
    }
    await update($, error, () => `usage fetch failed: HTTP ${response.status}`)
    return
  }
  const snapshot = parseUsageBody(JSON.parse(response.text), now)
  await update($, api, () => snapshot)
  await update($, raw, () => response.text)
  await update($, error, () => null)
}

/** One fetch at a time; a failure lands in `error` and never throws. */
async function refresh($: EngineInterface, force: boolean): Promise<void> {
  if (!inFlight) {
    inFlight = fetchUsage($, force)
  }
  try {
    await inFlight
  } catch (failure) {
    await update($, error, () => `usage fetch failed: ${String(failure)}`)
  } finally {
    inFlight = null
  }
}

/** The host's zone: the module's own environment may keep time in UTC. */
async function readZone($: EngineInterface): Promise<Zone> {
  try {
    const { exitCode, stdout } = await $.process.run(['date', '+%z'], { timeoutMs: 5000 })
    const host = exitCode === 0 ? parseOffset(stdout) : null
    const own = -new Date(await $.clock.now()).getTimezoneOffset()

    return { offsetMinutes: host === null || host === own ? null : host }
  } catch {
    return { offsetMinutes: null }
  }
}

function resetAt(window: UsageWindow): number | null {
  const at = window.resetsAt ? Date.parse(window.resetsAt) : NaN

  return Number.isNaN(at) ? null : at
}

/** `resets at 3:19 AM`, or with the date `resets on Sun Oct 4 at 6:59 PM`. */
function resetText(window: UsageWindow, withDate: boolean): string {
  const at = resetAt(window)
  if (at === null) {
    return ''
  }

  return withDate ? `resets on ${formatDate(at, zone)} at ${formatTime(at, zone)}` : `resets at ${formatTime(at, zone)}`
}

/** `↻ 3:19 AM`, or with the date `↻ Sun 6:59 PM`. */
function shortReset(window: UsageWindow, withDate: boolean): string {
  const at = resetAt(window)
  if (at === null) {
    return ''
  }

  return `↻ ${withDate ? `${formatWeekday(at, zone)} ` : ''}${formatTime(at, zone)}`
}

/** What the line under the prompt shows; null before any reading. */
async function segments($: EngineInterface): Promise<Segment[] | null> {
  await read($, tick)
  const usage = merge(await read($, api), await read($, live))
  const respondedAt = await read($, lastResponseAt)
  if (!usage && respondedAt === null) {
    return null
  }
  const now = await $.clock.now()
  const list: Segment[] = []
  const add = (label: string, short: string, window: UsageWindow | null | undefined, withDate: boolean) => {
    if (window) {
      const left = percentLeft(window.percent)
      list.push({
        label,
        short,
        value: `${formatPercent(left)} left`,
        tone: toneOfLeft(left),
        detail: resetText(window, withDate),
        shortDetail: shortReset(window, withDate),
      })
    }
  }
  add('5h Limit', '5h', usage?.fiveHour, false)
  add('Weekly Limit', 'Week', usage?.weekly, true)
  add('Fable Limit', 'Fable', usage?.fable, true)
  if (respondedAt !== null) {
    const expiresAt = respondedAt + cache.ttlMs
    const left = expiresAt - now
    const at = formatTime(expiresAt, zone)
    list.push(
      left > 0
        ? {
            label: 'Cache',
            short: 'Cache',
            value: `${formatDuration(left)} left`,
            tone: left > 15 * MINUTE ? 'green' : left > 5 * MINUTE ? 'yellow' : 'red',
            detail: `expires at ${at}`,
            shortDetail: `→ ${at}`,
          }
        : { label: 'Cache', short: 'Cache', value: 'expired', tone: 'red', detail: `at ${at}`, shortDetail: '' },
    )
  }

  return list
}

/** One row: each window, its reset, the cache; `hint` (the engine's own line) at the right. */
function usageRow({ Box, Text }: Pick<Elements['desktop'], 'Box' | 'Text'>, list: Segment[], problem: string | null, hint: string) {
  return (
    <Box flexDirection="row" justifyContent="space-between" flexWrap="wrap" columnGap={2}>
      <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
        {list.map(s => (
          <Box flexDirection="row" columnGap={1}>
            <Text>{s.label}</Text>
            <Text color={COLOR[s.tone]} bold>
              {s.value}
            </Text>
            {s.detail ? <Text dimColor>{s.detail}</Text> : null}
          </Box>
        ))}
        {problem ? <Text color={COLOR.yellow}>⚠ stale</Text> : null}
      </Box>
      {hint ? <Text dimColor>{hint}</Text> : null}
    </Box>
  )
}

/** The `/usage-meter` report. */
async function describe($: EngineInterface): Promise<string> {
  const usage = merge(await read($, api), await read($, live))
  const now = await $.clock.now()
  const line = (label: string, window: UsageWindow | null | undefined, withDate: boolean) => {
    if (!window) {
      return `${label.padEnd(8)}no reading`
    }
    const at = resetAt(window)
    const until = at === null ? '' : ` (in ${formatDuration(Math.max(0, at - now))})`
    const left = `${formatPercent(percentLeft(window.percent))} left`

    return `${label.padEnd(8)}${left.padEnd(11)}${resetText(window, withDate)}${until}`
  }
  const respondedAt = await read($, lastResponseAt)
  const expiresAt = (respondedAt ?? 0) + cache.ttlMs
  const cacheLine =
    respondedAt === null
      ? 'no response yet this session'
      : expiresAt > now
        ? `${formatDuration(expiresAt - now)} left, expires at ${formatTime(expiresAt, zone)} (${cache.label} TTL)`
        : `expired at ${formatTime(expiresAt, zone)} (${cache.label} TTL)`
  const problem = await read($, error)
  const updated = usage ? `Updated ${formatDuration(now - usage.at)} ago.` : 'No usage reading yet.'

  return [
    line('5-hour', usage?.fiveHour, false),
    line('Weekly', usage?.weekly, true),
    line('Fable', usage?.fable, true),
    `${'Cache'.padEnd(8)}${cacheLine}`,
    problem ? `${updated} Last error: ${problem}` : updated,
  ].join('\n')
}

async function debugReport($: EngineInterface): Promise<string> {
  const surfaces = await $.session.surfaces()
  const asked = [...drawn].map(([key, count]) => `  ${key}: ${count}`)

  return [
    `Surfaces attached: ${surfaces.length ? surfaces.join(', ') : 'none'}`,
    'Draw requests since load:',
    ...(asked.length ? asked : ['  none']),
    `Has a reading: ${(await segments($)) ? 'yes' : 'no'}`,
  ].join('\n')
}

async function rawReport($: EngineInterface): Promise<string> {
  await refresh($, true)
  const body = await read($, raw)
  const limits = (await $.session.usage()).rateLimits

  return [
    `GET ${USAGE_URL}`,
    body ? JSON.stringify(JSON.parse(body), null, 2) : `(no body: ${(await read($, error)) ?? 'not fetched'})`,
    '',
    'Session rate-limit headers:',
    JSON.stringify(limits, null, 2),
  ].join('\n')
}

export const register: Register = (on, options) => {
  cache = options.cacheTtl === '5m' ? { ttlMs: 5 * MINUTE, label: '5m' } : { ttlMs: 60 * MINUTE, label: '1h' }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'usage-meter',
      description: 'Show plan usage, reset times and prompt-cache expiry',
      argumentHint: '[refresh|raw|debug]',
      immediate: true,
    })
    zone = await readZone($)
    const seeded = fromRateLimits((await $.session.usage()).rateLimits, await $.clock.now())
    if (seeded) {
      await update($, live, () => seeded)
    }
    void refresh($, true)
    $.clock.every(POLL_MS, () => void refresh($, false))
    $.clock.every(TICK_MS, () => void update($, tick, n => n + 1))

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      const snapshot = fromRateLimits(e.rateLimits, await $.clock.now())
      await update($, live, () => snapshot)
    }

    return next(e)
  })

  // Every main-thread response re-arms the prompt cache's TTL.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    if (!e.agentId && result.usage) {
      const at = await $.clock.now()
      await update($, lastResponseAt, () => at)
    }

    return result
  })

  on('turn.complete', async ($, e, next) => {
    void refresh($, false)

    return next(e)
  })

  on('command.run', { command: 'usage-meter' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'raw') {
      return { text: await rawReport($) }
    }
    if (arg === 'debug') {
      return { text: await debugReport($) }
    }
    await refresh($, true)

    return { text: await describe($) }
  })

  // The desktop app raises no PromptHint today, so its meter sits in the band
  // just above the input; should it ever ask for PromptHint, the meter moves there.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    noteDrawn(e.component, e.surface)
    if (e.surface === 'terminal' || e.props.hasSurvey || drawn.has(`PromptHint/${e.surface}`)) {
      return next(e)
    }
    const list = await segments($)
    if (!list) {
      return next(e)
    }

    return usageRow($.ui.resolve(e), list, await read($, error), '')
  })

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    noteDrawn(e.component, e.surface)
    const list = await segments($)
    if (!list) {
      return next(e)
    }
    const problem = await read($, error)

    if (e.surface === 'terminal') {
      const tail = list.map(s => [s.short, s.value, s.shortDetail].filter(Boolean).join(' ')).join(' · ')

      return next({ ...e, props: { ...e.props, tail: `${tail}${problem ? ' ⚠' : ''}` } })
    }

    return usageRow($.ui.resolve(e), list, problem, e.props.hint)
  })
}
