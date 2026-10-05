import { useSyncExternalStore } from 'react'

/** Tracks a CSS media query, e.g. `useMediaQuery('(max-width: 820px)')`. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', notify)
      return () => list.removeEventListener('change', notify)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}
