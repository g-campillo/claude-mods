import { describe, expect, mock, test } from 'claude-code/testing'

import { formatDate, formatDuration, formatTime, percentLeft, parseOffset, toneOfLeft } from '../hooks/format'
import { fromRateLimits, merge, parseUsageBody } from '../hooks/usage'
import type { UsageSnapshot } from '../types'

const UTC = { offsetMinutes: 0 }
const RESET_5H = '2026-10-04T19:40:00Z'
const RESET_WEEK = '2026-10-09T14:00:00Z'

const SNAPSHOT: UsageSnapshot = {
  fiveHour: { percent: 23, resetsAt: RESET_5H },
  weekly: { percent: 41, resetsAt: RESET_WEEK },
  fable: { percent: 92.5, resetsAt: RESET_WEEK },
  at: Date.parse('2026-10-04T15:00:00Z'),
}

const HINT = { isDraft: false, isWorking: false, hint: '' }
const BAND = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 120,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
}

const RATE_LIMITS = [
  { kind: 'five_hour', percentUsed: 23, resetsAt: RESET_5H },
  { kind: 'seven_day', percentUsed: 65, resetsAt: RESET_WEEK },
  { kind: 'seven_day_fable', percentUsed: 92.5, resetsAt: RESET_WEEK },
]

describe('format', () => {
  test('clock times and dates in a given zone', () => {
    expect(formatTime(Date.parse(RESET_5H), UTC)).toBe('7:40 PM')
    expect(formatDate(Date.parse(RESET_WEEK), { offsetMinutes: -240 })).toBe('Fri Oct 9')
    expect(formatTime(Date.parse('2026-10-04T00:05:00Z'), UTC)).toBe('12:05 AM')
  })

  test('durations and offsets', () => {
    expect(formatDuration(30_000)).toBe('<1m')
    expect(formatDuration(42 * 60_000)).toBe('42m')
    expect(formatDuration((2 * 60 + 14) * 60_000)).toBe('2h 14m')
    expect(formatDuration((5 * 24 + 8) * 3_600_000)).toBe('5d 8h')
    expect(parseOffset('-0400\n')).toBe(-240)
    expect(parseOffset('+0530')).toBe(330)
    expect(parseOffset('UTC')).toBe(null)
  })

  test('what is left, and its color', () => {
    expect(percentLeft(23)).toBe(77)
    expect(percentLeft(92.5)).toBe(7.5)
    expect(percentLeft(104)).toBe(0)
    expect([toneOfLeft(77), toneOfLeft(50), toneOfLeft(49), toneOfLeft(20), toneOfLeft(19.9)]).toEqual([
      'green',
      'green',
      'yellow',
      'yellow',
      'red',
    ])
  })
})

describe('usage', () => {
  test('reads the usage body, finding the Fable window by name', () => {
    const body = {
      five_hour: { utilization: 23, resets_at: RESET_5H },
      seven_day: { utilization: 41, resets_at: RESET_WEEK },
      seven_day_opus: null,
      seven_day_fable: { utilization: 92.5, resets_at: RESET_WEEK },
    }
    expect(parseUsageBody(body, SNAPSHOT.at)).toEqual(SNAPSHOT)
    expect(parseUsageBody({}, 1)).toEqual({ fiveHour: null, weekly: null, fable: null, at: 1 })
  })

  test('reads the limits list, where Fable is a model-scoped weekly window', () => {
    const body = {
      five_hour: { utilization: 1, resets_at: RESET_5H },
      seven_day: { utilization: 1, resets_at: RESET_WEEK },
      seven_day_opus: null,
      limits: [
        { kind: 'session', group: 'session', percent: 23, resets_at: RESET_5H, scope: null },
        { kind: 'weekly_all', group: 'weekly', percent: 41, resets_at: RESET_WEEK, scope: null },
        { kind: 'weekly_scoped', group: 'weekly', percent: 92.5, resets_at: RESET_WEEK, scope: { model: { id: null, display_name: 'Fable' }, surface: null } },
      ],
    }
    expect(parseUsageBody(body, SNAPSHOT.at)).toEqual(SNAPSHOT)
  })

  test('takes each window from the newer source', () => {
    const live = fromRateLimits([{ kind: 'five_hour', percentUsed: 30, resetsAt: RESET_5H }], SNAPSHOT.at + 1)
    const merged = merge(SNAPSHOT, live)
    expect(merged?.fiveHour?.percent).toBe(30)
    expect(merged?.weekly?.percent).toBe(41)
    expect(merged?.fable?.percent).toBe(92.5)
    expect(fromRateLimits([], 1)).toBe(null)
  })
})

describe('drawing', () => {
  test('draws nothing of its own before a reading', async ($, on) => {
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
      const { Text } = $.ui.resolve(e)

      return <Text>engine band</Text>
    })
    const ui = await $.ui.mount({ plugin: 'usage-meter', surface: 'desktop', component: 'AbovePrompt', props: BAND })
    expect(await ui.find({ type: 'Text', text: 'engine band' })).toBeDefined()
  })

  test('yields the band to a survey', async ($, on) => {
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
      const { Text } = $.ui.resolve(e)

      return <Text>survey</Text>
    })
    mock.clock(on, { now: SNAPSHOT.at })
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    await $.session.measure({ context: { window: 200_000 }, rateLimits: RATE_LIMITS, changed: ['rateLimits'] })
    const ui = await $.ui.mount({ plugin: 'usage-meter', surface: 'desktop', component: 'AbovePrompt', props: { ...BAND, hasSurvey: true } })
    expect(await ui.find({ type: 'Text', text: 'survey' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '77% left' })).toBeUndefined()
  })

  test('shows every window and its reset in the band above the desktop input', async ($, on) => {
    mock.clock(on, { now: SNAPSHOT.at })
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    await $.session.measure({ context: { window: 200_000 }, rateLimits: RATE_LIMITS, changed: ['rateLimits'] })
    const ui = await $.ui.mount({ plugin: 'usage-meter', surface: 'desktop', component: 'AbovePrompt', props: BAND })
    for (const text of ['5h Limit', 'Weekly Limit', 'Fable Limit']) {
      expect(await ui.find({ type: 'Text', text })).toBeDefined()
    }
    expect((await ui.find({ type: 'Text', text: '77% left' }))?.props.color).toBe('#22c55e')
    expect((await ui.find({ type: 'Text', text: '35% left' }))?.props.color).toBe('#f59e0b')
    expect((await ui.find({ type: 'Text', text: '7.5% left' }))?.props.color).toBe('#ef4444')
    expect(await ui.find({ type: 'Text', text: /^resets at \d+:\d\d [AP]M$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^resets on Fri Oct 9 at \d+:\d\d [AP]M$/ })).toBeDefined()
  })

  test('adds a tail to the engine line on the terminal', async ($, on) => {
    let tail: string | undefined
    on('ui.render', { component: 'PromptHint' }, ($, e) => {
      tail = e.props.tail
      const { Text } = $.ui.resolve(e)

      return <Text>{e.props.tail ?? ''}</Text>
    })
    mock.clock(on, { now: SNAPSHOT.at })
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    await $.session.measure({ context: { window: 200_000 }, rateLimits: RATE_LIMITS, changed: ['rateLimits'] })
    await $.ui.mount({ plugin: 'usage-meter', surface: 'terminal', component: 'PromptHint', props: HINT })
    expect(tail).toMatch(/^5h 77% left ↻ \d+:\d\d [AP]M · Week 35% left ↻ Fri \d+:\d\d [AP]M · Fable 7\.5% left ↻ Fri \d+:\d\d [AP]M$/)
  })
})
