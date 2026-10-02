import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../api/client'

export type AsyncResource<T> = {
  data: T | null
  loading: boolean
  error: ApiError | null
  reload: () => Promise<T | null>
}

export function useAsyncResource<T>(loader: () => Promise<T>, enabled = true): AsyncResource<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<ApiError | null>(null)

  const reload = useCallback(async () => {
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
      setData(next)
      return next
    } catch (cause) {
      const normalized = cause instanceof ApiError
        ? cause
        : new ApiError(500, cause instanceof Error ? cause.message : 'Request failed', 'REQUEST_FAILED')
      setError(normalized)
      return null
    } finally {
      setLoading(false)
    }
  }, [enabled, loader])

  useEffect(() => {
    let disposed = false

    if (!enabled) {
      setData(null)
      setError(null)
      setLoading(false)
      return () => {
        disposed = true
      }
    }

    setLoading(true)
    setError(null)

    void loader()
      .then((next) => {
        if (!disposed) {
          setData(next)
          setLoading(false)
        }
      })
      .catch((cause: unknown) => {
        if (!disposed) {
          const normalized = cause instanceof ApiError
            ? cause
            : new ApiError(500, cause instanceof Error ? cause.message : 'Request failed', 'REQUEST_FAILED')
          setError(normalized)
          setLoading(false)
        }
      })

    return () => {
      disposed = true
    }
  }, [enabled, loader])

  return { data, loading, error, reload }
}
