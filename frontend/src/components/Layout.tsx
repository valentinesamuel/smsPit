import { useState, useEffect, useCallback } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Inbox, SkullIcon, FolderOpen, Moon, Sun, Terminal, Volume2, VolumeX } from 'lucide-react'
import { cn } from '../lib/utils'
import { api } from '../lib/api'
import { useSSE } from '../hooks/useSSE'
import type { SSEEvent } from '../types'

interface LayoutProps {
  children: React.ReactNode
  project: string | null
  onProjectChange: (p: string | null) => void
}

function getInitialDark(): boolean {
  const saved = localStorage.getItem('theme')
  if (saved === 'dark') return true
  if (saved === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function Layout({ children, project, onProjectChange }: LayoutProps) {
  const location = useLocation()
  const [projects, setProjects] = useState<{ name: string }[]>([])
  const [dark, setDark] = useState(getInitialDark)
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('soundEnabled') === 'true')
  const [deadLetterCount, setDeadLetterCount] = useState(0)
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    api.listProjects().then(res => setProjects(res.projects || []))
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  const refreshCounts = useCallback(() => {
    api.getStats(project || undefined).then(s => {
      setDeadLetterCount(s.dead_letter_count)
      setUnreadCount(s.unread_count)
    }).catch(() => {})
  }, [project])

  useEffect(() => {
    refreshCounts()
    const interval = setInterval(refreshCounts, 30000)
    return () => clearInterval(interval)
  }, [refreshCounts])

  // Optimistic unread badge via window events (from bulk mark-read)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { delta: number }
      setUnreadCount(c => Math.max(0, c + detail.delta))
    }
    window.addEventListener('unread:change', handler)
    return () => window.removeEventListener('unread:change', handler)
  }, [])

  // Optimistic dead letter badge via window events (from bulk delete)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { delta: number }
      setDeadLetterCount(c => Math.max(0, c + detail.delta))
    }
    window.addEventListener('deadletter:change', handler)
    return () => window.removeEventListener('deadletter:change', handler)
  }, [])

  // SSE-driven badge updates
  const handleSSEEvent = useCallback((e: SSEEvent) => {
    if (e.type === 'message:new') {
      setUnreadCount(c => c + 1)
    } else if (e.type === 'message:read') {
      refreshCounts()
    } else if (e.type === 'deadletter:new') {
      setDeadLetterCount(c => c + 1)
    } else if (e.type === 'deadletter:resolved') {
      setDeadLetterCount(c => Math.max(0, c - 1))
    }
  }, [refreshCounts])

  useSSE(project, handleSSEEvent)

  const toggleSound = () => {
    setSoundEnabled(v => {
      const next = !v
      localStorage.setItem('soundEnabled', next ? 'true' : 'false')
      return next
    })
  }

  const nav = [
    {
      to: '/',
      icon: Inbox,
      label: 'Inbox',
      badge: unreadCount > 0 ? unreadCount : undefined,
    },
    {
      to: '/dead-letters',
      icon: SkullIcon,
      label: 'Dead Letters',
      badge: deadLetterCount > 0 ? deadLetterCount : undefined,
      badgeVariant: 'red' as const,
    },
    { to: '/projects', icon: FolderOpen, label: 'Projects' },
    { to: '/query', icon: Terminal, label: 'Query' },
  ]

  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-zinc-200 dark:border-zinc-800 flex flex-col bg-white dark:bg-zinc-900">
        <div className="p-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="text-xl">📱</span>
            <span className="font-bold text-lg text-zinc-900 dark:text-zinc-100">SMSpit</span>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">SMS Testing Platform</p>
        </div>

        {/* Project switcher */}
        <div className="p-3 border-b border-zinc-100 dark:border-zinc-800">
          <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide block mb-1">Project</label>
          <select
            className="w-full text-sm rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-500"
            value={project || ''}
            onChange={e => onProjectChange(e.target.value || null)}
          >
            <option value="">All projects</option>
            {projects.map(p => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
        </div>

        <nav className="flex-1 p-2 space-y-0.5">
          {nav.map(({ to, icon: Icon, label, badge, badgeVariant }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                location.pathname === to
                  ? 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300'
                  : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
              )}
            >
              <Icon size={16} />
              <span className="flex-1">{label}</span>
              {badge !== undefined && (
                <span className={cn(
                  'text-xs font-semibold px-1.5 py-0.5 rounded-full',
                  badgeVariant === 'red'
                    ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                    : 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
                )}>
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
          <button
            onClick={toggleSound}
            className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 w-full"
            title={soundEnabled ? 'Disable sound notifications' : 'Enable sound notifications'}
          >
            {soundEnabled ? <Volume2 size={14} className="text-violet-500" /> : <VolumeX size={14} />}
            {soundEnabled ? 'Sound on' : 'Sound off'}
          </button>
          <button
            onClick={() => setDark(d => !d)}
            className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 w-full"
          >
            {dark ? <Sun size={14} /> : <Moon size={14} />}
            {dark ? 'Light mode' : 'Dark mode'}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  )
}
