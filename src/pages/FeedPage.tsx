import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { getEffectiveDate, formatFeedDateLabel } from '../lib/effectiveDate'
import { CATEGORIES, type Category, type LogStatus } from '../types'
import StatusDot from '../components/StatusDot'

// ── Local types ───────────────────────────────────────────────

interface HabitRow {
  id: string
  user_id: string
  name: string
  category: string
  type: string
  visibility: 'detailed' | 'aggregated'
  target_value: number | null
  target_min: number | null
}

interface LogRow {
  habit_id: string
  logged_for_date: string
  logged_at: string
  status: LogStatus
  was_logged_late: boolean
}

interface CategorySection {
  name: Category
  color: 'green' | 'amber' | 'gray'
  rows: { name: string | null; status: LogStatus | 'none' }[]
}

interface FeedCard {
  friendId: string
  displayName: string | null
  date: string
  dateLabel: string
  isLate: boolean
  latestLoggedAt: string
  blurb: string | null
  categories: CategorySection[]
}

// ── Helpers ───────────────────────────────────────────────────

function categoryColor(statuses: (LogStatus | 'none')[]): 'green' | 'amber' | 'gray' {
  const complete = statuses.filter(s => s === 'complete').length
  const partial  = statuses.filter(s => s === 'partial').length
  if (complete === statuses.length) return 'green'
  if (complete > 0 || partial > 0) return 'amber'
  return 'gray'
}

const HEADING_COLOR: Record<'green' | 'amber' | 'gray', string> = {
  green: 'text-green-500',
  amber: 'text-amber-500',
  gray:  'text-gray-400',
}


// ── FeedCardView ──────────────────────────────────────────────

