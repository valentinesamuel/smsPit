import { useState, useEffect } from 'react'
import { RefreshCw, RotateCcw, AlertTriangle } from 'lucide-react'
import { api } from '../lib/api'
import { Button } from '../components/Button'
import type { Stats, WebhookDeadLetter } from '../types'

interface DashboardProps {
  project: string | null
}

export function Dashboard({ project }: DashboardProps) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [deadLetters, setDeadLetters] = useState<WebhookDeadLetter[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const [s, dl] = await Promise.all([
      api.getStats(project || undefined),
      api.listDeadLetters({ project: project || undefined }),
    ])
    setStats(s)
    setDeadLetters(dl.dead_letters || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [project])

  const handleRetry = async (id: string) => {
    await api.retryDeadLetter(id)
    load()
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-zinc-400 text-sm">Loading\u2026</div>

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Dashboard</h1>
        <Button variant="ghost" size="sm" onClick={load}><RefreshCw size={14} /></Button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Messages', value: stats?.total ?? 0, color: 'text-zinc-900 dark:text-zinc-100' },
          { label: 'OTP Messages', value: stats?.otp_count ?? 0, color: 'text-violet-700 dark:text-violet-300' },
          { label: 'Phone Numbers', value: stats?.per_number?.length ?? 0, color: 'text-blue-700 dark:text-blue-300' },
          { label: 'Dead Letters', value: stats?.dead_letter_count ?? 0, color: deadLetters.length > 0 ? 'text-red-600' : 'text-zinc-900 dark:text-zinc-100' },
        ].map(card => (
          <div key={card.label} className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">{card.label}</p>
            <p className={`text-3xl font-bold mt-1 ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Per-number breakdown */}
      {(stats?.per_number?.length ?? 0) > 0 && (
        <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700">
          <div className="p-4 border-b border-zinc-100 dark:border-zinc-700">
            <h2 className="font-medium text-sm text-zinc-900 dark:text-zinc-100">Messages per Phone Number</h2>
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-700">
            {stats!.per_number.map(row => (
              <div key={row.to} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm font-mono text-zinc-700 dark:text-zinc-300">{row.to}</span>
                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{row.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dead letters */}
      {deadLetters.length > 0 && (
        <div className="bg-white dark:bg-zinc-800 rounded-xl border border-red-200 dark:border-red-900">
          <div className="p-4 border-b border-red-100 dark:border-red-900 flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-500" />
            <h2 className="font-medium text-sm text-zinc-900 dark:text-zinc-100">Webhook Dead Letters</h2>
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-700">
            {deadLetters.map(dl => (
              <div key={dl.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{dl.webhook_url}</p>
                    {dl.error && <p className="text-xs text-red-600 mt-0.5">{dl.error}</p>}
                    <p className="text-xs text-zinc-400 mt-0.5">Attempts: {dl.attempts} &middot; Message: {dl.message_id}</p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => handleRetry(dl.id)}>
                    <RotateCcw size={12} /> Retry
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {deadLetters.length === 0 && (stats?.total ?? 0) === 0 && (
        <div className="text-center py-12 text-zinc-400">
          <p className="text-sm">No data yet. Send some messages to get started.</p>
        </div>
      )}
    </div>
  )
}
