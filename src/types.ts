export type Visibility = 'detailed' | 'aggregated' | 'hidden'
export type HabitType = 'binary' | 'quantity' | 'avoid'
export type TargetDirection = 'at_least' | 'at_most' | 'range'
export type Category = 'Health' | 'Fitness' | 'Mental' | 'Productivity' | 'Learning' | 'Social' | 'Finance' | 'Other'

export const CATEGORIES: Category[] = [
  'Health', 'Fitness', 'Mental', 'Productivity', 'Learning', 'Social', 'Finance', 'Other',
]

export const VISIBILITY_OPTIONS: { value: Visibility; label: string; description: string }[] = [
  { value: 'detailed',   label: 'Detailed',   description: 'Friends see habit names and status' },
  { value: 'aggregated', label: 'Aggregated', description: 'Friends see category roll-ups only, no habit names' },
  { value: 'hidden',     label: 'Hidden',     description: 'Friends see nothing' },
]

export type LogStatus = 'skipped' | 'partial' | 'complete'

export interface Log {
  id: string
  habit_id: string
  logged_for_date: string
  logged_at: string
  value: number | null
  status: LogStatus
  was_logged_late: boolean
}

export interface Habit {
  id: string
  user_id: string
  name: string
  category: Category
  type: HabitType
  target_value: number | null
  target_direction: TargetDirection | null
  target_min: number | null
  target_max: number | null
  visibility: Visibility
  sort_order: number
  created_at: string
  archived_at: string | null
}
