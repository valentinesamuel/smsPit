import { cn } from '../lib/utils'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'otp' | 'notification' | 'default'
  className?: string
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
      variant === 'otp' && 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200',
      variant === 'notification' && 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      variant === 'default' && 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
      className
    )}>
      {children}
    </span>
  )
}
