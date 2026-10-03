import type { WalletMode } from '../state/walletStore'
import { setWalletMode, useWalletStore } from '../state/walletStore'

export type { WalletMode }

export function readStoredMode(): WalletMode {
  return useWalletStore().mode
}

export function useWalletMode(): { mode: WalletMode; setMode: (mode: WalletMode) => void } {
  const state = useWalletStore()
  return { mode: state.mode, setMode: setWalletMode }
}
