import { formatInTimeZone } from 'date-fns-tz'

// Day ends at 4am local time — matches the Postgres effective_date(tz) function.
export function getEffectiveDate(timezone: string): string {
  return formatInTimeZone(
    new Date(Date.now() - 4 * 60 * 60 * 1000),
    timezone,
    'yyyy-MM-dd'
  )
}

export function getEffectiveDateLabel(timezone: string): string {
  const [y, m, d] = getEffectiveDate(timezone).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

// Format a logged_for_date for display in the feed relative to the viewer's current day.
// Uses UTC arithmetic to avoid DST edge cases.
export function formatFeedDateLabel(dateStr: string, timezone: string): string {
  const today = getEffectiveDate(timezone)
  if (dateStr === today) return 'Today'
  const [ty, tm, td] = today.split('-').map(Number)
  const [fy, fm, fd] = dateStr.split('-').map(Number)
  const todayMs = Date.UTC(ty, tm - 1, td)
  const feedMs  = Date.UTC(fy, fm - 1, fd)
  const diffDays = Math.round((todayMs - feedMs) / 86_400_000)
  if (diffDays === 1) return 'Yesterday'
  return new Date(feedMs).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}
