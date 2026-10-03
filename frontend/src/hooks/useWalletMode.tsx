import { createContext, useCallback, useContext, useState, type PropsWithChildren } from 'react'

export type WalletMode = 'DEMO' | 'REAL'

const STORAGE_KEY = 'slspot.wallet-mode'

type WalletModeContextValue = {
  mode: WalletMode
  setMode: (mode: WalletMode) => void
}

const WalletModeContext = createContext<WalletModeContextValue | null>(null)

function readStoredMode(): WalletMode {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'REAL' ? 'REAL' : 'DEMO'
  } catch {
    return 'DEMO'
  }
}

export function WalletModeProvider({ children }: PropsWithChildren) {
  const [mode, setModeState] = useState<WalletMode>(readStoredMode)

  const setMode = useCallback((nextMode: WalletMode) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, nextMode)
    } catch {
      // Selection still applies for the current session.
    }
    setModeState(nextMode)
  }, [])

  return (
    <WalletModeContext.Provider value={{ mode, setMode }}>
      {children}
    </WalletModeContext.Provider>
  )
}

export function useWalletMode(): WalletModeContextValue {
  const context = useContext(WalletModeContext)
  if (!context) throw new Error('useWalletMode must be used within WalletModeProvider')
  return context
}
