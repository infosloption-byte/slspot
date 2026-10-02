import { ArrowRight, KeyRound, MailCheck, ShieldCheck } from 'lucide-react'
import { FormEvent, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { setDemoSession } from '../components/routing/ProtectedRoute'

const configByPath = {
  '/login': {
    eyebrow: 'Secure access',
    title: 'Welcome back',
    description: 'Sign in to continue to your SL Spot workspace.',
    submit: 'Sign in',
    fields: ['email', 'password'] as const,
    icon: ShieldCheck,
    footer: 'New to SL Spot?',
    footerTo: '/register',
    footerLabel: 'Create account',
  },
  '/register': {
    eyebrow: 'Registration',
    title: 'Create your workspace',
    description: 'Set up a demo workspace and continue into the trading terminal.',
    submit: 'Create workspace',
    fields: ['name', 'email', 'password'] as const,
    icon: ShieldCheck,
    footer: 'Already registered?',
    footerTo: '/login',
    footerLabel: 'Sign in',
  },
  '/forgot-password': {
    eyebrow: 'Password recovery',
    title: 'Recover access',
    description: 'Enter your email and we will prepare a demo recovery link.',
    submit: 'Send recovery link',
    fields: ['email'] as const,
    icon: MailCheck,
    footer: 'Remember your password?',
    footerTo: '/login',
    footerLabel: 'Back to sign in',
  },
  '/reset-password': {
    eyebrow: 'Password reset',
    title: 'Set a new password',
    description: 'Choose a new password for this demo session.',
    submit: 'Save new password',
    fields: ['password', 'confirm'] as const,
    icon: KeyRound,
    footer: 'Need a new reset link?',
    footerTo: '/forgot-password',
    footerLabel: 'Recover access',
  },
  '/verify-email': {
    eyebrow: 'Email verification',
    title: 'Verify your email',
    description: 'Enter the six-digit demo code shown in the verification email.',
    submit: 'Verify email',
    fields: ['code'] as const,
    icon: MailCheck,
    footer: 'Use another account?',
    footerTo: '/login',
    footerLabel: 'Back to sign in',
  },
  '/2fa': {
    eyebrow: 'Two-factor verification',
    title: 'Confirm sign in',
    description: 'Enter the six-digit demo verification code to continue.',
    submit: 'Verify code',
    fields: ['code'] as const,
    icon: ShieldCheck,
    footer: 'Need another method?',
    footerTo: '/login',
    footerLabel: 'Back to sign in',
  },
} as const

type Field = typeof configByPath[keyof typeof configByPath]['fields'][number]

export function AccessPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [values, setValues] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const config = useMemo(() => configByPath[location.pathname as keyof typeof configByPath] ?? configByPath['/login'], [location.pathname])
  const Icon = config.icon

  const setField = (field: Field, value: string) => {
    setSubmitted(false)
    setValues((current) => ({ ...current, [field]: value }))
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setSubmitted(true)

    if (location.pathname === '/forgot-password' || location.pathname === '/reset-password' || location.pathname === '/verify-email') {
      return
    }

    setDemoSession(true)
    if (location.pathname === '/2fa') {
      navigate('/app/trading')
      return
    }
    navigate('/app/trading')
  }

  const demoContinue = () => {
    setDemoSession(true)
    navigate('/app/trading')
  }

  return (
    <main className="access-page">
      <section className="access-card panel">
        <div className="access-card__mark"><Icon size={21} /></div>
        <div className="eyebrow">{config.eyebrow}</div>
        <h1>{config.title}</h1>
        <p>{config.description}</p>

        <form className="access-form" onSubmit={submit}>
          {config.fields.includes('name' as never) ? (
            <label>
              <span>Full name</span>
              <input required value={values.name ?? ''} onChange={(event) => setField('name', event.target.value)} autoComplete="name" />
            </label>
          ) : null}

          {config.fields.includes('email' as never) ? (
            <label>
              <span>Email address</span>
              <input required type="email" value={values.email ?? ''} onChange={(event) => setField('email', event.target.value)} autoComplete="email" />
            </label>
          ) : null}

          {config.fields.includes('password' as never) ? (
            <label>
              <span>Password</span>
              <input required minLength={8} type="password" value={values.password ?? ''} onChange={(event) => setField('password', event.target.value)} autoComplete={location.pathname === '/reset-password' ? 'new-password' : 'current-password'} />
            </label>
          ) : null}

          {config.fields.includes('confirm' as never) ? (
            <label>
              <span>Confirm password</span>
              <input required minLength={8} type="password" value={values.confirm ?? ''} onChange={(event) => setField('confirm', event.target.value)} autoComplete="new-password" />
            </label>
          ) : null}

          {config.fields.includes('code' as never) ? (
            <label>
              <span>Verification code</span>
              <input required inputMode="numeric" pattern="\\d{6}" maxLength={6} placeholder="123456" value={values.code ?? ''} onChange={(event) => setField('code', event.target.value.replace(/\\D/g, '').slice(0, 6))} />
            </label>
          ) : null}

          {submitted ? (
            <div className="access-form__message">
              {location.pathname === '/forgot-password' ? 'Demo recovery link prepared. Use the reset screen to continue.' : location.pathname === '/reset-password' ? 'Demo password updated. Sign in again to continue.' : location.pathname === '/verify-email' ? 'Demo email verified.' : 'Demo account accepted.'}
            </div>
          ) : null}

          <button className="btn btn--primary" type="submit">
            {config.submit}
            <ArrowRight size={15} />
          </button>
        </form>

        <button className="btn btn--ghost access-card__demo" type="button" onClick={demoContinue}>Continue as demo</button>

        <div className="access-card__footer">
          <span>{config.footer}</span>
          <Link to={config.footerTo}>{config.footerLabel}</Link>
        </div>
        <small>Demo mode only. Financial and authentication state will become server-authoritative when the backend is connected.</small>
      </section>
    </main>
  )
}
