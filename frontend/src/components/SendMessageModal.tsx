import { useState } from 'react'
import { X } from 'lucide-react'
import { api } from '../lib/api'
import { Button } from './Button'
import { Input } from './Input'

interface SendMessageModalProps {
  project: string | null
  onClose: () => void
  onSent: () => void
}

export function SendMessageModal({ project, onClose, onSent }: SendMessageModalProps) {
  const [form, setForm] = useState({
    to: '',
    from: '',
    message: '',
    metadataType: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await api.sendMessage({
        to: form.to,
        from: form.from || undefined,
        message: form.message,
        metadata: form.metadataType ? { type: form.metadataType } : undefined,
        project: project || undefined,
      })
      onSent()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl p-6 w-full max-w-md mx-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Send Test Message</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Input
            label="To (phone number)"
            id="to"
            placeholder="+2348012345678"
            value={form.to}
            onChange={e => setForm(p => ({ ...p, to: e.target.value }))}
            required
          />
          <Input
            label="From (optional)"
            id="from"
            placeholder="MyApp"
            value={form.from}
            onChange={e => setForm(p => ({ ...p, from: e.target.value }))}
          />
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Message</label>
            <textarea
              className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:bg-zinc-800 dark:border-zinc-600 dark:text-zinc-100"
              rows={3}
              placeholder="Your OTP is 123456"
              value={form.message}
              onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Type (optional)</label>
            <select
              className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-500 dark:bg-zinc-800 dark:border-zinc-600 dark:text-zinc-100"
              value={form.metadataType}
              onChange={e => setForm(p => ({ ...p, metadataType: e.target.value }))}
            >
              <option value="">Auto-detect</option>
              <option value="otp">OTP</option>
              <option value="notification">Notification</option>
            </select>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Sending\u2026' : 'Send Message'}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
