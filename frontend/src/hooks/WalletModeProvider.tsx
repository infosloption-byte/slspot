import { useCallback, useState, type PropsWithChildren } from 'react'
import { WalletModeContext, readStoredMode, type WalletMode } from './useWalletMode'

export function WalletModeProvider({ children }: PropsWithChildren) {
  const [mode, setModeState] = useState<WalletMode>(readStoredMode)

  const setMode = useCallback((nextMode: WalletMode) => {
    try {
      window.localStorage.setItem('slspot.wallet-mode', nextMode)
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
