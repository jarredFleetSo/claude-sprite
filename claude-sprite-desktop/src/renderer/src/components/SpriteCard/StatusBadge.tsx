import { Badge } from '../ui/badge'
import { categorizeStatus } from '../../lib/sprite-types'
import { cn } from '@/lib/utils'

interface StatusBadgeProps {
  status: string
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const category = categorizeStatus(status)

  let label: string
  let className: string
  let icon: string

  if (category === 'running') {
    label = 'Running'
    className = 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
    icon = '\u25cf'
  } else if (category === 'cold') {
    label = status === 'suspended' || status === 'sleeping' ? 'Sleeping' : 'Cold'
    className = 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20'
    icon = '\u25d1'
  } else {
    label = status
    className = 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/20'
    icon = '\u25cb'
  }

  return (
    <Badge variant="outline" className={cn('gap-1 font-medium', className)}>
      <span className="text-[10px]">{icon}</span>
      {label}
    </Badge>
  )
}
