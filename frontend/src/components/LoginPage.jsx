import { useState } from 'react'
import { apiUrl } from '../api'

const DOMAIN = '@heroelectronix.com'

export default function LoginPage({ onLogin }) {
  const [step, setStep] = useState('email') // 'email' | 'otp'
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)

  async function handleRequestOtp(e) {
    e.preventDefault()
    setError('')
    const trimmed = email.trim().toLowerCase()
    if (!trimmed.endsWith(DOMAIN)) {
      setError(`Only ${DOMAIN} email addresses are allowed.`)
      return
    }
    setLoading(true)
    try {
      const res = await fetch(apiUrl('/api/auth/request-otp'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Failed to send OTP')
      setStep('otp')
      startResendCooldown()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOtp(e) {
    e.preventDefault()
    setError('')
    if (otp.trim().length !== 6) {
      setError('Enter the 6-digit code from your email.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch(apiUrl('/api/auth/verify-otp'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), otp: otp.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Invalid OTP')
      localStorage.setItem('session_token', data.token)
      localStorage.setItem('session_email', data.email)
      localStorage.setItem('session_expires', data.expires_at)
      onLogin(data.email)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function startResendCooldown() {
    setResendCooldown(30)
    const iv = setInterval(() => {
      setResendCooldown(c => {
        if (c <= 1) { clearInterval(iv); return 0 }
        return c - 1
      })
    }, 1000)
  }

  async function handleResend() {
    if (resendCooldown > 0) return
    setError('')
    setLoading(true)
    try {
      const res = await fetch(apiUrl('/api/auth/request-otp'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Failed to resend OTP')
      startResendCooldown()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '11px 14px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.04)',
    color: '#e0e4f0',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  }

  const btnStyle = (disabled) => ({
    width: '100%',
    padding: '11px',
    borderRadius: 8,
    border: 'none',
    background: disabled ? 'rgba(255,78,26,0.3)' : 'rgba(255,78,26,0.85)',
    color: disabled ? 'rgba(255,255,255,0.4)' : '#fff',
    fontFamily: 'Bebas Neue',
    fontSize: 17,
    letterSpacing: '0.1em',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'background 0.15s',
    marginTop: 8,
  })

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        width: '100%',
        maxWidth: 400,
        background: 'rgba(20,23,38,0.9)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: '36px 32px',
        boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{ marginBottom: 28, textAlign: 'center' }}>
          <div style={{ fontFamily: 'Bebas Neue', fontSize: 28, letterSpacing: '0.1em', color: 'var(--accent)', lineHeight: 1 }}>
            VOC
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, letterSpacing: '0.05em' }}>
            Amazon VOC · Qubo by Hero Electronix
          </div>
        </div>

        {step === 'email' ? (
          <form onSubmit={handleRequestOtp}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Sign in</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Enter your <strong style={{ color: 'var(--text)' }}>@heroelectronix.com</strong> email to receive a login code.
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@heroelectronix.com"
                autoComplete="email"
                required
                style={inputStyle}
              />
            </div>
            {error && (
              <div style={{ fontSize: 12, color: '#ff6b6b', marginBottom: 10, padding: '8px 10px', background: 'rgba(255,107,107,0.08)', borderRadius: 6 }}>
                {error}
              </div>
            )}
            <button type="submit" disabled={loading} style={btnStyle(loading)}>
              {loading ? 'Sending…' : 'Send Login Code'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Check your inbox</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                We sent a 6-digit code to <strong style={{ color: 'var(--text)' }}>{email}</strong>. It expires in 10 minutes.
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                Login code
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                autoComplete="one-time-code"
                autoFocus
                style={{ ...inputStyle, fontSize: 22, letterSpacing: '0.25em', textAlign: 'center' }}
              />
            </div>
            {error && (
              <div style={{ fontSize: 12, color: '#ff6b6b', marginBottom: 10, padding: '8px 10px', background: 'rgba(255,107,107,0.08)', borderRadius: 6 }}>
                {error}
              </div>
            )}
            <button type="submit" disabled={loading} style={btnStyle(loading)}>
              {loading ? 'Verifying…' : 'Verify & Sign In'}
            </button>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
              <button
                type="button"
                onClick={() => { setStep('email'); setOtp(''); setError('') }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', padding: 0 }}
              >
                ← Change email
              </button>
              <button
                type="button"
                onClick={handleResend}
                disabled={resendCooldown > 0}
                style={{
                  background: 'none', border: 'none', padding: 0, cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer',
                  color: resendCooldown > 0 ? 'var(--text-muted)' : 'var(--accent)', fontSize: 12,
                }}
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
