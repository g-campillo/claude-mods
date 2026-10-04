/** One usage window: how much of it is spent and when it starts over. */
export type UsageWindow = {
  /** 0 to 100. */
  percent: number
  /** ISO 8601, or null when the window has no reset scheduled. */
  resetsAt: string | null
}

/** The three windows the meter shows, from one source at one moment. */
export type UsageSnapshot = {
  fiveHour: UsageWindow | null
  weekly: UsageWindow | null
  fable: UsageWindow | null
  /** Milliseconds since the epoch. */
  at: number
}

declare module 'claude-code' {
  interface PluginState {
    'usage-meter': {
      /** From GET /api/oauth/usage: the only source with the Fable window. */
      api: UsageSnapshot | null
      /** From the rate-limit headers of the session's own responses (free, live). */
      live: UsageSnapshot | null
      /** The last main-thread model response, which refreshes the prompt cache. */
      lastResponseAt: number | null
      /** Bumped on a timer so countdowns redraw. */
      tick: number
      /** Why the last usage fetch failed, cleared by the next success. */
      error: string | null
      /** The last usage response body, for `/usage-meter raw`. */
      raw: string | null
    }
  }
}
