import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { Search, Trash2, Download, Send, RefreshCw, Sprout, Copy, Check, ChevronDown, X, BookOpen } from 'lucide-react'
import { useMessages } from '../hooks/useMessages'
import { useSSE } from '../hooks/useSSE'
import { api } from '../lib/api'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { OTPDisplay } from '../components/OTPDisplay'
import { SendMessageModal } from '../components/SendMessageModal'
import { ConfirmModal } from '../components/ConfirmModal'
import { DateRangeFilter } from '../components/DateRangeFilter'
import { StorageWarning } from '../components/StorageWarning'
import { DashboardPanel } from '../components/DashboardPanel'
import type { Message, SSEEvent, Stats } from '../types'
import type { DateRange } from '../components/DateRangeFilter'

interface InboxProps {
  project: string | null
  onProjectChange: (p: string | null) => void
  projects: { name: string }[]
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export function Inbox({ project, onProjectChange: _onProjectChange, projects: _projects }: InboxProps) {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [dateRange, setDateRange] = useState<DateRange | null>(null)
  const [showSend, setShowSend] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Message | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState<number>(-1)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)
  const [bulkExportOpen, setBulkExportOpen] = useState(false)
  const bulkExportRef = useRef<HTMLDivElement>(null)

  // Bulk select state
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selectAllWarning, setSelectAllWarning] = useState<string | null>(null)

  const { messages, loading, addMessage, removeMessage, markRead, refresh } = useMessages(project, {
    search,
    typeFilter,
    dateFrom: dateRange?.dateFrom,
    dateTo: dateRange?.dateTo,
  })

  // Load stats for storage warning
  useEffect(() => {
    api.getStats(project || undefined).then(setStats).catch(() => {})
  }, [project, messages.length])

  const handleSSEEvent = useCallback((e: SSEEvent) => {
    if (e.type === 'message:new' && e.payload) {
      const msg = e.payload as Message
      if (!project || msg.project === project) {
        addMessage(msg)
        if (localStorage.getItem('soundEnabled') === 'true') {
          playSoundBeep()
        }
      }
    } else if (e.type === 'message:deleted' && e.payload) {
      const p = e.payload as { id?: string; ids?: string[]; all?: boolean }
      if (p.ids) p.ids.forEach(id => removeMessage(id))
      else if (p.id) removeMessage(p.id)
      else if (p.all) refresh()
    }
  }, [project, addMessage, removeMessage, refresh])

  useSSE(project, handleSSEEvent)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false)
      }
      if (bulkExportRef.current && !bulkExportRef.current.contains(e.target as Node)) {
        setBulkExportOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        if (e.key === 'Escape') (e.target as HTMLElement).blur()
        return
      }
      switch (e.key) {
        case 'j':
          setSelectedIdx(i => Math.min(i + 1, messages.length - 1))
          break
        case 'k':
          setSelectedIdx(i => Math.max(i - 1, 0))
          break
        case 'Enter':
          if (selectedIdx >= 0 && messages[selectedIdx]) {
            handleOpen(messages[selectedIdx])
          }
          break
        case 'd':
          if (selectedIdx >= 0 && messages[selectedIdx]) {
            setConfirmDelete(messages[selectedIdx])
          }
          break
        case '/':
          e.preventDefault()
          searchRef.current?.focus()
          break
        case 'r':
          refresh()
          break
        case 'Escape':
          setSelected(new Set())
          setSelectAllWarning(null)
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [messages, selectedIdx, refresh])

  const handleOpen = async (msg: Message) => {
    if (!msg.read_at) {
      api.markMessageRead(msg.id).catch(() => {})
      markRead(msg.id)
    }
    navigate(`/messages/${msg.id}`)
  }

  const handleDelete = async (msg: Message) => {
    await api.deleteMessage(msg.id)
    removeMessage(msg.id)
    setConfirmDelete(null)
  }

  const handleClearAll = async () => {
    await api.clearMessages(project || undefined)
    refresh()
    setConfirmClear(false)
  }

  const handleSeed = async () => {
    await api.seedMessages(project || undefined)
    refresh()
  }

  const handleCopyPhone = async (e: React.MouseEvent, phone: string, id: string) => {
    e.stopPropagation()
    await navigator.clipboard.writeText(phone)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSelectAll = async () => {
    setSelectAllWarning(null)
    try {
      const res = await api.getMessageIDs({
        project: project || undefined,
        search: search || undefined,
        type: typeFilter || undefined,
        date_from: dateRange?.dateFrom,
        date_to: dateRange?.dateTo,
      })
      setSelected(new Set(res.ids))
      if (res.total > 500) {
        setSelectAllWarning(`Showing 500 of ${res.total} matching messages`)
      }
    } catch {}
  }

  const handleBulkMarkRead = async () => {
    const ids = [...selected]
    const unreadCount = ids.filter(id => {
      const msg = messages.find(m => m.id === id)
      return msg && !msg.read_at
    }).length
    ids.forEach(id => markRead(id))
    if (unreadCount > 0) {
      window.dispatchEvent(new CustomEvent('unread:change', { detail: { delta: -unreadCount } }))
    }
    api.bulkMarkRead(ids).catch(() => {})
    setSelected(new Set())
  }

  const handleBulkExport = (format: 'csv' | 'json') => {
    const selectedMessages = messages.filter(m => selected.has(m.id))
    if (format === 'csv') {
      const rows = [
        ['id', 'project', 'to', 'from', 'message', 'type_tag', 'detected_otps', 'created_at', 'read_at'],
        ...selectedMessages.map(m => [
          m.id, m.project, m.to, m.from || '', m.message,
          m.type_tag || '', m.detected_otps || '',
          m.created_at, m.read_at || '',
        ]),
      ]
      const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
      downloadBlob(new Blob([csv], { type: 'text/csv' }), 'messages.csv')
    } else {
      const json = JSON.stringify(selectedMessages, null, 2)
      downloadBlob(new Blob([json], { type: 'application/json' }), 'messages.json')
    }
    setBulkExportOpen(false)
  }

  const handleBulkDelete = async () => {
    const ids = [...selected]
    await api.bulkDeleteMessages(ids)
    ids.forEach(id => removeMessage(id))
    setSelected(new Set())
    setConfirmBulkDelete(false)
  }

  return (
    <div className="flex h-full">
      {/* Left: message list (60%) */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-200 dark:border-zinc-700 flex-wrap shrink-0">
          <div className="relative flex-1 min-w-40">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              ref={searchRef}
              className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="Search… (/)"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <select
            className="text-sm rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-500"
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
          >
            <option value="">All types</option>
            <option value="otp">OTP</option>
            <option value="notification">Notification</option>
          </select>

          <DateRangeFilter value={dateRange} onChange={setDateRange} />

          <Button variant="ghost" size="sm" onClick={refresh} title="Refresh (r)"><RefreshCw size={13} /></Button>
          <Button variant="ghost" size="sm" onClick={handleSeed} title="Seed test messages"><Sprout size={13} /></Button>
          <div ref={exportRef} className="relative">
            <Button variant="ghost" size="sm" onClick={() => setExportOpen(o => !o)}>
              <Download size={13} />
              <span className="hidden sm:inline">Export</span>
              <ChevronDown size={11} />
            </Button>
            {exportOpen && (
              <div className="absolute top-full mt-1 right-0 z-30 w-36 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg py-1">
                <button
                  className="w-full text-left px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  onClick={() => {
                    api.exportMessages({ project: project || undefined, format: 'csv', search: search || undefined, type: typeFilter || undefined, date_from: dateRange?.dateFrom, date_to: dateRange?.dateTo })
                    setExportOpen(false)
                  }}
                >
                  CSV
                </button>
                <button
                  className="w-full text-left px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  onClick={() => {
                    api.exportMessages({ project: project || undefined, format: 'json', search: search || undefined, type: typeFilter || undefined, date_from: dateRange?.dateFrom, date_to: dateRange?.dateTo })
                    setExportOpen(false)
                  }}
                >
                  JSON
                </button>
              </div>
            )}
          </div>
          <Button variant="danger" size="sm" onClick={() => setConfirmClear(true)}>
            <Trash2 size={13} /> Clear
          </Button>
          <Button size="sm" onClick={() => setShowSend(true)}>
            <Send size={13} /> Send
          </Button>
        </div>

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-violet-50 dark:bg-violet-950/20 border-b border-violet-200 dark:border-violet-800 shrink-0 flex-wrap">
            <button
              className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 p-0.5"
              onClick={() => { setSelected(new Set()); setSelectAllWarning(null) }}
            >
              <X size={14} />
            </button>
            <span className="text-sm font-medium text-violet-700 dark:text-violet-300">{selected.size} selected</span>
            <button
              className="text-xs text-violet-600 dark:text-violet-400 hover:underline"
              onClick={handleSelectAll}
            >
              Select All
            </button>
            {selectAllWarning && (
              <span className="text-xs text-amber-600 dark:text-amber-400">{selectAllWarning}</span>
            )}
            <div className="flex-1" />
            <Button variant="ghost" size="sm" onClick={handleBulkMarkRead}>
              <BookOpen size={13} /> Mark Read
            </Button>
            <div ref={bulkExportRef} className="relative">
              <Button variant="ghost" size="sm" onClick={() => setBulkExportOpen(o => !o)}>
                <Download size={13} />
                Export
                <ChevronDown size={11} />
              </Button>
              {bulkExportOpen && (
                <div className="absolute top-full mt-1 right-0 z-30 w-36 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg py-1">
                  <button
                    className="w-full text-left px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    onClick={() => handleBulkExport('csv')}
                  >
                    CSV
                  </button>
                  <button
                    className="w-full text-left px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    onClick={() => handleBulkExport('json')}
                  >
                    JSON
                  </button>
                </div>
              )}
            </div>
            <Button variant="danger" size="sm" onClick={() => setConfirmBulkDelete(true)}>
              <Trash2 size={13} /> Delete
            </Button>
          </div>
        )}

        {/* Storage warning */}
        {stats && (
          <StorageWarning
            total={stats.total}
            max={stats.max_messages}
            project={project}
            onCleared={refresh}
          />
        )}

        {/* Message list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-zinc-400 text-sm">Loading…</div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-zinc-400">
              <p className="text-sm">No messages yet</p>
              <Button variant="secondary" size="sm" className="mt-3" onClick={() => setShowSend(true)}>
                Send a test message
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {messages.map((msg, idx) => {
                const otps = msg.detected_otps ? JSON.parse(msg.detected_otps) as string[] : []
                const isUnread = !msg.read_at
                const isKeySelected = idx === selectedIdx
                const isChecked = selected.has(msg.id)
                return (
                  <div
                    key={msg.id}
                    className={`relative flex items-start gap-3 px-4 py-4 cursor-pointer group transition-colors ${
                      isKeySelected
                        ? 'bg-violet-50 dark:bg-violet-950/20'
                        : isUnread
                        ? 'bg-violet-50/30 dark:bg-violet-950/10 hover:bg-violet-50/60 dark:hover:bg-violet-950/20'
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                    } ${isChecked ? 'bg-violet-50/60 dark:bg-violet-950/15' : ''}`}
                    onClick={() => { setSelectedIdx(idx); handleOpen(msg) }}
                  >
                    {/* Unread accent bar */}
                    {isUnread && (
                      <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-violet-500 rounded-r" />
                    )}

                    {/* Checkbox */}
                    <div className="flex items-center shrink-0 self-center" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className={`w-3.5 h-3.5 rounded accent-violet-600 cursor-pointer transition-opacity ${
                          isChecked ? 'opacity-100' : 'opacity-20 group-hover:opacity-60'
                        }`}
                        checked={isChecked}
                        onChange={() => toggleSelect(msg.id)}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-sm truncate ${isUnread ? 'font-semibold text-zinc-900 dark:text-zinc-100' : 'font-medium text-zinc-800 dark:text-zinc-200'}`}>
                          {msg.to}
                        </span>
                        {msg.from && <span className="text-xs text-zinc-400 truncate">from {msg.from}</span>}
                        {msg.type_tag && (
                          <Badge variant={msg.type_tag === 'otp' ? 'otp' : msg.type_tag === 'notification' ? 'notification' : 'default'}>
                            {msg.type_tag}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400 truncate">{msg.message}</p>
                      {otps.length > 0 && (
                        <div className="mt-1.5" onClick={e => e.stopPropagation()}>
                          <OTPDisplay otps={otps} />
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs text-zinc-400">
                        {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                      </span>
                      <button
                        className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-opacity p-0.5"
                        title="Copy phone number"
                        onClick={e => handleCopyPhone(e, msg.to, msg.id)}
                      >
                        {copiedId === msg.id ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                      </button>
                      <button
                        className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 transition-opacity p-0.5"
                        title="Delete (d)"
                        onClick={e => { e.stopPropagation(); setConfirmDelete(msg) }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>

      {/* Right: Dashboard panel (40%) */}
      <div className="w-150 shrink-0 hidden lg:flex flex-col">
        <DashboardPanel project={project} />
      </div>

      {/* Modals */}
      {showSend && (
        <SendMessageModal
          project={project}
          onClose={() => setShowSend(false)}
          onSent={refresh}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete message"
          message={`Delete message to ${confirmDelete.to}? "${confirmDelete.message.slice(0, 80)}${confirmDelete.message.length > 80 ? '…' : ''}"`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={() => handleDelete(confirmDelete)}
          onClose={() => setConfirmDelete(null)}
        />
      )}

      {confirmClear && (
        <ConfirmModal
          title="Clear all messages"
          message={`This will permanently delete all ${messages.length} message${messages.length !== 1 ? 's' : ''}${project ? ` in project "${project}"` : ''}. This cannot be undone.`}
          confirmLabel="Clear All"
          variant="danger"
          onConfirm={handleClearAll}
          onClose={() => setConfirmClear(false)}
        />
      )}

      {confirmBulkDelete && (
        <ConfirmModal
          title="Delete selected messages"
          message={`Delete ${selected.size} selected message${selected.size !== 1 ? 's' : ''}? This cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={handleBulkDelete}
          onClose={() => setConfirmBulkDelete(false)}
        />
      )}
    </div>
  )
}

function playSoundBeep() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.2)
  } catch {}
}
