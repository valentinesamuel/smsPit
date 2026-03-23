import { useState } from 'react'
import { AlertTriangle, X, Download, Trash2 } from 'lucide-react'
import { api } from '../lib/api'

interface StorageWarningProps {
  total: number
  max: number
  project: string | null
  onCleared: () => void
}

export function StorageWarning({ total, max, project, onCleared }: StorageWarningProps) {
  const [dismissed, setDismissed] = useState(false)

  if (max <= 0 || dismissed) return null

  const pct = Math.round((total / max) * 100)
  if (pct < 85) return null

  const handleExport = () => {
    api.exportMessages({ project: project || undefined, format: 'json' })
  }

  const handleClear = async () => {
    await api.clearMessages(project || undefined)
    onCleared()
  }

  return (
    <div className="mx-4 mt-3 p-3 rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30 flex items-start gap-3">
      <AlertTriangle size={16} className="text-orange-500 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-orange-800 dark:text-orange-300">
          {pct}% of storage used ({total}/{max} messages)
        </p>
        <p className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">
          Export or delete old messages to free space.
        </p>
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-900 transition-colors"
          >
            <Download size={11} /> Export All
          </button>
          <button
            onClick={handleClear}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
          >
            <Trash2 size={11} /> Clear Messages
          </button>
        </div>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="text-orange-400 hover:text-orange-600 shrink-0"
      >
        <X size={14} />
      </button>
    </div>
  )
}
