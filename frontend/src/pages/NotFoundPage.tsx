import { ArrowLeft, Compass } from 'lucide-react'
import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <main className="not-found-page">
      <span className="not-found-page__icon"><Compass size={28} /></span>
      <span className="eyebrow">404</span>
      <h1>Page not found</h1>
      <p>The address does not match an SL Spot page.</p>
      <Link className="btn btn--primary" to="/app/trading"><ArrowLeft size={15} /> Return to trading</Link>
    </main>
  )
}
