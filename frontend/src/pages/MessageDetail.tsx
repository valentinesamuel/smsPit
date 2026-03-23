import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { api } from '../lib/api'
import { OTPDisplay } from '../components/OTPDisplay'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import type { Message } from '../types'

export function MessageDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [message, setMessage] = useState<Message | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    api.getMessage(id)
      .then(setMessage)
      .catch(() => navigate('/'))
      .finally(() => setLoading(false))
  }, [id, navigate])

  const handleDelete = async () => {
    if (!id || !confirm('Delete this message?')) return
    await api.deleteMessage(id)
    navigate('/')
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-zinc-400 text-sm">Loading\u2026</div>
  }
  if (!message) return null

  const otps = message.detected_otps ? JSON.parse(message.detected_otps) as string[] : []
  const metadata = message.metadata ? JSON.parse(message.metadata) as Record<string, unknown> : null

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Message Detail</h1>
      </div>

      <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
        <div className="p-6 space-y-4">
          {/* Header row */}
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{message.to}</span>
                {message.type_tag && (
                  <Badge variant={message.type_tag === 'otp' ? 'otp' : message.type_tag === 'notification' ? 'notification' : 'default'}>
                    {message.type_tag}
                  </Badge>
                )}
              </div>
              {message.from && <p className="text-sm text-zinc-500 mt-0.5">From: {message.from}</p>}
              <p className="text-xs text-zinc-400 mt-1">
                {format(new Date(message.created_at), 'PPpp')}
              </p>
            </div>
            <Button variant="danger" size="sm" onClick={handleDelete}>
              <Trash2 size={14} /> Delete
            </Button>
          </div>

          {/* Message body */}
          <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-4">
            <p className="text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap">{message.message}</p>
          </div>

          {/* OTPs */}
          {otps.length > 0 && (
            <div>
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">Detected OTPs</p>
              <OTPDisplay otps={otps} />
            </div>
          )}

          {/* Metadata */}
          {metadata && (
            <div>
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">Metadata</p>
              <pre className="text-xs bg-zinc-50 dark:bg-zinc-900 rounded-lg p-3 overflow-auto text-zinc-700 dark:text-zinc-300">
                {JSON.stringify(metadata, null, 2)}
              </pre>
            </div>
          )}

          {/* IDs */}
          <div className="text-xs text-zinc-400 space-y-1 border-t border-zinc-100 dark:border-zinc-700 pt-3">
            <p>ID: {message.id}</p>
            <p>Project: {message.project}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
