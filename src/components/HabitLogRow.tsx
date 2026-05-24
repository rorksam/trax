import { useEffect, useRef, useState } from 'react'
import { useSwipeable } from 'react-swipeable'
import { supabase } from '../lib/supabase'
import { type Habit, type Log, type LogStatus } from '../types'

interface Props {
  habit: Habit
  log: Log | null
  effectiveDate: string
  onLogChange: (habitId: string, log: Log | null) => void
}

function computeQuantityStatus(value: number, habit: Habit): LogStatus {
  if (habit.target_direction === 'at_least') return value >= (habit.target_value ?? 0) ? 'complete' : 'partial'
  if (habit.target_direction === 'at_most')  return value <= (habit.target_value ?? Infinity) ? 'complete' : 'partial'
  if (habit.target_direction === 'range')    return value >= (habit.target_min ?? 0) && value <= (habit.target_max ?? Infinity) ? 'complete' : 'partial'
  return 'partial'
}

function targetLabel(habit: Habit): string {
  if (habit.target_direction === 'at_least') return `at least ${habit.target_value}`
  if (habit.target_direction === 'at_most')  return `at most ${habit.target_value}`
  if (habit.target_direction === 'range')    return `${habit.target_min}–${habit.target_max}`
  return ''
}

function statusBg(status: 'none' | LogStatus): string {
  switch (status) {
    case 'complete': return 'bg-green-50 border-green-200'
    case 'partial':  return 'bg-amber-50 border-amber-200'
    case 'skipped':  return 'bg-gray-100 border-gray-300'
    default:         return 'bg-white border-gray-200'
  }
}

function statusDot(status: 'none' | LogStatus): { char: string; color: string } {
  switch (status) {
    case 'complete': return { char: '●', color: 'text-green-500' }
    case 'partial':  return { char: '◐', color: 'text-amber-500' }
    case 'skipped':  return { char: '○', color: 'text-gray-400' }
    default:         return { char: '—', color: 'text-gray-300' }
  }
}

export default function HabitLogRow({ habit, log, effectiveDate, onLogChange }: Props) {
  const [expanded, setExpanded]           = useState(false)
  const [quantityInput, setQuantityInput] = useState(log?.value?.toString() ?? '')
  const [saving, setSaving]               = useState(false)
  const rowRef                            = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setQuantityInput(log?.value?.toString() ?? '')
  }, [log?.value])

  useEffect(() => {
    if (!expanded) return
    function handleClickOutside(e: MouseEvent) {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) {
        setExpanded(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [expanded])

  const status: 'none' | LogStatus = log?.status ?? 'none'

  async function saveStatus(next: 'none' | LogStatus) {
    setSaving(true)
    if (next === 'none') {
      if (log) await supabase.from('logs').delete().eq('id', log.id)
      onLogChange(habit.id, null)
    } else if (log) {
      const { data } = await supabase
        .from('logs').update({ status: next }).eq('id', log.id).select().single()
      onLogChange(habit.id, data as Log)
    } else {
      const { data } = await supabase
        .from('logs').insert({
          habit_id: habit.id, logged_for_date: effectiveDate,
          status: next, was_logged_late: false,
        }).select().single()
      onLogChange(habit.id, data as Log)
    }
    setSaving(false)
  }

  async function saveQuantity() {
    const val = parseFloat(quantityInput)
    if (isNaN(val)) return
    const nextStatus = computeQuantityStatus(val, habit)
    setSaving(true)
    if (log) {
      const { data } = await supabase
        .from('logs').update({ value: val, status: nextStatus }).eq('id', log.id).select().single()
      onLogChange(habit.id, data as Log)
    } else {
      const { data } = await supabase
        .from('logs').insert({
          habit_id: habit.id, logged_for_date: effectiveDate,
          value: val, status: nextStatus, was_logged_late: false,
        }).select().single()
      onLogChange(habit.id, data as Log)
    }
    setSaving(false)
  }

  function handleSwipe(dir: 'right' | 'left') {
    if (habit.type === 'quantity') {
      if (dir === 'left' && log) { saveStatus('none'); setQuantityInput('') }
      else setExpanded(true)
      return
    }
    const next: 'none' | LogStatus =
      dir === 'right'
        ? status === 'complete' ? 'none' : 'complete'
        : status === 'skipped'  ? 'none' : 'skipped'
    saveStatus(next)
  }

  const swipeHandlers = useSwipeable({
    onSwipedRight: () => handleSwipe('right'),
    onSwipedLeft:  () => handleSwipe('left'),
    onTap:         () => setExpanded(e => !e),
    trackMouse:    true,
    delta:         40,
    preventScrollOnSwipe: false,
  })

  const dot = statusDot(status)

  return (
    <div ref={rowRef} className={`border rounded-xl mb-2 overflow-hidden transition-colors ${statusBg(status)} ${saving ? 'opacity-60' : ''}`}>
      {/* Swipe zone: header row only. Clicks/taps on expanded content below are unaffected. */}
      <div
        {...swipeHandlers}
        className="flex items-center gap-3 px-4 py-3 select-none cursor-pointer"
      >
        <span className={`text-lg leading-none ${dot.color}`}>{dot.char}</span>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{habit.name}</p>
          <p className="text-xs text-gray-400">
            {habit.category}
            {habit.type === 'quantity' && ` · ${targetLabel(habit)}`}
            {habit.type === 'avoid'    && ' · avoid'}
          </p>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pt-1 pb-3 space-y-2">
          {habit.type === 'quantity' ? (
            <div className="space-y-2">
              <input
                type="number"
                value={quantityInput}
                onChange={e => setQuantityInput(e.target.value)}
                onBlur={saveQuantity}
                onKeyDown={e => e.key === 'Enter' && saveQuantity()}
                min={0}
                autoFocus
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
              {log && (
                <button
                  onClick={() => { saveStatus('none'); setQuantityInput(''); setExpanded(false) }}
                  className="w-full py-2 border rounded-lg text-sm text-red-500 border-red-200"
                >
                  Clear
                </button>
              )}
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => { saveStatus(status === 'skipped' ? 'none' : 'skipped'); setExpanded(false) }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${status === 'skipped' ? 'bg-gray-200 border-gray-400' : 'bg-white border-gray-200'}`}
              >
                {status === 'skipped' ? 'Undo skip' : 'Skip'}
              </button>
              <button
                onClick={() => { saveStatus(status === 'complete' ? 'none' : 'complete'); setExpanded(false) }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${status === 'complete' ? 'bg-green-100 border-green-300' : 'bg-white border-gray-200'}`}
              >
                {status === 'complete'
                  ? 'Undo'
                  : habit.type === 'avoid' ? 'Avoided' : 'Complete'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
