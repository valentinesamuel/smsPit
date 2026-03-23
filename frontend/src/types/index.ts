export interface Message {
  id: string
  project: string
  to: string
  from?: string
  message: string
  metadata?: string
  type_tag?: string
  detected_otps?: string
  deleted_at?: string
  read_at?: string
  created_at: string
}

export interface Project {
  id: string
  name: string
  webhook_url?: string
  created_at: string
}

export interface Stats {
  total: number
  otp_count: number
  notification_count: number
  unread_count: number
  per_number: { to: string; count: number }[]
  dead_letter_count: number
  max_messages: number
}

export interface WebhookDeadLetter {
  id: string
  message_id: string
  project: string
  webhook_url: string
  payload: string
  error?: string
  attempts: number
  last_attempt_at?: string
  created_at: string
}

export interface SSEEvent {
  type: 'connected' | 'message:new' | 'message:deleted' | 'message:read' | 'deadletter:new' | 'deadletter:resolved'
  payload?: unknown
}

export interface QueryResult {
  columns: string[]
  rows: (string | number | null)[][]
  count: number
  duration_ms: number
}

export interface SchemaColumn {
  cid: number
  name: string
  type: string
  notnull: number
  dflt_value: string | null
  pk: number
}

export interface SchemaTable {
  name: string
  columns: SchemaColumn[]
  sample: (string | number | null)[][]
}
