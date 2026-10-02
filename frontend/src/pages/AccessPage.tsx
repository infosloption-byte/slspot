import { ArrowRight, KeyRound, MailCheck, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { ApiError } from '../api/client'
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
    description: 'Two-factor authentication will become server-backed in a later security milestone.',
    submit: 'Continue',
    fields: ['code'] as const,
    icon: ShieldCheck,
    footer: 'Need another method?',
    footerTo: '/login',
    footerLabel: 'Back to sign in',
  },
} as const

type Field = typeof configByPath[keyof typeof configByPath]['fields'][number]

function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.'

  if (error.code === 'EMAIL_VERIFICATION_REQUIRED') {
    return 'Your email address must be verified before you can sign in.'
  }

  if (error.code === 'INVALID_CREDENTIALS') {
    return 'Email or password is incorrect.'
  }

  if (error.code === 'INVALID_VERIFICATION_TOKEN') {
    return 'That verification token is invalid or expired.'
  }

  if (error.code === 'INVALID_RESET_TOKEN') {
    return 'That reset token is invalid or expired.'
  }

  return error.message
}

export function AccessPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { status, isAuthenticated, login, register } = useAuth()
  const [values, setValues] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const config = useMemo(
    () => configByPath[location.pathname as keyof typeof configByPath] ?? configByPath['/login'],
    [location.pathname],
  )
  const Icon = config.icon
  const routeState = (
    location.state &&
    typeof location.state === 'object' &&
    location.state !== null
  ) ? location.state as {
    token?: string
    email?: string
    from?: string
    message?: string
  } : {}

  const initialToken = typeof routeState.token === 'string'
    ? routeState.token
    : new URLSearchParams(location.search).get('token') ?? ''

  if (isAuthenticated && (location.pathname === '/login' || location.pathname === '/register')) {
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

    if (location.pathname === '/2fa') {
      setError('Two-factor verification is not connected to the server yet.')
      return
    }

    if (location.pathname === '/register' && values.password !== values.confirm) {
      setError('Passwords do not match.')
      return
    }

    if (location.pathname === '/reset-password' && values.password !== values.confirm) {
      setError('Passwords do not match.')
      return
    }

    setBusy(true)

    try {
      if (location.pathname === '/login') {
        await login(values.email ?? '', values.password ?? '')
        const state = location.state as { from?: string } | null
        const destination = typeof state?.from === 'string' && state.from.startsWith('/app/')
          ? state.from
          : '/app/trading'
        navigate(destination, { replace: true })
        return
      }

      if (location.pathname === '/register') {
        const result = await register(values.email ?? '', values.password ?? '')
        setSubmitted(true)

        if (result.verification?.token) {
          navigate('/verify-email', {
            replace: true,
            state: {
              email: values.email ?? '',
              token: result.verification.token,
            },
          })
          return
        }

        return
      }

      if (location.pathname === '/forgot-password') {
        const { authApi } = await import('../api/auth')
        const result = await authApi.forgotPassword(values.email ?? '')
        if (result.reset?.token) {
          navigate('/reset-password', {
            replace: true,
            state: { token: result.reset.token },
          })
          return
        }
        setSubmitted(true)
        return
      }

      if (location.pathname === '/reset-password') {
        const { authApi } = await import('../api/auth')
        await authApi.resetPassword(values.token ?? initialToken, values.password ?? '')
        navigate('/login', {
          replace: true,
          state: { message: 'Password reset successfully. Please sign in with your new password.' },
        })
        return
      }

      if (location.pathname === '/verify-email') {
        const { authApi } = await import('../api/auth')
        const token = values.token ?? initialToken
        if (!token) {
          if (!values.email) {
            setError('Enter the email address used to create the account.')
            return
          }
          const result = await authApi.requestEmailVerification(values.email)
          setSubmitted(true)
          if (result.verification?.token) {
            setValues((current) => ({ ...current, token: result.verification?.token ?? '' }))
          }
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
  const hasSessionCheck = status === 'loading'

  return (
    <main className="access-page">
      <section className="access-card panel">
        <div className="access-card__mark"><Icon size={21} /></div>
        <div className="eyebrow">{config.eyebrow}</div>
        <h1>{config.title}</h1>
        <p>{config.description}</p>

        {hasSessionCheck ? (
          <div className="access-form__message">Checking your secure session…</div>
        ) : null}

        {routeState.message ? (
          <div className="access-form__message">{routeState.message}</div>
        ) : null}

        {error ? (
          <div className="access-form__message access-form__message--error" role="alert">{error}</div>
        ) : null}

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

        <form className="access-form" onSubmit={(event) => void submit(event)}>
          {config.fields.includes('email') ? (
            <label>
              <span>Email address</span>
              <input
                required
                type="email"
                value={values.email ?? routeState.email ?? ''}
                onChange={(event) => setField('email', event.target.value)}
                autoComplete="email"
              />
            </label>
          ) : null}

          {config.fields.includes('token') ? (
            <label>
              <span>{location.pathname === '/verify-email' ? 'Verification token' : 'Recovery token'}</span>
              <input
                required={location.pathname === '/reset-password'}
                type="text"
                value={values.token ?? verificationToken}
                onChange={(event) => setField('token', event.target.value.trim())}
                autoComplete="one-time-code"
                spellCheck={false}
              />
            </label>
          ) : null}

          {config.fields.includes('password') ? (
            <label>
              <span>Password</span>
              <input
                required
                minLength={12}
                type="password"
                value={values.password ?? ''}
                onChange={(event) => setField('password', event.target.value)}
                autoComplete={location.pathname === '/reset-password' ? 'new-password' : 'current-password'}
              />
            </label>
          ) : null}

          {config.fields.includes('confirm') ? (
            <label>
              <span>Confirm password</span>
              <input
                required
                minLength={12}
                type="password"
                value={values.confirm ?? ''}
                onChange={(event) => setField('confirm', event.target.value)}
                autoComplete="new-password"
              />
            </label>
          ) : null}

          {config.fields.includes('code') ? (
            <label>
              <span>Verification code</span>
              <input
                required
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                placeholder="123456"
                value={values.code ?? ''}
                onChange={(event) => setField('code', event.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            </label>
          ) : null}

          <button className="btn btn--primary" type="submit" disabled={busy || hasSessionCheck}>
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
                  const { authApi } = await import('../api/auth')
                  const result = await authApi.requestEmailVerification(values.email)
                  setSubmitted(true)
                  if (result.verification?.token) {
                    setValues((current) => ({ ...current, token: result.verification?.token ?? '' }))
                  }
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
        <small>Authentication is managed by the SL Spot backend. Your browser only receives an HttpOnly session cookie.</small>
      </section>
    </main>
  )
}
