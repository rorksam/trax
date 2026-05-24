import type { LogStatus } from '../types'

interface Props {
  status: LogStatus | 'none'
  // 'circle' (default): none and skipped both render as an outline circle — used in feed
  // 'dash': none renders as a short horizontal bar, skipped as outline circle — used in Today
  noneStyle?: 'circle' | 'dash'
}

export default function StatusDot({ status, noneStyle = 'circle' }: Props) {
  const base = 'inline-block flex-shrink-0 rounded-full w-2.5 h-2.5'

  if (status === 'complete')
    return <span className={`${base} bg-green-500`} />

  if (status === 'partial')
    return (
      <span
        className={`${base} border border-amber-500`}
        style={{ background: 'linear-gradient(90deg, #f59e0b 50%, transparent 50%)' }}
      />
    )

  if (status === 'skipped' || noneStyle === 'circle')
    return <span className={`${base} border border-gray-400`} />

  // none + noneStyle='dash' — not yet logged today
  return (
    <span className="inline-flex items-center justify-center w-2.5 h-2.5 flex-shrink-0">
      <span className="w-2 h-0.5 bg-gray-300 rounded-full" />
    </span>
  )
}
