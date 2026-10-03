import { createStore, useStore } from './createStore'
import type { TradeHistoryFilters } from '../api/trades'

const SOUND_KEY = 'slspot.trade-sounds'

function readSoundPreference(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) === 'on'
  } catch {
    return false
  }
}

export type TradingUiState = {
  selectedSymbol: string
  marketPickerOpen: boolean
  activityOpen: boolean
  soundEnabled: boolean
  historyPage: number
  historyFilters: TradeHistoryFilters
  historyExporting: boolean
}

export const defaultHistoryFilters: TradeHistoryFilters = {
  search: '',
  assetId: '',
  direction: '',
  status: '',
  from: '',
  to: '',
  sortBy: 'openedAt',
  sortOrder: 'desc',
}

export const tradingUiStore = createStore<TradingUiState>({
  selectedSymbol: '',
  marketPickerOpen: false,
  activityOpen: true,
  soundEnabled: readSoundPreference(),
  historyPage: 1,
  historyFilters: defaultHistoryFilters,
  historyExporting: false,
})

export function useTradingUiStore(): TradingUiState {
  return useStore(tradingUiStore)
}

export function setTradingUiState(patch: Partial<TradingUiState>): void {
  tradingUiStore.setState((current) => ({ ...current, ...patch }))
}

export function setSoundEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(SOUND_KEY, enabled ? 'on' : 'off')
  } catch {
    // Preference remains available for the current session.
  }
  setTradingUiState({ soundEnabled: enabled })
}
