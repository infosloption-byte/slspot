import type { PaymentProviderAdapter } from './types.js'

/** The adapters this process can talk to, keyed by provider id. */
export class PaymentProviderRegistry {
  private readonly adapters = new Map<string, PaymentProviderAdapter>()

  register(adapter: PaymentProviderAdapter): void {
    const id = adapter.capabilities.id
    if (this.adapters.has(id)) throw new Error('Payment provider already registered: ' + id)
    this.adapters.set(id, adapter)
  }

  get(id: string): PaymentProviderAdapter | undefined {
    return this.adapters.get(id)
  }

  list(): PaymentProviderAdapter[] {
    return [...this.adapters.values()]
  }

  get size(): number {
    return this.adapters.size
  }
}
