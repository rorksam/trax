import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

interface Props {
  effectiveDate: string
}

export default function BlurbInput({ effectiveDate }: Props) {
  const { session } = useAuth()
  const [text, setText] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!session) return
    setText('')
    supabase
      .from('blurbs')
      .select('text')
      .eq('user_id', session.user.id)
      .eq('for_date', effectiveDate)
      .maybeSingle()
      .then(({ data }) => { if (data) setText(data.text) })
  }, [session, effectiveDate])

  async function save() {
    if (!session) return
    const trimmed = text.trim()
    if (!trimmed) {
      await supabase
        .from('blurbs')
        .delete()
        .eq('user_id', session.user.id)
        .eq('for_date', effectiveDate)
      return
    }
    await supabase
      .from('blurbs')
      .upsert(
        { user_id: session.user.id, for_date: effectiveDate, text: trimmed, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,for_date' }
      )
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="relative mb-5">
      <input
        type="text"
        maxLength={140}
        placeholder="Add a blurb for today… (optional)"
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={save}
        className="w-full bg-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-white/30"
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">
        {saved ? 'Saved' : text.length > 100 ? `${140 - text.length}` : ''}
      </span>
    </div>
  )
}