function FeedCardView({ card }: { card: FeedCard }) {
  return (
    <div className="bg-white rounded-2xl p-5">
      <div className="flex items-baseline justify-between mb-1">
        <span className="font-semibold text-sm">{card.displayName ?? 'Unknown'}</span>
        <span className="text-xs text-gray-400">
          {card.dateLabel}
          {card.isLate && <span className="ml-2 italic">· logged late</span>}
        </span>
      </div>

      {card.blurb && (
        <p className="text-sm text-gray-500 italic mb-3 mt-1">"{card.blurb}"</p>
      )}

      <div className="space-y-3 mt-2">
        {card.categories.map(cat => {
          const detailed    = cat.rows.filter(r => r.name !== null)
          const aggregated  = cat.rows.filter(r => r.name === null)
          return (
            <div key={cat.name}>
              <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${HEADING_COLOR[cat.color]}`}>
                {cat.name}
              </p>
              <div className="space-y-0.5">
                {detailed.map((row, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <StatusDot status={row.status} />
                    <span className="text-gray-700">{row.name}</span>
                  </div>
                ))}
                {aggregated.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {aggregated.map((row, i) => <StatusDot key={i} status={row.status} />)}
                    <span className="text-xs text-gray-400 ml-0.5">
                      · {aggregated.length} habit{aggregated.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── DevPanel ──────────────────────────────────────────────────

function DevPanel({ timezone, onRefresh }: { timezone: string; onRefresh: () => void }) {
  const { profile } = useAuth()
  const [date, setDate]       = useState(getEffectiveDate(timezone))
  const [seeding, setSeeding] = useState(false)
  const [clearing, setClearing] = useState(false)

  async function getHabits() {
    const { data } = await supabase
      .from('habits')
      .select('id, type, target_value, target_min')
      .eq('user_id', profile!.id)
      .is('archived_at', null)
    return data ?? []
  }

  async function seedForDate(targetDate: string) {
    setSeeding(true)
    const habits = await getHabits()
    if (habits.length) {
      const logs = habits.map(h => ({
        habit_id:        h.id,
        logged_for_date: targetDate,
        status:          'complete',
        value:           h.type === 'quantity' ? (h.target_value ?? h.target_min ?? 1) : null,
        was_logged_late: false,
      }))
      await supabase.from('logs').upsert(logs, { onConflict: 'habit_id,logged_for_date', ignoreDuplicates: true })
    }
    setSeeding(false)
    onRefresh()
  }

  async function clearLogs() {
    setClearing(true)
    const habits = await getHabits()
    if (habits.length) {
      await supabase
        .from('logs')
        .delete()
        .in('habit_id', habits.map(h => h.id))
        .eq('logged_for_date', date)
    }
    setClearing(false)
    onRefresh()
  }

  return (
    <div className="mt-8 rounded-xl border border-dashed border-yellow-500/50 p-4">
      <p className="text-yellow-500 text-xs font-mono mb-3">DEV PANEL</p>
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="bg-white/10 text-white text-sm rounded-lg px-3 py-2 font-mono"
        />
        <button
          onClick={() => seedForDate(date)}
          disabled={seeding}
          className="bg-yellow-500 text-black text-sm px-3 py-2 rounded-lg font-medium disabled:opacity-50"
        >
          {seeding ? 'Seeding…' : 'Seed complete'}
        </button>
        <button
          onClick={clearLogs}
          disabled={clearing}
          className="bg-red-800 text-white text-sm px-3 py-2 rounded-lg font-medium disabled:opacity-50"
        >
          {clearing ? 'Clearing…' : 'Clear logs'}
        </button>
        <button
          onClick={() => seedForDate(getEffectiveDate(timezone))}
          disabled={seeding}
          className="text-yellow-500 text-sm px-3 py-2 rounded-lg border border-yellow-500/40 disabled:opacity-50"
        >
          Seed today
        </button>
      </div>
    </div>
  )
}

// ── FeedPage ──────────────────────────────────────────────────

export default function FeedPage() {
  const { profile } = useAuth()
  const timezone    = profile!.timezone ?? 'UTC'

  const [cards, setCards]         = useState<FeedCard[]>([])
  const [hasFriends, setHasFriends] = useState(true)
  const [loading, setLoading]     = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const userId = profile!.id

    const { data: friendshipRows } = await supabase
      .from('friendships')
      .select('user_a_id, user_b_id')
      .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)

    const friendIds = (friendshipRows ?? []).map(r =>
      r.user_a_id === userId ? r.user_b_id : r.user_a_id
    )

    if (!friendIds.length) {
      setHasFriends(false)
      setCards([])
      setLoading(false)
      return
    }
    setHasFriends(true)

    const [{ data: friendProfiles }, { data: habitRows }] = await Promise.all([
      supabase.from('users').select('id, display_name').in('id', friendIds),
      supabase
        .from('habits')
        .select('id, user_id, name, category, type, visibility, target_value, target_min')
        .in('user_id', friendIds)
        .is('archived_at', null),
    ])

    if (!habitRows?.length) {
      setCards([])
      setLoading(false)
      return
    }

    const habitIds = (habitRows as HabitRow[]).map(h => h.id)

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 7)
    const cutoffStr = cutoff.toISOString().split('T')[0]

    const [{ data: logRows }, { data: blurbRows }] = await Promise.all([
      supabase
        .from('logs')
        .select('habit_id, logged_for_date, logged_at, status, was_logged_late')
        .in('habit_id', habitIds)
        .gte('logged_for_date', cutoffStr),
      supabase
        .from('blurbs')
        .select('user_id, for_date, text')
        .in('user_id', friendIds)
        .gte('for_date', cutoffStr),
    ])

    const friendProfileMap = new Map((friendProfiles ?? []).map(f => [f.id, f]))
    const newCards: FeedCard[] = []

    for (const friendId of friendIds) {
      const friend       = friendProfileMap.get(friendId)
      const friendHabits = (habitRows as HabitRow[]).filter(h => h.user_id === friendId)
      const habitIdSet   = new Set(friendHabits.map(h => h.id))
      const friendLogs   = (logRows as LogRow[] ?? []).filter(l => habitIdSet.has(l.habit_id))

      if (!friendLogs.length) continue

      const maxDate      = friendLogs.reduce((max, l) => l.logged_for_date > max ? l.logged_for_date : max, '')
      const logsForDate  = friendLogs.filter(l => l.logged_for_date === maxDate)
      const logMap       = new Map(logsForDate.map(l => [l.habit_id, l]))
      const isLate       = logsForDate.some(l => l.was_logged_late)
      const latestLoggedAt = logsForDate.reduce((max, l) => l.logged_at > max ? l.logged_at : max, '')
      const blurb        = (blurbRows ?? []).find(b => b.user_id === friendId && b.for_date === maxDate)?.text ?? null

      // Build categories in curated order, skipping empty ones
      const byCategory = new Map<Category, HabitRow[]>()
      for (const cat of CATEGORIES) byCategory.set(cat, [])
      for (const h of friendHabits) byCategory.get(h.category as Category)!.push(h)

      const categories: CategorySection[] = []
      for (const catName of CATEGORIES) {
        const catHabits = byCategory.get(catName)!
        if (!catHabits.length) continue
        const rows = catHabits.map(h => ({
          name:   h.visibility === 'aggregated' ? null : h.name,
          status: (logMap.get(h.id)?.status ?? 'none') as LogStatus | 'none',
        }))
        categories.push({ name: catName, color: categoryColor(rows.map(r => r.status)), rows })
      }

      newCards.push({ friendId, displayName: friend?.display_name ?? null, date: maxDate, dateLabel: formatFeedDateLabel(maxDate, timezone), isLate, latestLoggedAt, blurb, categories })
    }

    newCards.sort((a, b) => {
      if (a.isLate !== b.isLate) return a.isLate ? -1 : 1
      if (a.latestLoggedAt !== b.latestLoggedAt) return a.latestLoggedAt > b.latestLoggedAt ? -1 : 1
      return (a.displayName ?? '').localeCompare(b.displayName ?? '')
    })

    setCards(newCards)
    setLoading(false)
  }, [profile, timezone])

  useEffect(() => { load() }, [load])

  if (loading) return null

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h1 className="text-white text-2xl font-semibold mb-6">Feed</h1>

      {!hasFriends ? (
        <p className="text-gray-400 text-sm text-center mt-12">
          Add friends to see their activity here.
        </p>
      ) : cards.length === 0 ? (
        <p className="text-gray-400 text-sm text-center mt-12">
          No activity from friends yet.
        </p>
      ) : (
        <div className="space-y-4">
          {cards.map(card => (
            <FeedCardView key={card.friendId} card={card} />
          ))}
        </div>
      )}

      {import.meta.env.DEV && <DevPanel timezone={timezone} onRefresh={load} />}
    </div>
  )
}
