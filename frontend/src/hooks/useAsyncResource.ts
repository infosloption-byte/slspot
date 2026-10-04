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

type Snapshot<T> = { key: string; data: T | null; error: ApiError | null }

/**
 * Loads a resource and keeps it fresh across reloads.
 *
 * `resetKey` identifies what the data belongs to (for example the wallet mode). While the key
 * differs from the one the data was loaded for, `data` and `error` read as empty and `loading` is
 * true, so the previous key's data is never shown under the new one. Without a key, data from
 * the previous loader stays on screen during a reload (pagination, filters).
 */
export function useAsyncResource<T>(loader: () => Promise<T>, enabled = true, resetKey = ''): AsyncResource<T> {
  const [snapshot, setSnapshot] = useState<Snapshot<T>>({ key: resetKey, data: null, error: null })
  const [loading, setLoading] = useState(enabled)
  const requestSequence = useRef(0)
  const hasDataRef = useRef(false)
  const keyRef = useRef(resetKey)

  // Data that belongs to a different key is treated as absent (derived during render, no effect needed).
  const current = snapshot.key === resetKey ? snapshot : { key: resetKey, data: null, error: null }

  useEffect(() => {
    keyRef.current = resetKey
    hasDataRef.current = current.data !== null
  }, [current.data, resetKey])

  const reload = useCallback(async () => {
    const sequence = ++requestSequence.current
    const key = resetKey

    if (!enabled) {
      setSnapshot({ key, data: null, error: null })
      setLoading(false)
      return null
    }

    // A refresh while data is already on screen is a background refresh: keep showing the
    // data and do not flip `loading`, otherwise every poll/event makes tables and panels flicker.
    // Only a first load, or a retry with nothing to show, uses the loading state.
    if (!hasDataRef.current || keyRef.current !== key) {
      setLoading(true)
      setSnapshot((previous) => (previous.key === key ? { ...previous, error: null } : { key, data: null, error: null }))
    }

    try {
      const next = await loader()
      if (requestSequence.current !== sequence) return null
      setSnapshot({ key, data: next, error: null })
      return next
    } catch (cause) {
      if (requestSequence.current !== sequence) return null
      const error = normalizeError(cause)
      setSnapshot((previous) => ({ key, data: previous.key === key ? previous.data : null, error }))
      return null
    } finally {
      if (requestSequence.current === sequence) {
        setLoading(false)
      }
    }
  }, [enabled, loader, resetKey])

  useEffect(() => {
    if (!enabled) return undefined

    const sequence = ++requestSequence.current
    const key = resetKey
    let disposed = false

    void loader()
      .then((next) => {
        if (disposed || requestSequence.current !== sequence) return
        setSnapshot({ key, data: next, error: null })
        setLoading(false)
      })
      .catch((cause: unknown) => {
        if (disposed || requestSequence.current !== sequence) return
        const error = normalizeError(cause)
        setSnapshot((previous) => ({ key, data: previous.key === key ? previous.data : null, error }))
        setLoading(false)
      })

    return () => {
      disposed = true
      if (requestSequence.current === sequence) {
        requestSequence.current += 1
      }
    }
  }, [enabled, loader, resetKey])

  const keyChanged = snapshot.key !== resetKey

  return {
    data: enabled ? current.data : null,
    loading: enabled ? loading || keyChanged : false,
    error: enabled ? current.error : null,
    reload,
  }
}
