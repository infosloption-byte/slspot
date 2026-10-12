import { ArrowRight, BadgeCheck, Clock, FlaskConical, LockKeyhole, ShieldCheck, Wallet, Zap } from 'lucide-react'
import { Link, Navigate } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { BrandMark } from '../components/ui/BrandMark'

const features = [
  { icon: Clock, title: 'Markets that never close', text: 'Crypto trades around the clock, every day of the year. Open the terminal whenever you are ready.' },
  { icon: Zap, title: 'A focused terminal', text: 'A clean chart, a clear stake and a clear payout. You see the numbers before you place a trade.' },
  { icon: FlaskConical, title: 'Practice first', text: 'Every account has a demo balance. Learn the terminal without risking your own money.' },
  { icon: Wallet, title: 'Transparent wallet', text: 'Deposits, withdrawals and every trade are recorded in a full ledger you can review at any time.' },
  { icon: BadgeCheck, title: 'Verified accounts', text: 'Identity verification protects you and the platform, and unlocks withdrawals.' },
  { icon: LockKeyhole, title: 'Security built in', text: 'Two-factor authentication, session controls and encrypted storage of identity documents.' },
]

const steps = [
  { n: '01', title: 'Create your account', text: 'Sign up with your email and confirm it. It takes about a minute.' },
  { n: '02', title: 'Try the demo', text: 'Explore the terminal with a practice balance and learn how trades settle.' },
  { n: '03', title: 'Verify and go live', text: 'Complete identity verification when you want to use real funds, where available.' },
]

function HeroVisual() {
  return (
    <div className="landing-visual" aria-hidden="true">
      <div className="landing-visual__head"><span>BTC / USD</span><b>Live terminal</b></div>
      <svg viewBox="0 0 400 190" preserveAspectRatio="none">
        <defs>
          <linearGradient id="lv-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffc21a" stopOpacity=".28" /><stop offset="1" stopColor="#ffc21a" stopOpacity="0" /></linearGradient>
        </defs>
        <path d="M0 150 L40 132 L80 140 L120 100 L160 112 L200 72 L240 90 L280 52 L320 66 L360 30 L400 40 L400 190 L0 190Z" fill="url(#lv-fill)" />
        <path d="M0 150 L40 132 L80 140 L120 100 L160 112 L200 72 L240 90 L280 52 L320 66 L360 30 L400 40" fill="none" stroke="#ffc21a" strokeWidth="2.5" strokeLinejoin="round" />
      </svg>
      <div className="landing-visual__foot"><div><small>Stake</small><b>Your choice</b></div><div><small>Payout</small><b>Shown upfront</b></div><div><small>Settles</small><b>Automatically</b></div></div>
    </div>
  )
}

export function LandingPage() {
  const { isAuthenticated } = useAuth()
  if (isAuthenticated) return <Navigate to="/app/trading" replace />

  return (
    <div className="landing">
      <header className="landing-nav">
        <Link to="/" className="landing-logo"><BrandMark /><span>SL Spot</span></Link>
        <nav aria-label="Sections">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#safety">Safety</a>
        </nav>
        <div className="landing-nav__cta">
          <Link to="/login" className="btn btn--ghost">Sign in</Link>
          <Link to="/register" className="btn btn--primary">Get started</Link>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-hero__copy">
            <span className="landing-pill"><span /> Demo accounts open to everyone</span>
            <h1>Trade crypto markets with <em>clarity</em>.</h1>
            <p>SL Spot is a focused trading terminal for crypto markets. Live prices, a clear stake and payout on every trade, and a wallet where every movement is recorded.</p>
            <div className="landing-hero__actions">
              <Link to="/register" className="btn btn--primary btn--lg">Create free account <ArrowRight size={17} /></Link>
              <Link to="/login" className="btn btn--ghost btn--lg">Sign in</Link>
            </div>
            <ul className="landing-hero__facts">
              <li><ShieldCheck size={15} /> Two-factor authentication</li>
              <li><BadgeCheck size={15} /> Identity-verified withdrawals</li>
              <li><Clock size={15} /> Open 24/7</li>
            </ul>
          </div>
          <HeroVisual />
        </section>

        <section id="features" className="landing-section">
          <div className="landing-section__head"><span className="eyebrow">Why SL Spot</span><h2>Everything you need, nothing you don’t</h2></div>
          <div className="landing-grid">
            {features.map(({ icon: Icon, title, text }) => (
              <article key={title} className="landing-card"><span className="landing-card__icon"><Icon size={20} /></span><h3>{title}</h3><p>{text}</p></article>
            ))}
          </div>
        </section>

        <section id="how" className="landing-section">
          <div className="landing-section__head"><span className="eyebrow">Getting started</span><h2>Three steps to your first trade</h2></div>
          <ol className="landing-steps">
            {steps.map((s) => <li key={s.n}><b>{s.n}</b><h3>{s.title}</h3><p>{s.text}</p></li>)}
          </ol>
        </section>

        <section id="safety" className="landing-section landing-safety">
          <div>
            <span className="eyebrow">Your account</span>
            <h2>Built to keep your account and funds safe</h2>
            <p>Sign-ins are protected with optional two-factor authentication. Identity documents are stored encrypted and deleted on a schedule. Withdrawals are reviewed before they are paid.</p>
          </div>
          <Link to="/policies/aml-kyc" className="btn btn--ghost">Read our AML &amp; KYC policy <ArrowRight size={15} /></Link>
        </section>

        <section className="landing-cta">
          <h2>Ready to take a look?</h2>
          <p>Create an account and explore the terminal with a demo balance.</p>
          <div className="landing-hero__actions">
            <Link to="/register" className="btn btn--primary btn--lg">Create free account <ArrowRight size={17} /></Link>
            <Link to="/login" className="btn btn--ghost btn--lg">I already have an account</Link>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <p className="landing-risk"><strong>Risk warning.</strong> Trading crypto markets involves a high level of risk and you can lose all of the money you stake. Only trade with funds you can afford to lose. Past results do not predict future results. Real-money trading is subject to identity verification and may not be available in every country.</p>
        <div className="landing-footer__links">
          <span>© {new Date().getFullYear()} SL Spot</span>
          <Link to="/policies/terms">Terms</Link>
          <Link to="/policies/privacy">Privacy</Link>
          <Link to="/policies/trading-rules">Risk disclosure</Link>
          <Link to="/policies/cookies">Cookies</Link>
        </div>
      </footer>
    </div>
  )
}
