import { useEffect, useRef } from 'react'
import type { SSEEvent } from '../types'

export function useSSE(project: string | null, onEvent: (e: SSEEvent) => void) {
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  useEffect(() => {
    const qs = project ? `?project=${project}` : ''
    const es = new EventSource(`/api/events${qs}`)

    es.onmessage = (e) => {
      try {
        const parsed: SSEEvent = JSON.parse(e.data)
        onEventRef.current(parsed)
      } catch {}
    }

    es.onerror = () => {
      // EventSource auto-reconnects
    }

    return () => es.close()
  }, [project])
}
