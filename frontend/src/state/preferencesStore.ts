import { createStore, useStore } from './createStore'

const COMPACT_KEY = 'slspot.preference.compact-trading'
const PRICE_ALERTS_KEY = 'slspot.preference.price-alerts'

function readBoolean(key: string, fallback: boolean): boolean {
  try {
    const value = window.localStorage.getItem(key)
    return value === null ? fallback : value === 'on'
  } catch {
    return fallback
  }
}

export type PreferencesState = {
  compactTradingLayout: boolean
  priceMovementAlerts: boolean
  soundEnabled: boolean
  emailTradeResults: boolean
  emailWalletUpdates: boolean
  emailSecurityAlerts: boolean
  emailAnnouncements: boolean
  emailSupportUpdates: boolean
}

export const preferencesStore = createStore<PreferencesState>({
  compactTradingLayout: readBoolean(COMPACT_KEY, false),
  priceMovementAlerts: readBoolean(PRICE_ALERTS_KEY, false),
  soundEnabled: false,
  emailTradeResults: true,
  emailWalletUpdates: true,
  emailSecurityAlerts: true,
  emailAnnouncements: true,
  emailSupportUpdates: true,
})

export function usePreferences(): PreferencesState {
  return useStore(preferencesStore)
}

export function setCompactTradingLayout(enabled: boolean): void {
  try {
    window.localStorage.setItem(COMPACT_KEY, enabled ? 'on' : 'off')
  } catch {
    // Preference remains available for the current session.
  }
  preferencesStore.setState((current) => ({ ...current, compactTradingLayout: enabled }))
}

export function setPriceMovementAlerts(enabled: boolean): void {
  try {
    window.localStorage.setItem(PRICE_ALERTS_KEY, enabled ? 'on' : 'off')
  } catch {
    // Preference remains available for the current session.
  }
  preferencesStore.setState((current) => ({ ...current, priceMovementAlerts: enabled }))
}


export function setServerPreferences(next: Partial<PreferencesState>): void {
  preferencesStore.setState((current) => ({ ...current, ...next }))
}
