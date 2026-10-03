import { useSyncExternalStore } from 'react'

export type ExternalStore<T> = {
  getState: () => T
  setState: (updater: T | ((current: T) => T)) => void
  subscribe: (listener: () => void) => () => void
}

export function createStore<T>(initialState: T): ExternalStore<T> {
  let state = initialState
  const listeners = new Set<() => void>()

  return {
    getState: () => state,
    setState: (updater) => {
      const next = typeof updater === 'function'
        ? (updater as (current: T) => T)(state)
        : updater
      if (Object.is(next, state)) return
      state = next
      listeners.forEach((listener) => listener())
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export function useStore<T>(store: ExternalStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState)
}
