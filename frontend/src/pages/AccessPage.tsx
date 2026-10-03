import { ArrowRight, CheckCircle2, KeyRound, MailCheck, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { ApiError } from '../api/client'
import { authApi } from '../api/auth'
import { useAuth } from '../auth/AuthProvider'

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
    title: 'Create your account',
    description: 'Create your SL Spot account and verify your email before signing in.',
    submit: 'Create account',
    fields: ['email', 'password', 'confirm'] as const,
    icon: ShieldCheck,
    footer: 'Already registered?',
    footerTo: '/login',
    footerLabel: 'Sign in',
  },
  '/forgot-password': {
    eyebrow: 'Password recovery',
    title: 'Recover access',
    description: 'Enter your email and we will start the password recovery flow.',
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
    description: 'Enter the recovery token from your email and choose a new password.',
    submit: 'Save new password',
    fields: ['token', 'password', 'confirm'] as const,
    icon: KeyRound,
    footer: 'Need a new reset link?',
    footerTo: '/forgot-password',
    footerLabel: 'Recover access',
  },
  '/verify-email': {
    eyebrow: 'Email verification',
    title: 'Verify your email',
    description: 'Enter the verification token from your email to activate your account.',
    submit: 'Verify email',
    fields: ['email', 'token'] as const,
    icon: MailCheck,
    footer: 'Use another account?',
    footerTo: '/login',
    footerLabel: 'Back to sign in',
  },
  '/2fa': {
    eyebrow: 'Two-factor verification',
    title: 'Confirm sign in',
    description: 'Enter the code from your authenticator app. You can use a recovery code instead.',
    submit: 'Verify and continue',
    fields: [] as const,
    icon: ShieldCheck,
    footer: 'Need to restart?',
    footerTo: '/login',
    footerLabel: 'Back to sign in',
  },
} as const

type Field = 'email' | 'password' | 'confirm' | 'token'

type RouteState = {
  token?: string
  email?: string
  from?: string
  message?: string
  challengeToken?: string
  challengeExpiresAt?: string
  rememberDevice?: boolean
}

const challengeStorageKey = 'slspot:2fa-challenge'

function hasField(fields: readonly Field[], field: Field): boolean {
  return fields.includes(field)
}

function readRouteState(location: ReturnType<typeof useLocation>): RouteState {
  const value = location.state
  if (value && typeof value === 'object') {
    return value as RouteState
  }
  return {}
}

function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.'

  if (error.code === 'ACCOUNT_LOCKED') return error.message
  if (error.code === 'RATE_LIMITED' || error.status === 429) return error.message
  if (error.code === 'INVALID_CREDENTIALS') return error.message
  if (error.code === 'EMAIL_VERIFICATION_REQUIRED') return 'Your email address must be verified before you can sign in.'
  if (error.code === 'TERMS_CONSENT_REQUIRED') return 'You must accept the terms and privacy notice before creating the account.'
  if (error.code === 'INVALID_VERIFICATION_TOKEN') return 'That verification token is invalid or expired.'
  if (error.code === 'INVALID_RESET_TOKEN') return 'That reset token is invalid or expired. Request a new reset link.'
  if (error.code === 'TWO_FACTOR_CHALLENGE_EXPIRED') return 'This two-factor challenge has expired. Start a new sign-in.'
  if (error.code === 'TWO_FACTOR_RATE_LIMITED') return 'Too many verification attempts. Start a new sign-in.'
  if (error.code === 'INVALID_TWO_FACTOR_CODE') return error.message
  return error.message
}

