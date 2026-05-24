import { useEffect, useState } from 'react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import HabitForm from '../components/HabitForm'
import { type Habit } from '../types'

function targetSummary(habit: Habit): string {
  if (habit.type !== 'quantity') return ''
  if (habit.target_direction === 'at_least') return `≥ ${habit.target_value}`
  if (habit.target_direction === 'at_most')  return `≤ ${habit.target_value}`
  if (habit.target_direction === 'range')    return `${habit.target_min}–${habit.target_max}`
  return ''
}

function SortableHabitRow({
  habit, onEdit, onDelete,
}: {
  habit: Habit
  onEdit: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: habit.id })
  const [confirming, setConfirming] = useState(false)

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="bg-white border rounded-xl px-4 py-3 mb-2"
    >
      <div className="flex items-center gap-3">
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab text-gray-300 select-none text-lg leading-none"
          aria-label="Drag to reorder"
        >
          ⠿
        </span>

        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{habit.name}</p>
          <p className="text-xs text-gray-400">
            {habit.category}
            {habit.type === 'quantity' && ` · ${targetSummary(habit)}`}
            {habit.type === 'avoid'    && ' · avoid'}
          </p>
        </div>

        {confirming ? (
          <div className="flex gap-2 text-xs shrink-0">
            <button onClick={() => setConfirming(false)} className="text-gray-500 hover:text-black">Cancel</button>
            <button onClick={onDelete} className="text-red-500 font-medium hover:text-red-700">Confirm</button>
          </div>
        ) : (
          <div className="flex gap-2 text-xs shrink-0">
            <button onClick={onEdit}                className="text-gray-500 hover:text-black">Edit</button>
            <button onClick={() => setConfirming(true)} className="text-red-400 hover:text-red-600">Delete</button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function HabitsPage() {
  const { session, profile } = useAuth()
  const [habits, setHabits]       = useState<Habit[]>([])
  const [loading, setLoading]     = useState(true)
  const [formHabit, setFormHabit] = useState<Habit | null | undefined>(undefined)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  async function load() {
    if (!session) return
    const { data } = await supabase
      .from('habits')
      .select('*')
      .eq('user_id', session.user.id)
      .is('archived_at', null)
      .order('sort_order', { ascending: true })
    setHabits((data as Habit[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [session])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = habits.findIndex(h => h.id === active.id)
    const newIndex = habits.findIndex(h => h.id === over.id)
    const reordered = arrayMove(habits, oldIndex, newIndex)
    setHabits(reordered)

    Promise.all(
      reordered.map((h, i) => supabase.from('habits').update({ sort_order: i }).eq('id', h.id))
    )
  }

  async function handleDelete(habit: Habit) {
    const { count } = await supabase
      .from('logs')
      .select('id', { count: 'exact', head: true })
      .eq('habit_id', habit.id)
    if ((count ?? 0) > 0) {
      await supabase.from('habits').update({ archived_at: new Date().toISOString() }).eq('id', habit.id)
    } else {
      await supabase.from('habits').delete().eq('id', habit.id)
    }
    load()
  }

  if (loading) return null

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-white">My habits</h1>
        {formHabit === undefined && (
          <button
            onClick={() => setFormHabit(null)}
            className="text-sm bg-black text-white px-3 py-1.5 rounded-lg"
          >
            + Add
          </button>
        )}
      </div>

      {formHabit !== undefined && (
        <HabitForm
          habit={formHabit ?? undefined}
          userId={session!.user.id}
          defaultVisibility={profile?.default_habit_visibility ?? 'detailed'}
          nextSortOrder={habits.length}
          onDone={() => { setFormHabit(undefined); load() }}
        />
      )}

      {habits.length === 0 && formHabit === undefined && (
        <p className="text-sm text-gray-400 text-center mt-12">
          No habits yet. Add one to get started.
        </p>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={habits.map(h => h.id)} strategy={verticalListSortingStrategy}>
          {habits.map(habit => (
            <SortableHabitRow
              key={habit.id}
              habit={habit}
              onEdit={() => setFormHabit(habit)}
              onDelete={() => handleDelete(habit)}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  )
}
