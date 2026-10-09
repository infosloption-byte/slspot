import { useSyncExternalStore } from 'react'
import { browserTimeZone, getDisplayTimeZone, subscribeDisplayTimeZone } from '../lib/dateTime'

/** The timezone times are shown in: the profile's when set, otherwise the browser's. */
export function useDisplayTimeZone(): string | undefined {
  const profileZone = useSyncExternalStore(subscribeDisplayTimeZone, getDisplayTimeZone, getDisplayTimeZone)
  return profileZone ?? browserTimeZone()
}
