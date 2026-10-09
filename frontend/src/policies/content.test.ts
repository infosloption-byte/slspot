import assert from 'node:assert/strict'
import test from 'node:test'
import { POLICY_CONTENT, POLICY_LINKS } from './content.js'

test('every public policy link has substantive draft content', () => {
  assert.equal(POLICY_LINKS.length, 8)
  for (const entry of POLICY_LINKS) {
    const policy = POLICY_CONTENT[entry.slug]
    if (!policy) throw new Error('missing policy content for ' + entry.slug)
    assert.ok(policy.title.length > 3)
    assert.ok(policy.sections.length >= 3, 'policy should have meaningful sections: ' + entry.slug)
    assert.ok(policy.sections.every((section) => Boolean(section.heading) && Boolean(section.paragraphs?.length || section.bullets?.length)))
  }
})

test('cardholder agreement remains clearly conditional in the draft', () => {
  const policy = POLICY_CONTENT.cardholder
  if (!policy) throw new Error('missing cardholder policy content')
  assert.match(policy.summary, /does not currently offer saved-card/i)
  assert.match(policy.sections[0]?.paragraphs?.join(' ') ?? '', /not currently enabled/i)
})
