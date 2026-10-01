import { ArrowUpRight, BarChart3, Clock3, Sparkles } from 'lucide-react'
import { Link } from 'react-router'

type WorkspacePageProps = {
  eyebrow: string
  title: string
  description: string
}

export function WorkspacePage({ eyebrow, title, description }: WorkspacePageProps) {
  return (
    <div className="workspace-page">
      <header className="workspace-page__header">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <Link className="workspace-page__action" to="/app/trading">
          <BarChart3 size={15} />
          Open trading room
          <ArrowUpRight size={14} />
        </Link>
      </header>

      <div className="workspace-page__grid">
        <section className="workspace-card">
          <div className="workspace-card__icon"><Sparkles size={17} /></div>
          <div>
            <strong>Frontend V1 foundation</strong>
            <span>This route is now part of the application shell and ready for its data-backed feature set.</span>
          </div>
        </section>

        <section className="workspace-card">
          <div className="workspace-card__icon"><Clock3 size={17} /></div>
          <div>
            <strong>Server data not connected</strong>
            <span>Financial values remain non-authoritative until the API, authentication, and ledger layers exist.</span>
          </div>
        </section>
      </div>
    </div>
  )
}
