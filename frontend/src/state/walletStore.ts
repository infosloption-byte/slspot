import { createStore, useStore } from './createStore'

export type WalletMode = 'DEMO' | 'REAL'

const STORAGE_KEY = 'slspot.wallet-mode'

function readMode(): WalletMode {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'REAL' ? 'REAL' : 'DEMO'
  } catch {
    return 'DEMO'
  }
}

export type WalletState = {
  mode: WalletMode
}

export const walletStore = createStore<WalletState>({ mode: readMode() })

export function useWalletStore(): WalletState {
  return useStore(walletStore)
}

export function setWalletMode(mode: WalletMode): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // Selection still applies for this session.
  }
  walletStore.setState({ mode })
}