export function AccessPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { status, isAuthenticated, login, verifyTwoFactor, register } = useAuth()
  const [values, setValues] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [rememberDevice, setRememberDevice] = useState(false)
  const [useRecoveryCode, setUseRecoveryCode] = useState(false)
  const [acceptTerms, setAcceptTerms] = useState(false)
  const config = useMemo(
    () => configByPath[location.pathname as keyof typeof configByPath] ?? configByPath['/login'],
    [location.pathname],
  )
  const Icon = config.icon
  const routeState = readRouteState(location)
  const storedChallenge = (() => {
    if (location.pathname !== '/2fa') return null
    try {
      const raw = sessionStorage.getItem(challengeStorageKey)
      return raw ? JSON.parse(raw) as RouteState : null
    } catch {
      return null
    }
  })()

  const challengeToken = routeState.challengeToken ?? storedChallenge?.challengeToken ?? ''
  const initialChallengeRememberDevice = routeState.rememberDevice ?? storedChallenge?.rememberDevice ?? false
  // Seed the local control from the server-directed challenge state once.
  useEffect(() => { if (location.pathname === '/2fa') setRememberDevice(initialChallengeRememberDevice) }, [initialChallengeRememberDevice, location.pathname])
  const destination = typeof routeState.from === 'string' && routeState.from.startsWith('/app/')
    ? routeState.from
    : typeof storedChallenge?.from === 'string' && storedChallenge.from.startsWith('/app/')
      ? storedChallenge.from
      : '/app/trading'
  const initialToken = typeof routeState.token === 'string'
    ? routeState.token
    : new URLSearchParams(location.search).get('token') ?? ''

  if (isAuthenticated && (location.pathname === '/login' || location.pathname === '/register' || location.pathname === '/2fa')) {
    return <Navigate to="/app/trading" replace />
  }

  const setField = (field: Field, value: string) => {
    setSubmitted(false)
    setError('')
    setValues((current) => ({ ...current, [field]: value }))
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitted(false)
    setError('')

    if (location.pathname === '/register') {
      if (!acceptTerms) {
        setError('Accept the terms and privacy notice to continue.')
        return
      }
      if (values.password !== values.confirm) {
        setError('Passwords do not match.')
        return
      }
    }

    if (location.pathname === '/reset-password' && values.password !== values.confirm) {
      setError('Passwords do not match.')
      return
    }

    if (location.pathname === '/2fa' && !challengeToken) {
      setError('This two-factor challenge is missing or expired. Start a new sign-in.')
      return
    }

    if (location.pathname === '/2fa' && !useRecoveryCode && (values.code ?? '').length !== 6) {
      setError('Enter the six-digit code from your authenticator app.')
      return
    }

    if (location.pathname === '/2fa' && useRecoveryCode && !(values.recoveryCode ?? '').trim()) {
      setError('Enter one of your recovery codes.')
      return
    }

    setBusy(true)
    try {
      if (location.pathname === '/login') {
        const result = await login(values.email ?? '', values.password ?? '', rememberDevice)
        if (result.requiresTwoFactor) {
          const challengeState: RouteState = {
            challengeToken: result.challengeToken,
            challengeExpiresAt: result.challengeExpiresAt,
            rememberDevice,
            from: typeof (location.state as RouteState | null)?.from === 'string' ? (location.state as RouteState).from : undefined,
          }
          try {
            sessionStorage.setItem(challengeStorageKey, JSON.stringify(challengeState))
          } catch {
            // In-memory route state still carries the challenge.
          }
          navigate('/2fa', { replace: true, state: challengeState })
          return
        }

        navigate(destination, { replace: true })
        return
      }

      if (location.pathname === '/2fa') {
        const result = await verifyTwoFactor(
          challengeToken,
          useRecoveryCode ? undefined : values.code,
          useRecoveryCode ? values.recoveryCode : undefined,
          rememberDevice,
        )
        if (result.requiresTwoFactor) {
          setError('A second verification step is still required. Start the sign-in flow again.')
          return
        }
        try {
          sessionStorage.removeItem(challengeStorageKey)
        } catch {
          // Ignore storage failures.
        }
        navigate(destination, { replace: true })
        return
      }

      if (location.pathname === '/register') {
        const result = await register(values.email ?? '', values.password ?? '', true, '2026-10')
        setSubmitted(true)
        if (result.verification?.token) {
          navigate('/verify-email', {
            replace: true,
            state: { email: values.email ?? '', token: result.verification.token },
          })
        }
        return
      }

      if (location.pathname === '/forgot-password') {
        const result = await authApi.forgotPassword(values.email ?? '')
        if (result.reset?.token) {
          navigate('/reset-password', { replace: true, state: { token: result.reset.token } })
          return
        }
        setSubmitted(true)
        return
      }

      if (location.pathname === '/reset-password') {
        await authApi.resetPassword(values.token ?? initialToken, values.password ?? '')
        navigate('/login', {
          replace: true,
          state: { message: 'Password reset successfully. Please sign in with your new password.' },
        })
        return
      }

      if (location.pathname === '/verify-email') {
        const token = values.token ?? initialToken
        if (!token) {
          if (!values.email) {
            setError('Enter the email address used to create the account.')
            return
          }
          const result = await authApi.requestEmailVerification(values.email)
          setSubmitted(true)
          if (result.verification?.token) setValues((current) => ({ ...current, token: result.verification!.token }))
          return
        }
        await authApi.verifyEmail(token)
        navigate('/login', {
          replace: true,
          state: { message: 'Email verified successfully. You can now sign in.' },
        })
      }
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  const verificationToken = values.token || initialToken

  return (
    <main className="access-page">
      <section className="access-card panel">
        <div className="access-card__mark"><Icon size={21} /></div>
        <div className="eyebrow">{config.eyebrow}</div>
        <h1>{config.title}</h1>
        <p>{config.description}</p>

        {status === 'loading' ? <div className="access-form__message">Checking your secure session…</div> : null}
        {routeState.message ? <div className="access-form__message">{routeState.message}</div> : null}
        {error ? <div className="access-form__message access-form__message--error" role="alert">{error}</div> : null}
        {submitted ? (
          <div className="access-form__message">
            {location.pathname === '/register'
              ? 'Account accepted. Check your email to verify the account before signing in.'
              : location.pathname === '/forgot-password'
                ? 'If the account exists, a recovery email has been prepared.'
                : location.pathname === '/verify-email'
                  ? 'A verification email has been requested.'
                  : 'Your request was accepted.'}
          </div>
        ) : null}

        {location.pathname === '/2fa' ? (
          <div className="two-factor-help">
            <div className="two-factor-help__row">
              <CheckCircle2 size={16} />
              <span>Challenge expires {(() => { const value = routeState.challengeExpiresAt ?? storedChallenge?.challengeExpiresAt; return value ? new Date(value).toLocaleTimeString() : 'soon' })()}.</span>
            </div>
            <button type="button" className="quiet-button" onClick={() => setUseRecoveryCode((value) => !value)}>
              {useRecoveryCode ? 'Use authenticator code' : 'Use recovery code'}
            </button>
          </div>
        ) : null}

        <form className="access-form" onSubmit={(event) => void submit(event)}>
          {hasField(config.fields, 'email') ? (
            <label>
              <span>Email address</span>
              <input required type="email" value={values.email ?? routeState.email ?? ''} onChange={(event) => setField('email', event.target.value)} autoComplete="email" />
            </label>
          ) : null}

          {hasField(config.fields, 'token') ? (
            <label>
              <span>{location.pathname === '/verify-email' ? 'Verification token' : 'Recovery token'}</span>
              <input required={location.pathname === '/reset-password'} type="text" value={values.token ?? verificationToken} onChange={(event) => setField('token', event.target.value.trim())} autoComplete="one-time-code" spellCheck={false} />
            </label>
          ) : null}

          {hasField(config.fields, 'password') ? (
            <label>
              <span>Password</span>
              <input required minLength={12} type="password" value={values.password ?? ''} onChange={(event) => setField('password', event.target.value)} autoComplete={location.pathname === '/reset-password' ? 'new-password' : 'current-password'} />
            </label>
          ) : null}

          {hasField(config.fields, 'confirm') ? (
            <label>
              <span>Confirm password</span>
              <input required minLength={12} type="password" value={values.confirm ?? ''} onChange={(event) => setField('confirm', event.target.value)} autoComplete="new-password" />
            </label>
          ) : null}

          {location.pathname === '/2fa' ? (
            useRecoveryCode ? (
              <label>
                <span>Recovery code</span>
                <input required autoComplete="one-time-code" spellCheck={false} value={values.recoveryCode ?? ''} onChange={(event) => setField('recoveryCode', event.target.value.toUpperCase())} placeholder="AB12-CD34-EF56-7890" />
              </label>
            ) : (
              <label>
                <span>Authenticator code</span>
                <input required inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" placeholder="123456" value={values.code ?? ''} onChange={(event) => setField('code', event.target.value.replace(/\D/g, '').slice(0, 6))} />
              </label>
            )
          ) : null}

          {location.pathname === '/login' ? (
            <label className="access-check">
              <input type="checkbox" checked={rememberDevice} onChange={(event) => setRememberDevice(event.target.checked)} />
              <span>Remember this device for longer sessions</span>
            </label>
          ) : null}

          {location.pathname === '/2fa' ? (
            <label className="access-check">
              <input type="checkbox" checked={rememberDevice} onChange={(event) => {
                const next = event.target.checked
                setRememberDevice(next)
                try {
                  const current = storedChallenge ?? routeState
                  sessionStorage.setItem(challengeStorageKey, JSON.stringify({ ...current, rememberDevice: next }))
                } catch {
                  // Route state remains authoritative for the current tab.
                }
              }} />
              <span>Remember this device for longer sessions</span>
            </label>
          ) : null}

          {location.pathname === '/register' ? (
            <label className="access-check">
              <input type="checkbox" checked={acceptTerms} onChange={(event) => { setAcceptTerms(event.target.checked); setError('') }} required />
              <span>I agree to the SL Spot terms and privacy notice (version 2026-10).</span>
            </label>
          ) : null}

          <button className="btn btn--primary" type="submit" disabled={busy || status === 'loading'}>
            {busy ? 'Please wait…' : config.submit}
            <ArrowRight size={15} />
          </button>
        </form>

        {location.pathname === '/verify-email' && values.email ? (
          <button
            className="btn btn--ghost access-card__secondary"
            type="button"
            disabled={busy}
            onClick={() => {
              setValues((current) => ({ ...current, token: '' }))
              setSubmitted(false)
              setError('')
              void (async () => {
                try {
                  setBusy(true)
                  const result = await authApi.requestEmailVerification(values.email ?? '')
                  setSubmitted(true)
                  if (result.verification?.token) setValues((current) => ({ ...current, token: result.verification!.token }))
                } catch (caught) {
                  setError(errorMessage(caught))
                } finally {
                  setBusy(false)
                }
              })()
            }}
          >
            Resend verification
          </button>
        ) : null}

        <div className="access-card__footer">
          <span>{config.footer}</span>
          <Link to={config.footerTo}>{config.footerLabel}</Link>
        </div>
        <small>Authentication is managed by the SL Spot backend. The normal authenticated session is stored in an HttpOnly cookie.</small>
      </section>
    </main>
  )
}
