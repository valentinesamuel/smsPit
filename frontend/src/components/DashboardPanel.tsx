import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, AlertTriangle, TrendingUp, MessageSquare, Key, Bell } from 'lucide-react'
import { api } from '../lib/api'
import { useSSE } from '../hooks/useSSE'
import { Button } from './Button'
import type { Stats, SSEEvent } from '../types'

interface DashboardPanelProps {
  project: string | null
}

export function DashboardPanel({ project }: DashboardPanelProps) {
  const navigate = useNavigate()
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const s = await api.getStats(project || undefined)
      setStats(s)
    } finally {
      setLoading(false)
    }
  }, [project])

  useEffect(() => { load() }, [load])

  const handleSSEEvent = useCallback((e: SSEEvent) => {
    if (
      e.type === 'message:new' ||
      e.type === 'message:deleted' ||
      e.type === 'message:read' ||
      e.type === 'deadletter:new' ||
      e.type === 'deadletter:resolved'
    ) {
      load()
    }
  }, [load])

  useSSE(project, handleSSEEvent)

  const maxMessages = stats?.max_messages ?? 0
  const total = stats?.total ?? 0
  const pct = maxMessages > 0 ? Math.round((total / maxMessages) * 100) : 0

  const statCards = [
    {
      label: 'Total',
      value: stats?.total ?? 0,
      icon: MessageSquare,
      color: 'text-zinc-900 dark:text-zinc-100',
      iconColor: 'text-zinc-400',
    },
    {
      label: 'OTP',
      value: stats?.otp_count ?? 0,
      icon: Key,
      color: 'text-violet-700 dark:text-violet-300',
      iconColor: 'text-violet-400',
    },
    {
      label: 'Notifications',
      value: stats?.notification_count ?? 0,
      icon: Bell,
      color: 'text-blue-700 dark:text-blue-300',
      iconColor: 'text-blue-400',
    },
    {
      label: 'Dead Letters',
      value: stats?.dead_letter_count ?? 0,
      icon: AlertTriangle,
      color: (stats?.dead_letter_count ?? 0) > 0 ? 'text-red-600 dark:text-red-400' : 'text-zinc-900 dark:text-zinc-100',
      iconColor: (stats?.dead_letter_count ?? 0) > 0 ? 'text-red-400' : 'text-zinc-400',
      onClick: () => navigate('/dead-letters'),
    },
  ]

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
        <div className="flex items-center gap-2">
          <TrendingUp size={15} className="text-violet-500" />
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Dashboard</span>
        </div>
        <Button variant="ghost" size="sm" onClick={load}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-3">
          {statCards.map(card => (
            <div
              key={card.label}
              onClick={card.onClick}
              className={`bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 ${card.onClick ? 'cursor-pointer hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors' : ''}`}
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-zinc-500 uppercase tracking-wide">{card.label}</p>
                <card.icon size={13} className={card.iconColor} />
              </div>
              <p className={`text-2xl font-bold ${card.color}`}>
                {loading ? '–' : card.value}
              </p>
            </div>
          ))}
        </div>

        {/* Storage bar */}
        {maxMessages > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-xs text-zinc-500 uppercase tracking-wide">Storage</p>
              <span className={`text-xs font-medium ${pct >= 85 ? 'text-orange-500' : 'text-zinc-500'}`}>
                {total}/{maxMessages}
              </span>
            </div>
            <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  pct >= 85 ? 'bg-orange-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-violet-500'
                }`}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
            {pct >= 85 && (
              <p className="text-xs text-orange-500">{pct}% used — consider exporting</p>
            )}
          </div>
        )}

        {/* Per-number breakdown */}
        {(stats?.per_number?.length ?? 0) > 0 && (
          <div className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden">
            <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-700">
              <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wide">Per Number</p>
            </div>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-700 max-h-52 overflow-y-auto">
              {stats!.per_number.map(row => (
                <div key={row.to} className="flex items-center justify-between px-3 py-2">
                  <span className="text-xs font-mono text-zinc-600 dark:text-zinc-400 truncate mr-2">{row.to}</span>
                  <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 shrink-0">{row.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Dead letters quick link */}
        {(stats?.dead_letter_count ?? 0) > 0 && (
          <button
            onClick={() => navigate('/dead-letters')}
            className="w-full flex items-center gap-2 p-3 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 text-left hover:bg-red-100 dark:hover:bg-red-950/40 transition-colors"
          >
            <AlertTriangle size={14} className="text-red-500 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-red-700 dark:text-red-400">
                {stats!.dead_letter_count} failed webhook{stats!.dead_letter_count !== 1 ? 's' : ''}
              </p>
              <p className="text-xs text-red-500 dark:text-red-500">Click to view and retry</p>
            </div>
          </button>
        )}

        {!loading && total === 0 && (
          <p className="text-xs text-zinc-400 text-center py-4">No messages yet</p>
        )}
      </div>
    </div>
  )
}
