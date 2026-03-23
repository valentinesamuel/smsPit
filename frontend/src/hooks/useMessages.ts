import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import type { Message } from '../types'

export function useMessages(project: string | null, filters: {
  search?: string
  typeFilter?: string
  dateFrom?: string
  dateTo?: string
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.listMessages({
        project: project || undefined,
        search: filters.search || undefined,
        type: filters.typeFilter || undefined,
        date_from: filters.dateFrom || undefined,
        date_to: filters.dateTo || undefined,
        limit: 200,
      })
      setMessages(res.messages || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [project, filters.search, filters.typeFilter, filters.dateFrom, filters.dateTo])

  useEffect(() => {
    load()
  }, [load])

  const addMessage = useCallback((msg: Message) => {
    setMessages(prev => [msg, ...prev])
  }, [])

  const removeMessage = useCallback((id: string) => {
    setMessages(prev => prev.filter(m => m.id !== id))
  }, [])

  const markRead = useCallback((id: string) => {
    setMessages(prev => prev.map(m =>
      m.id === id ? { ...m, read_at: new Date().toISOString() } : m
    ))
  }, [])

  const refresh = load

  return { messages, loading, error, addMessage, removeMessage, markRead, refresh }
}
