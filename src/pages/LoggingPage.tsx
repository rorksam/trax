import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import HabitLogRow from '../components/HabitLogRow'
import { getEffectiveDate, getEffectiveDateLabel } from '../lib/effectiveDate'
import { type Habit, type Log } from '../types'

export default function LoggingPage() {
  const { session, profile } = useAuth()
  const [habits, setHabits]   = useState<Habit[]>([])
  const [logsMap, setLogsMap] = useState<Map<string, Log>>(new Map())
  const [loading, setLoading] = useState(true)

  const timezone     = profile?.timezone ?? 'UTC'
  const effectiveDate = getEffectiveDate(timezone)
  const dateLabel    = getEffectiveDateLabel(timezone)

  useEffect(() => {
    if (session) load()
  }, [session])

  async function load() {
    const [{ data: habitData }, { data: logData }] = await Promise.all([
      supabase
        .from('habits').select('*')
        .eq('user_id', session!.user.id)
        .is('archived_at', null)
        .order('sort_order', { ascending: true }),
      supabase
        .from('logs').select('*')
        .eq('logged_for_date', effectiveDate),
    ])

    setHabits((habitData as Habit[]) ?? [])

    const map = new Map<string, Log>()
    ;(logData as Log[])?.forEach(l => map.set(l.habit_id, l))
    setLogsMap(map)
    setLoading(false)
  }

  function handleLogChange(habitId: string, log: Log | null) {
    setLogsMap(prev => {
      const next = new Map(prev)
      if (log) next.set(habitId, log)
      else next.delete(habitId)
      return next
    })
  }

  if (loading) return null

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <h1 className="text-xl font-semibold text-white mb-1">Today</h1>
      <p className="text-sm text-gray-400 mb-6">{dateLabel}</p>

      {habits.length === 0 && (
        <p className="text-sm text-gray-400 text-center mt-12">
          No habits yet.{' '}
          <Link to="/habits" className="text-black underline">Add some</Link>.
        </p>
      )}

      {habits.map(habit => (
        <HabitLogRow
          key={habit.id}
          habit={habit}
          log={logsMap.get(habit.id) ?? null}
          effectiveDate={effectiveDate}
          onLogChange={handleLogChange}
        />
      ))}
    </div>
  )
}
