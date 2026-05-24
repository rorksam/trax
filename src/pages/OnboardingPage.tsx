import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { type Visibility, VISIBILITY_OPTIONS } from '../types'

export default function OnboardingPage() {
  const { session, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('')
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone)
  const [visibility, setVisibility] = useState<Visibility>('detailed')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault()
    if (!session) return
    setError('')
    setLoading(true)

    const { error } = await supabase
      .from('users')
      .update({
        display_name: displayName.trim(),
        timezone,
        default_habit_visibility: visibility,
      })
      .eq('id', session.user.id)

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      await refreshProfile()
      navigate('/')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-sm p-8 bg-white rounded-2xl shadow-sm">
        <h1 className="text-2xl font-semibold mb-1">Set up your profile</h1>
        <p className="text-sm text-gray-500 mb-6">Just a few things before you start.</p>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium mb-1">Display name</label>
            <input
              type="text"
              placeholder="How friends will see you"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              required
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Your timezone</label>
            <input
              type="text"
              value={timezone}
              onChange={e => setTimezone(e.target.value)}
              required
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
            />
            <p className="text-xs text-gray-400 mt-1">Auto-detected — change if wrong (IANA format, e.g. America/New_York).</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Default habit visibility</label>
            <div className="space-y-2">
              {VISIBILITY_OPTIONS.map(opt => (
                <label key={opt.value} className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="visibility"
                    value={opt.value}
                    checked={visibility === opt.value}
                    onChange={() => setVisibility(opt.value)}
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
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-black text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {loading ? 'Saving…' : 'Get started'}
          </button>
        </form>
      </div>
    </div>
  )
}
