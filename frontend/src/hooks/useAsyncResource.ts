import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client'

export type AsyncResource<T> = {
  data: T | null
  loading: boolean
  error: ApiError | null
  reload: () => Promise<T | null>
}

function normalizeError(cause: unknown): ApiError {
  return cause instanceof ApiError
    ? cause
    : new ApiError(500, cause instanceof Error ? cause.message : 'Request failed', 'REQUEST_FAILED')
}

export function useAsyncResource<T>(loader: () => Promise<T>, enabled = true): AsyncResource<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<ApiError | null>(null)
  const requestSequence = useRef(0)

  const reload = useCallback(async () => {
    const sequence = ++requestSequence.current

    if (!enabled) {
      setData(null)
      setError(null)
      setLoading(false)
      return null
    }

    setLoading(true)
    setError(null)

    try {
      const next = await loader()
      if (requestSequence.current !== sequence) return null
      setData(next)
      return next
    } catch (cause) {
      if (requestSequence.current !== sequence) return null
      setError(normalizeError(cause))
      return null
    } finally {
      if (requestSequence.current === sequence) {
        setLoading(false)
      }
    }
  }, [enabled, loader])

  useEffect(() => {
    if (!enabled) return undefined

    const sequence = ++requestSequence.current
    let disposed = false

    void loader()
      .then((next) => {
        if (disposed || requestSequence.current !== sequence) return
        setData(next)
        setError(null)
        setLoading(false)
      })
      .catch((cause: unknown) => {
        if (disposed || requestSequence.current !== sequence) return
        setError(normalizeError(cause))
        setLoading(false)
      })

    return () => {
      disposed = true
      if (requestSequence.current === sequence) {
        requestSequence.current += 1
      }
    }
  }, [enabled, loader])

  return {
    data: enabled ? data : null,
    loading: enabled ? loading : false,
    error: enabled ? error : null,
    reload,
  }
}
