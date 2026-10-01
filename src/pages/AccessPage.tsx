import { ArrowRight, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router'

type AccessPageProps = {
  eyebrow: string
  title: string
  description: string
}

export function AccessPage({ eyebrow, title, description }: AccessPageProps) {
  return (
    <main className="access-page">
      <section className="access-card panel">
        <div className="access-card__mark"><ShieldCheck size={20} /></div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
        <Link className="workspace-page__action" to="/app/trading">
          Continue to demo terminal
          <ArrowRight size={14} />
        </Link>
        <small>Backend authentication is intentionally not enabled yet.</small>
      </section>
    </main>
  )
}
