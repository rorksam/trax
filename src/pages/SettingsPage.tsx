import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { type Visibility, VISIBILITY_OPTIONS, type Habit } from '../types'
import { subscribeToPush } from '../lib/pushSubscription'

type NotifType = 'evening' | 'morning' | 'sunday_review'
interface NotifPref { type: NotifType; enabled: boolean }

export default function SettingsPage() {
  const { profile, signOut, refreshProfile } = useAuth()
  const navigate = useNavigate()

  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [timezone, setTimezone] = useState(profile?.timezone ?? '')
  const [visibility, setVisibility] = useState<Visibility>(
    profile?.default_habit_visibility ?? 'detailed',
  )

  const [archivedHabits, setArchivedHabits] = useState<Habit[]>([])
  const [archivedLoading, setArchivedLoading] = useState(true)

  const [notifPrefs, setNotifPrefs] = useState<NotifPref[]>([])
  const [notifLoading, setNotifLoading] = useState(true)
  const [subscribing, setSubscribing] = useState(false)
  const [subscribeResult, setSubscribeResult] = useState<'subscribed' | 'denied' | 'unsupported' | null>(null)

  const [saved, setSaved] = useState<string | null>(null)
  const [nameError, setNameError] = useState('')
  const [tzError, setTzError] = useState('')
  const [restoringId, setRestoringId] = useState<string | null>(null)

  const userId = profile!.id

  function flashSaved(field: string) {
    setSaved(field)
    setTimeout(() => setSaved(null), 2000)
  }

  useEffect(() => {
    supabase
      .from('habits')
      .select('*')
      .eq('user_id', userId)
      .not('archived_at', 'is', null)
      .order('archived_at', { ascending: false })
      .then(({ data }) => {
        setArchivedHabits((data as Habit[]) ?? [])
        setArchivedLoading(false)
      })

    supabase
      .from('notification_preferences')
      .select('type, enabled')
      .eq('user_id', userId)
      .then(({ data }) => {
        setNotifPrefs((data as NotifPref[]) ?? [])
        setNotifLoading(false)
      })

    if ('Notification' in window && Notification.permission === 'granted') {
      subscribeToPush().then(result => {
        if (result === 'subscribed') setSubscribeResult('subscribed')
      })
    }
  }, [userId])

  async function saveDisplayName() {
    const trimmed = displayName.trim()
    if (!trimmed) { setNameError('Display name cannot be empty'); return }
    setNameError('')
    const { error } = await supabase
      .from('users')
      .update({ display_name: trimmed })
      .eq('id', userId)
    if (error) { setNameError(error.message); return }
    await refreshProfile()
    flashSaved('name')
  }

  async function saveTimezone() {
    const trimmed = timezone.trim()
    if (!trimmed) { setTzError('Timezone cannot be empty'); return }
    setTzError('')
    const { error } = await supabase
      .from('users')
      .update({ timezone: trimmed })
      .eq('id', userId)
    if (error) { setTzError(error.message); return }
    await refreshProfile()
    flashSaved('tz')
  }

  async function saveVisibility(v: Visibility) {
    setVisibility(v)
    const { error } = await supabase
      .from('users')
      .update({ default_habit_visibility: v })
      .eq('id', userId)
    if (!error) {
      await refreshProfile()
      flashSaved('vis')
    }
  }

  async function restoreHabit(habit: Habit) {
    setRestoringId(habit.id)
    const { data: maxRow } = await supabase
      .from('habits')
      .select('sort_order')
      .eq('user_id', userId)
      .is('archived_at', null)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()

    const newOrder = (maxRow?.sort_order ?? 0) + 1

    const { error } = await supabase
      .from('habits')
      .update({ archived_at: null, sort_order: newOrder })
      .eq('id', habit.id)

    setRestoringId(null)
    if (!error) {
      setArchivedHabits(prev => prev.filter(h => h.id !== habit.id))
    }
  }

  async function toggleNotifPref(type: NotifType, enabled: boolean) {
    setNotifPrefs(prev => prev.map(p => p.type === type ? { ...p, enabled } : p))
    await supabase
      .from('notification_preferences')
      .update({ enabled })
      .eq('user_id', userId)
      .eq('type', type)
  }

  async function handleEnableNotifications() {
    setSubscribing(true)
    const result = await subscribeToPush()
    setSubscribeResult(result)
    setSubscribing(false)
  }

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      <h1 className="text-2xl font-semibold text-white">Settings</h1>

      {/* Account */}
      <section className="bg-white rounded-2xl p-5 space-y-4">
        <h2 className="text-base font-semibold">Account</h2>

        <div>
          <label className="block text-sm font-medium mb-1">Display name</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveDisplayName()}
              onBlur={saveDisplayName}
              className="flex-1 border rounded-lg px-3 py-2 text-sm"
            />
            {saved === 'name' && (
              <span className="text-green-600 text-sm self-center">Saved</span>
            )}
          </div>
          {nameError && <p className="text-red-600 text-xs mt-1">{nameError}</p>}
        </div>

        <button
          onClick={handleSignOut}
          className="w-full border border-red-300 text-red-600 py-2 rounded-lg text-sm font-medium"
        >
          Sign out
        </button>
      </section>

      {/* Preferences */}
      <section className="bg-white rounded-2xl p-5 space-y-4">
        <h2 className="text-base font-semibold">Preferences</h2>

        <div>
          <label className="block text-sm font-medium mb-1">Timezone</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={timezone}
              onChange={e => setTimezone(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveTimezone()}
              onBlur={saveTimezone}
              className="flex-1 border rounded-lg px-3 py-2 text-sm font-mono"
            />
            {saved === 'tz' && (
              <span className="text-green-600 text-sm self-center">Saved</span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1">IANA format, e.g. America/New_York</p>
          {tzError && <p className="text-red-600 text-xs mt-1">{tzError}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Default habit visibility
            {saved === 'vis' && (
              <span className="text-green-600 font-normal ml-2">Saved</span>
            )}
          </label>
          <div className="space-y-2">
            {VISIBILITY_OPTIONS.map(opt => (
              <label key={opt.value} className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="vis"
                  value={opt.value}
                  checked={visibility === opt.value}
                  onChange={() => saveVisibility(opt.value)}
                  className="mt-0.5"
                />
                <span>
                  <span className="text-sm font-medium">{opt.label}</span>
                  <span className="text-xs text-gray-500 block">{opt.description}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      </section>

      {/* Notifications */}
      <section className="bg-white rounded-2xl p-5 space-y-4">
        <h2 className="text-base font-semibold">Notifications</h2>

        {'Notification' in window && Notification.permission !== 'granted' && (
          <div className="flex items-center justify-between gap-3 bg-gray-50 rounded-xl px-4 py-3">
            <p className="text-sm text-gray-600">Push notifications are not enabled on this device.</p>
            <button
              onClick={handleEnableNotifications}
              disabled={subscribing}
              className="shrink-0 text-sm text-blue-600 font-medium disabled:opacity-50"
            >
              {subscribing ? 'Enabling…' : 'Enable'}
            </button>
          </div>
        )}
        {subscribeResult === 'denied' && (
          <p className="text-xs text-red-600">
            Permission denied — enable notifications in your browser settings.
          </p>
        )}
        {subscribeResult === 'unsupported' && (
          <p className="text-xs text-gray-500">
            Push notifications are not supported in this browser. On iOS, install the app to your home screen first.
          </p>
        )}
        {subscribeResult === 'subscribed' && (
          <p className="text-xs text-green-600">Notifications enabled on this device.</p>
        )}

        {notifLoading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          <ul className="space-y-3">
            {([
              { type: 'evening'       as NotifType, label: 'Evening reminder', desc: 'Daily at 9 pm — log your habits.' },
              { type: 'morning'       as NotifType, label: 'Morning catch-up',  desc: 'At 11 am when yesterday has unlogged habits.' },
              { type: 'sunday_review' as NotifType, label: 'Sunday review',     desc: 'Sunday evening — weekly summary.' },
            ]).map(({ type, label, desc }) => {
              const pref = notifPrefs.find(p => p.type === type)
              return (
                <li key={type} className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-gray-500">{desc}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={pref?.enabled ?? false}
                    onChange={e => toggleNotifPref(type, e.target.checked)}
                    className="mt-1 shrink-0"
                  />
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Archived Habits */}
      <section className="bg-white rounded-2xl p-5">
        <h2 className="text-base font-semibold mb-3">Archived habits</h2>

        {archivedLoading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : archivedHabits.length === 0 ? (
          <p className="text-sm text-gray-400">No archived habits.</p>
        ) : (
          <ul className="space-y-2">
            {archivedHabits.map(habit => (
              <li
                key={habit.id}
                className="flex items-center justify-between gap-3 border rounded-xl px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{habit.name}</p>
                  <p className="text-xs text-gray-400">
                    {habit.category} · archived{' '}
                    {new Date(habit.archived_at!).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => restoreHabit(habit)}
                  disabled={restoringId === habit.id}
                  className="shrink-0 text-sm text-blue-600 font-medium disabled:opacity-50"
                >
                  {restoringId === habit.id ? 'Restoring…' : 'Restore'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
