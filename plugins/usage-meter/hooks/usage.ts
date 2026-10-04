import type { SessionRateLimit } from 'claude-code'

import type { UsageSnapshot, UsageWindow } from '../types'

export const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'

const isFable = (key: string) => /fable/i.test(key)

const toWindow = (value: unknown): UsageWindow | null => {
  if (!value || typeof value !== 'object') {
    return null
  }
  const { utilization, resets_at } = value as { utilization?: unknown; resets_at?: unknown }
  if (typeof utilization !== 'number') {
    return null
  }

  return { percent: utilization, resetsAt: typeof resets_at === 'string' ? resets_at : null }
}

type Limit = {
  kind?: unknown
  percent?: unknown
  resets_at?: unknown
  scope?: { model?: { display_name?: unknown } | null } | null
}

const fromLimit = (limit: Limit | undefined): UsageWindow | null =>
  limit && typeof limit.percent === 'number'
    ? { percent: limit.percent, resetsAt: typeof limit.resets_at === 'string' ? limit.resets_at : null }
    : null

/**
 * Reads the body of GET /api/oauth/usage. Its `limits` list names each window
 * (`session`, `weekly_all`, and `weekly_scoped` with the model in
 * `scope.model.display_name`, which is where Fable lives); the older top-level
 * `five_hour` / `seven_day` / `seven_day_<model>` keys are the fallback.
 */
export const parseUsageBody = (body: unknown, at: number): UsageSnapshot => {
  const record = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const limits = (Array.isArray(record.limits) ? record.limits : []) as Limit[]
  const byKind = (kind: string) => limits.find(limit => limit.kind === kind)
  const fableLimit = limits.find(
    limit => limit.kind === 'weekly_scoped' && isFable(String(limit.scope?.model?.display_name ?? '')),
  )
  const fableKey = Object.keys(record).find(key => isFable(key) && toWindow(record[key]))

  return {
    fiveHour: fromLimit(byKind('session')) ?? toWindow(record.five_hour),
    weekly: fromLimit(byKind('weekly_all')) ?? toWindow(record.seven_day),
    fable: fromLimit(fableLimit) ?? (fableKey ? toWindow(record[fableKey]) : null),
    at,
  }
}

/** Reads the rate-limit windows the session's responses reported. */
export const fromRateLimits = (limits: readonly SessionRateLimit[], at: number): UsageSnapshot | null => {
  const pick = (match: (kind: string) => boolean): UsageWindow | null => {
    const limit = limits.find(one => match(one.kind))

    return limit ? { percent: limit.percentUsed, resetsAt: limit.resetsAt ?? null } : null
  }
  const snapshot = {
    fiveHour: pick(kind => kind === 'five_hour'),
    weekly: pick(kind => kind === 'seven_day'),
    fable: pick(isFable),
    at,
  }

  return snapshot.fiveHour || snapshot.weekly || snapshot.fable ? snapshot : null
}

/** Each window from whichever source read it last. */
export const merge = (api: UsageSnapshot | null, live: UsageSnapshot | null): UsageSnapshot | null => {
  if (!api || !live) {
    return api ?? live
  }
  const [newer, older] = live.at >= api.at ? [live, api] : [api, live]

  return {
    fiveHour: newer.fiveHour ?? older.fiveHour,
    weekly: newer.weekly ?? older.weekly,
    fable: newer.fable ?? older.fable,
    at: newer.at,
  }
}
