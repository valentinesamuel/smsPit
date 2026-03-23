import { useState, useEffect, useRef } from 'react'
import { Play, ChevronRight, ChevronDown, Clock, Database } from 'lucide-react'
import { api } from '../lib/api'
import { Button } from '../components/Button'
import type { QueryResult, SchemaTable } from '../types'

const HISTORY_KEY = 'queryHistory'
const MAX_HISTORY = 10

function getHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
  } catch {
    return []
  }
}

function saveHistory(sql: string) {
  const history = getHistory().filter(q => q !== sql)
  history.unshift(sql)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)))
}

export function QueryRunner() {
  const [schema, setSchema] = useState<SchemaTable[]>([])
  const [schemaLoading, setSchemaLoading] = useState(true)
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set())
  const [sql, setSql] = useState('SELECT * FROM messages LIMIT 20')
  const [result, setResult] = useState<QueryResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [history, setHistory] = useState<string[]>(getHistory)
  const [showHistory, setShowHistory] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    api.getSchema()
      .then(res => setSchema(res.tables || []))
      .catch(() => {})
      .finally(() => setSchemaLoading(false))
  }, [])

  const runQuery = async () => {
    if (!sql.trim()) return
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      const res = await api.runQuery(sql)
      setResult(res)
      saveHistory(sql)
      setHistory(getHistory())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Query failed')
    } finally {
      setRunning(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      runQuery()
    }
  }

  const toggleTable = (name: string) => {
    setExpandedTables(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  return (
    <div className="flex h-full">
      {/* Left: Schema browser */}
      <div className="w-64 shrink-0 border-r border-zinc-200 dark:border-zinc-800 flex flex-col bg-white dark:bg-zinc-900">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
          <Database size={14} className="text-violet-500" />
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Schema</span>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {schemaLoading ? (
            <p className="text-xs text-zinc-400 px-2 py-3">Loading schema…</p>
          ) : schema.length === 0 ? (
            <p className="text-xs text-zinc-400 px-2 py-3">No tables found</p>
          ) : (
            schema.map(table => (
              <div key={table.name} className="mb-1">
                <button
                  className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors group"
                  onClick={() => toggleTable(table.name)}
                >
                  {expandedTables.has(table.name)
                    ? <ChevronDown size={12} className="text-zinc-400 shrink-0" />
                    : <ChevronRight size={12} className="text-zinc-400 shrink-0" />
                  }
                  <span className="text-xs font-mono font-medium text-zinc-700 dark:text-zinc-300 truncate">{table.name}</span>
                  <span className="text-xs text-zinc-400 ml-auto shrink-0">{table.columns.length}</span>
                </button>

                {expandedTables.has(table.name) && (
                  <div className="ml-4 mt-0.5 space-y-0.5">
                    {table.columns.map(col => (
                      <div key={col.name} className="flex items-center gap-2 px-2 py-1">
                        <span className="text-xs font-mono text-zinc-600 dark:text-zinc-400 truncate">{col.name}</span>
                        <span className="text-xs text-zinc-400 ml-auto shrink-0 uppercase">{col.type}</span>
                        {col.pk > 0 && <span className="text-xs text-violet-500">PK</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main: editor + results */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Editor area */}
        <div className="shrink-0 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-100 dark:border-zinc-800">
            <div className="relative flex-1">
              <button
                className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                onClick={() => setShowHistory(h => !h)}
              >
                <Clock size={12} />
                History ({history.length})
                <ChevronDown size={11} />
              </button>
              {showHistory && history.length > 0 && (
                <div className="absolute top-full mt-1 left-0 z-20 w-96 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg overflow-hidden">
                  {history.map((q, i) => (
                    <button
                      key={i}
                      className="w-full text-left px-3 py-2 text-xs font-mono text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 truncate border-b border-zinc-100 dark:border-zinc-800 last:border-0"
                      onClick={() => { setSql(q); setShowHistory(false) }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button size="sm" onClick={runQuery} disabled={running}>
              <Play size={12} />
              {running ? 'Running…' : 'Run'}
              <span className="text-xs opacity-60 ml-1">⌘↵</span>
            </Button>
          </div>

          <div className="p-4">
            <textarea
              ref={textareaRef}
              className="w-full h-32 font-mono text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none placeholder-zinc-400"
              value={sql}
              onChange={e => setSql(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="SELECT * FROM messages LIMIT 10"
              spellCheck={false}
            />
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-auto">
          {error && (
            <div className="m-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
              <p className="text-sm font-medium text-red-700 dark:text-red-400">Query error</p>
              <p className="text-xs text-red-600 dark:text-red-500 mt-1 font-mono">{error}</p>
            </div>
          )}

          {result && (
            <div className="flex flex-col h-full">
              <div className="flex items-center gap-4 px-4 py-2 border-b border-zinc-100 dark:border-zinc-800 text-xs text-zinc-500 shrink-0">
                <span>{result.count} row{result.count !== 1 ? 's' : ''}</span>
                <span>{result.duration_ms}ms</span>
                <span>{result.columns.length} column{result.columns.length !== 1 ? 's' : ''}</span>
              </div>

              {result.count === 0 ? (
                <div className="flex items-center justify-center h-32 text-sm text-zinc-400">No rows returned</div>
              ) : (
                <div className="overflow-auto flex-1">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 sticky top-0">
                        <th className="px-3 py-2 text-left text-zinc-400 font-medium w-10 shrink-0">#</th>
                        {result.columns.map(col => (
                          <th key={col} className="px-3 py-2 text-left text-zinc-600 dark:text-zinc-400 font-medium whitespace-nowrap font-mono">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {result.rows.map((row, i) => (
                        <tr key={i} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                          <td className="px-3 py-2 text-zinc-400">{i + 1}</td>
                          {row.map((cell, j) => (
                            <td key={j} className="px-3 py-2 font-mono text-zinc-700 dark:text-zinc-300 max-w-xs truncate">
                              {cell === null ? <span className="text-zinc-400 italic">NULL</span> : String(cell)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {!result && !error && !running && (
            <div className="flex items-center justify-center h-full text-sm text-zinc-400">
              Run a query to see results
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
