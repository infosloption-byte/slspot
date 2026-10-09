import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isRealMoneyOperationEnabled,
  realMoneyOperationBlockReason,
  type RealMoneyGateConfig,
} from './real-money-gate.js'

const allEnabled: RealMoneyGateConfig = {
  launchApproved: true,
  tradingEnabled: true,
  depositsEnabled: true,
  withdrawalsEnabled: true,
}

test('real-money launch gate is fail-closed when master approval is absent', () => {
  const config: RealMoneyGateConfig = { ...allEnabled, launchApproved: false }

  for (const operation of ['TRADING', 'DEPOSIT', 'WITHDRAWAL'] as const) {
    assert.equal(isRealMoneyOperationEnabled(operation, config), false)
    assert.match(realMoneyOperationBlockReason(operation, config) ?? '', /launch gate/)
  }
})

test('master approval alone does not enable any real-money operation', () => {
  const config: RealMoneyGateConfig = {
    launchApproved: true,
    tradingEnabled: false,
    depositsEnabled: false,
    withdrawalsEnabled: false,
  }

  for (const operation of ['TRADING', 'DEPOSIT', 'WITHDRAWAL'] as const) {
    assert.equal(isRealMoneyOperationEnabled(operation, config), false)
    assert.match(realMoneyOperationBlockReason(operation, config) ?? '', /not enabled/)
  }
})

test('real-money operation flags are independent after master approval', () => {
  const tradingOnly: RealMoneyGateConfig = {
    launchApproved: true,
    tradingEnabled: true,
    depositsEnabled: false,
    withdrawalsEnabled: false,
  }

  assert.equal(isRealMoneyOperationEnabled('TRADING', tradingOnly), true)
  assert.equal(isRealMoneyOperationEnabled('DEPOSIT', tradingOnly), false)
  assert.equal(isRealMoneyOperationEnabled('WITHDRAWAL', tradingOnly), false)
})

test('every real-money operation is enabled only when both its flag and master approval are true', () => {
  assert.equal(isRealMoneyOperationEnabled('TRADING', allEnabled), true)
  assert.equal(isRealMoneyOperationEnabled('DEPOSIT', allEnabled), true)
  assert.equal(isRealMoneyOperationEnabled('WITHDRAWAL', allEnabled), true)
})
