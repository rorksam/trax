import { useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  type Habit, type HabitType, type TargetDirection, type Visibility,
  CATEGORIES, VISIBILITY_OPTIONS,
} from '../types'

interface Props {
  habit?: Habit
  userId: string
  defaultVisibility: Visibility
  nextSortOrder: number
  onDone: () => void
}

const SUBSTANTIVE_FIELDS: (keyof Habit)[] = ['type', 'target_direction', 'target_value', 'target_min', 'target_max']

export default function HabitForm({ habit, userId, defaultVisibility, nextSortOrder, onDone }: Props) {
  const [name, setName]             = useState(habit?.name ?? '')
  const [category, setCategory]     = useState(habit?.category ?? CATEGORIES[0])
  const [type, setType]             = useState<HabitType>(habit?.type ?? 'binary')
  const [direction, setDirection]   = useState<TargetDirection>(habit?.target_direction ?? 'at_least')
  const [targetValue, setTargetValue] = useState(habit?.target_value?.toString() ?? '')
  const [targetMin, setTargetMin]   = useState(habit?.target_min?.toString() ?? '')
  const [targetMax, setTargetMax]   = useState(habit?.target_max?.toString() ?? '')
  const [visibility, setVisibility] = useState<Visibility>(habit?.visibility ?? defaultVisibility)
  const [error, setError]           = useState('')
  const [loading, setLoading]       = useState(false)

  function buildPayload() {
    const isQuantity = type === 'quantity'
    const isRange    = isQuantity && direction === 'range'
    return {
      name:             name.trim(),
      category,
      type,
      target_direction: isQuantity ? direction : null,
      target_value:     isQuantity && !isRange ? parseFloat(targetValue) : null,
      target_min:       isRange ? parseFloat(targetMin) : null,
      target_max:       isRange ? parseFloat(targetMax) : null,
      visibility,
    }
  }

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault()
    setError('')

    if (type === 'quantity' && direction === 'range' && parseFloat(targetMin) >= parseFloat(targetMax)) {
      setError('Minimum must be less than maximum')
      return
    }

    setLoading(true)

    const payload = buildPayload()

    if (habit) {
      const isSubstantive = SUBSTANTIVE_FIELDS.some(
        f => payload[f as keyof typeof payload] !== habit[f]
      )

      if (isSubstantive) {
        const { error: e1 } = await supabase
          .from('habits').update({ archived_at: new Date().toISOString() }).eq('id', habit.id)
        if (e1) { setError(e1.message); setLoading(false); return }

        const { error: e2 } = await supabase.from('habits').insert({
          user_id: habit.user_id, ...payload, sort_order: habit.sort_order,
        })
        if (e2) { setError(e2.message); setLoading(false); return }
      } else {
        const { error: e3 } = await supabase.from('habits').update({
          name: payload.name, category: payload.category, visibility: payload.visibility,
        }).eq('id', habit.id)
        if (e3) { setError(e3.message); setLoading(false); return }
      }
    } else {
      const { error: e4 } = await supabase.from('habits').insert({
        user_id: userId, ...payload, sort_order: nextSortOrder,
      })
      if (e4) { setError(e4.message); setLoading(false); return }
    }

    onDone()
  }

  return (
    <form onSubmit={handleSubmit} className="border rounded-xl p-5 mb-4 space-y-4 bg-white">
      <h2 className="font-semibold">{habit ? 'Edit habit' : 'New habit'}</h2>

      <div>
        <label className="block text-sm font-medium mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          required
          className="w-full border rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Category</label>
          <select
            value={category}
            onChange={e => setCategory(e.target.value as typeof category)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          >
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Type</label>
          <select
            value={type}
            onChange={e => setType(e.target.value as HabitType)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          >
            <option value="binary">Binary</option>
            <option value="quantity">Quantity</option>
            <option value="avoid">Avoid</option>
          </select>
        </div>
      </div>

      {type === 'quantity' && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Direction</label>
            <select
              value={direction}
              onChange={e => setDirection(e.target.value as TargetDirection)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              <option value="at_least">At least</option>
              <option value="at_most">At most</option>
              <option value="range">Range</option>
            </select>
          </div>

          {direction !== 'range' && (
            <div>
              <label className="block text-sm font-medium mb-1">Target value</label>
              <input
                type="number"
                value={targetValue}
                onChange={e => setTargetValue(e.target.value)}
                required
                min={0}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          )}

          {direction === 'range' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">Minimum</label>
                <input
                  type="number"
                  value={targetMin}
                  onChange={e => setTargetMin(e.target.value)}
                  required
                  min={0}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Maximum</label>
                <input
                  type="number"
                  value={targetMax}
                  onChange={e => setTargetMax(e.target.value)}
                  required
                  min={0}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </>
          )}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-2">Visibility</label>
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

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-black text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {loading ? 'Saving…' : habit ? 'Save changes' : 'Add habit'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="px-4 py-2 border rounded-lg text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
