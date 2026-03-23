import { useState, useRef, useEffect } from 'react'
import { Calendar, ChevronDown, X } from 'lucide-react'

export interface DateRange {
  dateFrom: string
  dateTo: string
  label: string
}

interface DateRangeFilterProps {
  value: DateRange | null
  onChange: (range: DateRange | null) => void
}

const PRESETS = [
  { label: 'Last 5 min', minutes: 5 },
  { label: 'Last 1 hour', minutes: 60 },
  { label: 'Last 2 hours', minutes: 120 },
  { label: 'Last 24 hours', minutes: 1440 },
  { label: 'Last 7 days', minutes: 10080 },
]

export function DateRangeFilter({ value, onChange }: DateRangeFilterProps) {
  const [open, setOpen] = useState(false)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const applyPreset = (minutes: number, label: string) => {
    const now = new Date()
    const from = new Date(now.getTime() - minutes * 60 * 1000)
    onChange({
      dateFrom: from.toISOString(),
      dateTo: now.toISOString(),
      label,
    })
    setOpen(false)
  }

  const applyCustom = () => {
    if (!customFrom && !customTo) return
    const from = customFrom ? new Date(customFrom).toISOString() : ''
    const to = customTo ? new Date(customTo).toISOString() : new Date().toISOString()
    const fmt = (s: string) => s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '...'
    onChange({
      dateFrom: from,
      dateTo: to,
      label: `${fmt(customFrom)} → ${fmt(customTo)}`,
    })
    setOpen(false)
  }

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(null)
    setCustomFrom('')
    setCustomTo('')
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
      >
        <Calendar size={14} className="text-zinc-400" />
        <span className="max-w-36 truncate">{value ? value.label : 'Date range'}</span>
        {value ? (
          <X size={12} className="text-zinc-400 hover:text-zinc-600 ml-1" onClick={clear} />
        ) : (
          <ChevronDown size={12} className="text-zinc-400" />
        )}
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-30 w-72 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg p-3 space-y-3">
          <div>
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">Presets</p>
            <div className="grid grid-cols-1 gap-1">
              {PRESETS.map(p => (
                <button
                  key={p.label}
                  onClick={() => applyPreset(p.minutes, p.label)}
                  className="text-left text-sm px-3 py-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3">
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">Custom range</p>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-zinc-500 block mb-1">From</label>
                <input
                  type="datetime-local"
                  value={customFrom}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="w-full text-xs rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">To</label>
                <input
                  type="datetime-local"
                  value={customTo}
                  onChange={e => setCustomTo(e.target.value)}
                  className="w-full text-xs rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <button
                onClick={applyCustom}
                className="w-full text-sm bg-violet-600 hover:bg-violet-700 text-white rounded-md py-1.5 transition-colors"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
