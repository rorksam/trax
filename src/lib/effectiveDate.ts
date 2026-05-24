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
