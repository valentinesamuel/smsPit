import type { Message, Project, Stats, WebhookDeadLetter, QueryResult, SchemaTable } from '../types'

const BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, options)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || res.statusText)
  }
  return res.json()
}

export const api = {
  // Messages
  sendMessage: (data: {
    to: string
    from?: string
    message: string
    metadata?: Record<string, unknown>
    project?: string
  }) =>
    request<{ id: string; status: string; created_at: string; message: Message }>('/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  bulkMarkRead: (ids: string[]) =>
    request<{ updated: number }>('/messages/bulk-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    }),
  bulkDeleteMessages: (ids: string[]) =>
    request<{ deleted: number }>('/messages/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    }),
  getMessageIDs: (params?: {
    project?: string
    search?: string
    type?: string
    unread?: string
    date_from?: string
    date_to?: string
  }) => {
    const qs = new URLSearchParams()
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== '') qs.set(k, String(v))
      })
    }
    return request<{ ids: string[]; total: number }>(`/messages/ids?${qs}`)
  },

  listMessages: (params?: {
    project?: string
    phoneNumber?: string
    sender?: string
    search?: string
    'metadata[type]'?: string
    otp?: string
    type?: string
    unread?: string
    date_from?: string
    date_to?: string
    limit?: number
    offset?: number
  }) => {
    const qs = new URLSearchParams()
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== '') qs.set(k, String(v))
      })
    }
    return request<{ messages: Message[]; count: number }>(`/messages?${qs}`)
  },

  getMessage: (id: string) => request<Message>(`/messages/${id}`),

  markMessageRead: (id: string) =>
    request<{ status: string }>(`/messages/${id}/read`, { method: 'PATCH' }),

  deleteMessage: (id: string) =>
    request<{ status: string }>(`/messages/${id}`, { method: 'DELETE' }),

  clearMessages: (project?: string) => {
    const qs = project ? `?project=${project}` : ''
    return request<{ status: string }>(`/messages${qs}`, { method: 'DELETE' })
  },

  exportMessages: (params?: {
    project?: string
    format?: 'json' | 'csv'
    search?: string
    type?: string
    date_from?: string
    date_to?: string
  }) => {
    const qs = new URLSearchParams()
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== '') qs.set(k, String(v))
      })
    }
    window.open(`${BASE}/messages/export?${qs}`, '_blank')
  },

  // Projects
  listProjects: () => request<{ projects: Project[] }>('/projects'),
  createProject: (data: { name: string; webhook_url?: string }) =>
    request<Project>('/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  getProject: (name: string) => request<Project>(`/projects/${name}`),
  updateProject: (name: string, data: { webhook_url?: string }) =>
    request<Project>(`/projects/${name}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  deleteProject: (name: string) =>
    request<{ status: string }>(`/projects/${name}`, { method: 'DELETE' }),

  // Stats
  getStats: (project?: string) => {
    const qs = project ? `?project=${project}` : ''
    return request<Stats>(`/stats${qs}`)
  },

  // Dead letters
  listDeadLetters: (params?: {
    project?: string
    search?: string
    date_from?: string
    date_to?: string
  }) => {
    const qs = new URLSearchParams()
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== '') qs.set(k, String(v))
      })
    }
    return request<{ dead_letters: WebhookDeadLetter[] }>(`/webhooks/dead-letters?${qs}`)
  },
  retryDeadLetter: (id: string) =>
    request<{ status: string }>(`/webhooks/dead-letters/${id}/retry`, { method: 'POST' }),
  bulkRetryDeadLetters: (ids: string[]) =>
    request<{ results: { id: string; success: boolean; error?: string }[] }>(
      '/webhooks/dead-letters/bulk-retry',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      }
    ),
  bulkDeleteDeadLetters: (ids: string[]) =>
    request<{ deleted: number }>('/webhooks/dead-letters/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    }),
  getDeadLetterIDs: (params?: {
    project?: string
    search?: string
    date_from?: string
    date_to?: string
  }) => {
    const qs = new URLSearchParams()
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== '') qs.set(k, String(v))
      })
    }
    return request<{ ids: string[]; total: number }>(`/webhooks/dead-letters/ids?${qs}`)
  },

  // Query runner
  runQuery: (sql: string) =>
    request<QueryResult>('/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql }),
    }),
  getSchema: () => request<{ tables: SchemaTable[] }>('/query/schema'),

  // Testing
  seedMessages: (project?: string) => {
    const qs = project ? `?project=${project}` : ''
    return request<{ seeded: string[]; count: number }>(`/testing/seed${qs}`, { method: 'POST' })
  },
}
