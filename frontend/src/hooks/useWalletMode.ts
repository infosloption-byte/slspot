import { createContext, useContext } from 'react'

export type WalletMode = 'DEMO' | 'REAL'

const STORAGE_KEY = 'slspot.wallet-mode'

type WalletModeContextValue = {
  mode: WalletMode
  setMode: (mode: WalletMode) => void
}

export const WalletModeContext = createContext<WalletModeContextValue | null>(null)

export function readStoredMode(): WalletMode {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'REAL' ? 'REAL' : 'DEMO'
  } catch {
    return 'DEMO'
  }
}

export function useWalletMode(): WalletModeContextValue {
  const context = useContext(WalletModeContext)
  if (!context) throw new Error('useWalletMode must be used within WalletModeProvider')
  return context
}
