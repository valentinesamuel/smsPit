import { useState, useEffect, useCallback, useRef } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Search, RotateCcw, CheckSquare, Square, CheckCheck, RefreshCw, X, Copy, Check, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { Button } from '../components/Button'
import { ConfirmModal } from '../components/ConfirmModal'
import { DateRangeFilter } from '../components/DateRangeFilter'
import { useSSE } from '../hooks/useSSE'
import type { WebhookDeadLetter, SSEEvent } from '../types'
import type { DateRange } from '../components/DateRangeFilter'

interface DeadLettersProps {
  project: string | null
}

export function DeadLetters({ project }: DeadLettersProps) {
  const [letters, setLetters] = useState<WebhookDeadLetter[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dateRange, setDateRange] = useState<DateRange | null>(null)
  const [bulkMode, setBulkMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [retrying, setRetrying] = useState<Set<string>>(new Set())
  const [inlineErrors, setInlineErrors] = useState<Record<string, string>>({})
  const [selectedDL, setSelectedDL] = useState<WebhookDeadLetter | null>(null)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [selectAllWarning, setSelectAllWarning] = useState<string | null>(null)
  const drawerRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.listDeadLetters({
        project: project || undefined,
        search: search || undefined,
        date_from: dateRange?.dateFrom,
        date_to: dateRange?.dateTo,
      })
      setLetters(res.dead_letters || [])
    } finally {
      setLoading(false)
    }
  }, [project, search, dateRange])

  useEffect(() => { load() }, [load])

  // ESC to close drawer
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedDL(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleSSEEvent = useCallback((e: SSEEvent) => {
    if (e.type === 'deadletter:new' && e.payload) {
      const dl = e.payload as WebhookDeadLetter
      setLetters(prev => [dl, ...prev])
    } else if (e.type === 'deadletter:resolved' && e.payload) {
      const p = e.payload as { id: string }
      setLetters(prev => prev.filter(l => l.id !== p.id))
      setSelectedDL(prev => (prev?.id === p.id ? null : prev))
    }
  }, [])

  useSSE(project, handleSSEEvent)

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selected.size === letters.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(letters.map(l => l.id)))
    }
  }

  const handleSelectAllMatching = async () => {
    setSelectAllWarning(null)
    try {
      const res = await api.getDeadLetterIDs({
        project: project || undefined,
        search: search || undefined,
        date_from: dateRange?.dateFrom,
        date_to: dateRange?.dateTo,
      })
      setSelected(new Set(res.ids))
      if (res.total > 500) {
        setSelectAllWarning(`Showing 500 of ${res.total} matching`)
      }
    } catch {}
  }

  const handleRetry = async (id: string) => {
    setRetrying(prev => new Set([...prev, id]))
    try {
      await api.retryDeadLetter(id)
      setLetters(prev => prev.filter(l => l.id !== id))
      setInlineErrors(prev => { const n = { ...prev }; delete n[id]; return n })
      if (selectedDL?.id === id) setSelectedDL(null)
    } catch (e) {
      setInlineErrors(prev => ({ ...prev, [id]: e instanceof Error ? e.message : 'Retry failed' }))
    } finally {
      setRetrying(prev => { const n = new Set(prev); n.delete(id); return n })
    }
  }

  const handleBulkRetry = async (ids: string[]) => {
    if (ids.length === 0) return
    setRetrying(new Set(ids))
    try {
      const res = await api.bulkRetryDeadLetters(ids)
      const succeeded = new Set(res.results.filter(r => r.success).map(r => r.id))
      const errors: Record<string, string> = {}
      res.results.filter(r => !r.success).forEach(r => {
        if (r.error) errors[r.id] = r.error
      })
      setLetters(prev => prev.filter(l => !succeeded.has(l.id)))
      setInlineErrors(prev => ({ ...prev, ...errors }))
      setSelected(new Set())
      if (selectedDL && succeeded.has(selectedDL.id)) setSelectedDL(null)
    } finally {
      setRetrying(new Set())
    }
  }

  const handleBulkDelete = async () => {
    const ids = [...selected]
    const count = ids.length
    setLetters(prev => prev.filter(l => !ids.includes(l.id)))
    if (selectedDL && ids.includes(selectedDL.id)) setSelectedDL(null)
    setSelected(new Set())
    setConfirmBulkDelete(false)
    window.dispatchEvent(new CustomEvent('deadletter:change', { detail: { delta: -count } }))
    await api.bulkDeleteDeadLetters(ids).catch(() => {})
  }

  const handleCopy = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 1500)
  }

  const allSelected = letters.length > 0 && selected.size === letters.length

  return (
    <div className="flex h-full">
      {/* Left: list */}
      <div className={`flex flex-col ${selectedDL ? 'flex-1 min-w-0' : 'w-full'} h-full`}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-700 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Dead Letters</h1>
            <Button variant="ghost" size="sm" onClick={load}>
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </Button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-40">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                placeholder="Search URL, error, message ID…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <DateRangeFilter value={dateRange} onChange={setDateRange} />

            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setBulkMode(b => !b); setSelected(new Set()); setSelectAllWarning(null) }}
            >
              {bulkMode ? <CheckSquare size={13} /> : <Square size={13} />}
              {bulkMode ? 'Cancel' : 'Select'}
            </Button>

            {bulkMode && (
              <Button variant="ghost" size="sm" onClick={handleSelectAllMatching}>
                Select All
              </Button>
            )}

            {bulkMode && selected.size > 0 && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleBulkRetry([...selected])}
                >
                  <RotateCcw size={13} />
                  Retry ({selected.size})
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setConfirmBulkDelete(true)}
                >
                  <Trash2 size={13} />
                  Delete ({selected.size})
                </Button>
              </>
            )}

            {letters.length > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleBulkRetry(letters.map(l => l.id))}
              >
                <CheckCheck size={13} />
                Retry All
              </Button>
            )}
          </div>

          {selectAllWarning && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{selectAllWarning}</p>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-zinc-400 text-sm">Loading…</div>
          ) : letters.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-zinc-400 space-y-2">
              <p className="text-2xl">✓</p>
              <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">No dead letters</p>
              <p className="text-xs">All webhooks are delivering successfully</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {bulkMode && (
                <div className="flex items-center gap-3 px-4 py-2 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
                  <button onClick={toggleSelectAll} className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
                    {allSelected ? <CheckSquare size={15} className="text-violet-600" /> : <Square size={15} />}
                  </button>
                  <span className="text-xs text-zinc-500">{selected.size} of {letters.length} selected</span>
                </div>
              )}

              {letters.map(dl => {
                const isRetrying = retrying.has(dl.id)
                const inlineError = inlineErrors[dl.id]
                const isActive = selectedDL?.id === dl.id
                return (
                  <div
                    key={dl.id}
                    className={`flex items-start gap-3 px-4 py-4 transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-violet-50 dark:bg-violet-950/20'
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/30'
                    } ${isRetrying ? 'opacity-60' : ''}`}
                    onClick={() => setSelectedDL(prev => prev?.id === dl.id ? null : dl)}
                  >
                    {bulkMode && (
                      <button
                        className="mt-0.5 shrink-0 text-zinc-400 hover:text-violet-600"
                        onClick={e => { e.stopPropagation(); toggleSelect(dl.id) }}
                      >
                        {selected.has(dl.id) ? <CheckSquare size={15} className="text-violet-600" /> : <Square size={15} />}
                      </button>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate font-mono">{dl.webhook_url}</p>
                          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                            <span className="text-xs text-red-600 dark:text-red-400">
                              {dl.error || 'Unknown error'}
                            </span>
                            <span className="text-xs text-zinc-400">
                              {dl.attempts} attempt{dl.attempts !== 1 ? 's' : ''}
                            </span>
                            {dl.last_attempt_at && (
                              <span className="text-xs text-zinc-400">
                                last {formatDistanceToNow(new Date(dl.last_attempt_at), { addSuffix: true })}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-400 mt-0.5 font-mono">msg: {dl.message_id}</p>
                          {inlineError && (
                            <p className="text-xs text-red-500 mt-1">{inlineError}</p>
                          )}
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={e => { e.stopPropagation(); handleRetry(dl.id) }}
                          disabled={isRetrying}
                          className="shrink-0"
                        >
                          <RotateCcw size={12} className={isRetrying ? 'animate-spin' : ''} />
                          {isRetrying ? 'Retrying…' : 'Retry'}
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right: Detail drawer */}
      {selectedDL && (
        <div
          ref={drawerRef}
          className="w-150 shrink-0 border-l border-zinc-200 dark:border-zinc-700 flex flex-col bg-white dark:bg-zinc-900"
        >
          {/* Drawer header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Dead Letter Detail</span>
            <button
              onClick={() => setSelectedDL(null)}
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              <X size={15} />
            </button>
          </div>

          {/* Drawer content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Webhook URL */}
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">Webhook URL</p>
              <div className="flex items-start gap-2">
                <p className="text-xs font-mono text-zinc-800 dark:text-zinc-200 break-all flex-1">{selectedDL.webhook_url}</p>
                <button
                  className="shrink-0 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 mt-0.5"
                  onClick={() => handleCopy(selectedDL.webhook_url, 'url')}
                >
                  {copiedField === 'url' ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                </button>
              </div>
            </div>

            {/* Error */}
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">Error</p>
              <p className="text-xs text-red-600 dark:text-red-400 break-words">{selectedDL.error || 'Unknown error'}</p>
            </div>

            {/* Attempts */}
            <div className="flex gap-6">
              <div>
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">Attempts</p>
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{selectedDL.attempts}</p>
              </div>
              {selectedDL.last_attempt_at && (
                <div>
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">Last Attempt</p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {formatDistanceToNow(new Date(selectedDL.last_attempt_at), { addSuffix: true })}
                  </p>
                </div>
              )}
            </div>

            {/* Created at */}
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">Created</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {formatDistanceToNow(new Date(selectedDL.created_at), { addSuffix: true })}
              </p>
            </div>

            {/* Payload */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Payload</p>
                <button
                  className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                  onClick={() => handleCopy(selectedDL.payload, 'payload')}
                >
                  {copiedField === 'payload' ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                </button>
              </div>
              <pre className="text-xs text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-800 rounded-lg p-3 overflow-auto max-h-64 border border-zinc-200 dark:border-zinc-700 font-mono">
                {(() => {
                  try { return JSON.stringify(JSON.parse(selectedDL.payload), null, 2) }
                  catch { return selectedDL.payload }
                })()}
              </pre>
            </div>

            {/* Retry button */}
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => handleRetry(selectedDL.id)}
              disabled={retrying.has(selectedDL.id)}
            >
              <RotateCcw size={13} className={retrying.has(selectedDL.id) ? 'animate-spin' : ''} />
              {retrying.has(selectedDL.id) ? 'Retrying…' : 'Retry Webhook'}
            </Button>

            {inlineErrors[selectedDL.id] && (
              <p className="text-xs text-red-500">{inlineErrors[selectedDL.id]}</p>
            )}
          </div>
        </div>
      )}

      {confirmBulkDelete && (
        <ConfirmModal
          title="Discard dead letters"
          message={`Discard ${selected.size} dead letter${selected.size !== 1 ? 's' : ''}? This cannot be undone.`}
          confirmLabel="Discard"
          variant="danger"
          onConfirm={handleBulkDelete}
          onClose={() => setConfirmBulkDelete(false)}
        />
      )}
    </div>
  )
}
