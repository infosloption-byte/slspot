import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Badge } from './Badge'
import { Button } from './Button'
import { DataTable } from './DataTable'
import { Select } from './Select'
import { Tabs } from './Tabs'

test('shared Button renders an accessible button', () => {
  const html = renderToStaticMarkup(createElement(Button, { variant: 'primary', children: 'Continue' }))
  assert.match(html, /<button[^>]*class="ui-button ui-button--primary ui-button--md"/)
  assert.match(html, />Continue<\//)
})

test('shared Badge exposes its semantic tone in markup', () => {
  const html = renderToStaticMarkup(createElement(Badge, { tone: 'success', children: 'Ready' }))
  assert.match(html, /ui-badge--success/)
  assert.match(html, />Ready<\//)
})

test('shared Tabs uses tab semantics', () => {
  const html = renderToStaticMarkup(createElement(Tabs, {
    items: [{ id: 'one', label: 'One' }, { id: 'two', label: 'Two', count: 2 }],
    value: 'one',
    onChange: () => undefined,
  }))
  assert.match(html, /role="tablist"/)
  assert.match(html, /role="tab"/)
  assert.match(html, /aria-selected="true"/)
  assert.match(html, />2<\//)
})

test('shared DataTable renders semantic table markup', () => {
  const html = renderToStaticMarkup(createElement(DataTable, {
    columns: [{ key: 'name', header: 'Name', render: (row: { name: string }) => row.name }],
    rows: [{ id: '1', name: 'BTC/USD' }],
    getRowKey: (row: { id: string }) => row.id,
  }))
  assert.match(html, /<table class="ui-table">/)
  assert.match(html, /<th[^>]*>Name<\//)
  assert.match(html, />BTC\/USD<\//)
})

test('shared Select renders without native select controls', () => {
  const html = renderToStaticMarkup(createElement(Select, {
    value: 'demo',
    options: [{ value: 'demo', label: 'Demo Wallet' }, { value: 'real', label: 'Real Wallet' }],
    onChange: () => undefined,
  }))
  assert.doesNotMatch(html, /<select\b/)
  assert.match(html, /aria-haspopup="listbox"/)
  assert.match(html, />Demo Wallet<\//)
})
