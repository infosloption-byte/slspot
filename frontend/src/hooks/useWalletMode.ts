import type { WalletMode } from '../state/walletStore'
import { setWalletMode, useWalletStore } from '../state/walletStore'

export type { WalletMode }

export function readStoredMode(): WalletMode {
  try {
    return window.localStorage.getItem('slspot.wallet-mode') === 'REAL' ? 'REAL' : 'DEMO'
  } catch {
    return 'DEMO'
  }
}

export function useWalletMode(): { mode: WalletMode; setMode: (mode: WalletMode) => void } {
  const state = useWalletStore()
  return { mode: state.mode, setMode: setWalletMode }
}
