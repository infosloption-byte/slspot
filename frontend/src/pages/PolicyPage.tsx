import { ArrowLeft, AlertTriangle, FileText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { getCurrentPolicies, type CurrentPolicyCatalogue } from '../api/policies'
import { POLICY_CONTENT, POLICY_LINKS } from '../policies/content'

export function PolicyPage() {
  const { slug = '' } = useParams()
  const policy = POLICY_CONTENT[slug]
  const [catalogue, setCatalogue] = useState<CurrentPolicyCatalogue | null>(null)
  const [catalogueError, setCatalogueError] = useState('')

  useEffect(() => {
    let active = true
    getCurrentPolicies()
      .then((result) => {
        if (active) {
          setCatalogue(result)
          setCatalogueError('')
        }
      })
      .catch(() => {
        if (active) setCatalogueError('The current policy version could not be loaded from the server.')
      })
    return () => { active = false }
  }, [])

  if (!policy) {
    return (
      <main className="policy-shell">
        <section className="policy-card">
          <h1>Policy not found</h1>
          <p>The requested policy page does not exist.</p>
          <Link className="policy-back-link" to="/register"><ArrowLeft size={15} /> Back to registration</Link>
        </section>
      </main>
    )
  }

  const metadata = catalogue?.policies.find((item) => item.slug === slug)

  return (
    <main className="policy-shell">
      <header className="policy-topbar">
        <Link className="policy-brand" to="/login" aria-label="SL Spot sign in">SL<span>SPOT</span></Link>
        <Link className="policy-back-link" to="/register"><ArrowLeft size={15} /> Back to registration</Link>
      </header>

      <div className="policy-layout">
        <aside className="policy-sidebar">
          <div className="policy-sidebar__heading"><FileText size={17} /><span>Policies</span></div>
          <nav aria-label="Policy documents">
            {POLICY_LINKS.map((item) => (
              <Link key={item.slug} to={'/policies/' + item.slug} className={item.slug === slug ? 'policy-nav-link policy-nav-link--active' : 'policy-nav-link'}>
                {item.title}
              </Link>
            ))}
          </nav>
        </aside>

        <article className="policy-card">
          <div className="policy-eyebrow">SL Spot · Policy document</div>
          <h1>{policy.title}</h1>
          <p className="policy-summary">{policy.summary}</p>
          <div className="policy-metadata">
            <span>Version: {metadata?.version ?? 'Loading…'}</span>
            <span className="policy-status">{metadata?.status ?? 'STATUS UNAVAILABLE'}</span>
          </div>

          <div className="policy-draft-notice" role="status">
            <AlertTriangle size={18} />
            <div>
              <strong>Draft for review — not final legal text</strong>
              <p>{catalogue?.draftNotice ?? 'This policy page is an implementation draft. Confirm the final wording and requirements before production use.'}</p>
              {catalogueError ? <p>{catalogueError} The displayed version must be confirmed before using this page for formal acceptance.</p> : null}
            </div>
          </div>

          <div className="policy-content">
            {policy.sections.map((section) => (
              <section key={section.heading}>
                <h2>{section.heading}</h2>
                {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                {section.bullets ? <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul> : null}
              </section>
            ))}
          </div>

          <footer className="policy-footer">
            <span>This implementation draft may change before release.</span>
            <Link to="/register">Return to registration <ArrowLeft size={14} /></Link>
          </footer>
        </article>
      </div>
    </main>
  )
}
