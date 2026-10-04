const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * The host's UTC offset in minutes, east positive, when the module's own
 * environment does not share the host's zone; null when it does, so dates
 * use the environment's local time (which also follows daylight saving).
 */
export type Zone = { offsetMinutes: number | null }

const wallClock = (ms: number, zone: Zone) => {
  if (zone.offsetMinutes === null) {
    const d = new Date(ms)

    return { day: d.getDay(), month: d.getMonth(), date: d.getDate(), hours: d.getHours(), minutes: d.getMinutes() }
  }
  const d = new Date(ms + zone.offsetMinutes * MINUTE)

  return { day: d.getUTCDay(), month: d.getUTCMonth(), date: d.getUTCDate(), hours: d.getUTCHours(), minutes: d.getUTCMinutes() }
}

/** `+0200` / `-0400` as `date +%z` prints it, in minutes east of UTC. */
export const parseOffset = (text: string): number | null => {
  const match = /^([+-])(\d{2})(\d{2})$/.exec(text.trim())
  if (!match) {
    return null
  }
  const minutes = Number(match[2]) * 60 + Number(match[3])

  return match[1] === '-' ? -minutes : minutes
}

/** `3:40 PM` */
export const formatTime = (ms: number, zone: Zone): string => {
  const { hours, minutes } = wallClock(ms, zone)
  const hour12 = hours % 12 === 0 ? 12 : hours % 12

  return `${hour12}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`
}

/** `Thu Oct 9` */
export const formatDate = (ms: number, zone: Zone): string => {
  const { day, month, date } = wallClock(ms, zone)

  return `${DAYS[day]} ${MONTHS[month]} ${date}`
}

/** `Thu` */
export const formatWeekday = (ms: number, zone: Zone): string => DAYS[wallClock(ms, zone).day] ?? ''

/** `5d 8h`, `2h 14m`, `42m`, `<1m` */
export const formatDuration = (ms: number): string => {
  if (ms < MINUTE) {
    return '<1m'
  }
  if (ms < HOUR) {
    return `${Math.floor(ms / MINUTE)}m`
  }
  if (ms < DAY) {
    return `${Math.floor(ms / HOUR)}h ${Math.floor((ms % HOUR) / MINUTE)}m`
  }

  return `${Math.floor(ms / DAY)}d ${Math.floor((ms % DAY) / HOUR)}h`
}

/** `23%`, `7.5%` */
export const formatPercent = (percent: number): string => `${Math.round(percent * 10) / 10}%`

/** What is left of a window, from what is used. */
export const percentLeft = (used: number): number => Math.max(0, Math.round((100 - used) * 10) / 10)

export type Tone = 'green' | 'yellow' | 'red'

/** Green with half or more left, yellow down to a fifth, red below that. */
export const toneOfLeft = (left: number): Tone => (left >= 50 ? 'green' : left >= 20 ? 'yellow' : 'red')
