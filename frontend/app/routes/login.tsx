import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../context/AuthContext'
import { useTenant } from '../context/TenantContext'
import { AlertCircle, Eye, EyeOff, Globe, Moon, Sun } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { login } = useAuth()
  const { tenant, theme, toggleTheme, tenantPath } = useTenant()
  const navigate = useNavigate()

  const brandShort = tenant?.short_name || 'GIMPA'
  const brandFull = tenant?.name || 'Ghana Institute of Management and Public Administration'
  const firstDomain = (tenant?.allowed_email_domains || 'gimpa.edu.gh').split(',')[0].trim()

  const handleLogin = async () => {
    setError('')

    if (!email || !password) {
      setError('Please enter email and password')
      return
    }

    if (!email.includes('@')) {
      setError('Please enter a valid email address')
      return
    }

    setLoading(true)
    const result = await login(email, password, 'student')
    setLoading(false)

    if (!result.ok) {
      setError(result.error || 'Login failed. Please check your credentials.')
      return
    }

    navigate(tenantPath('/'))
  }

  const handleGuestAccess = async () => {
    const result = await login('guest@murrs.edu', 'guest', 'guest')
    if (result.ok) {
      navigate(tenantPath('/'))
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleLogin()
  }

  return (
    <div
      className="min-h-screen w-full flex flex-col lg:flex-row font-sans relative"
      style={{ background: 'var(--bg-main)', color: 'var(--text-main)' }}
    >
      {/* Top-right Theme Toggle */}
      <button
        type="button"
        onClick={toggleTheme}
        className="fixed top-5 right-6 z-50 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold cursor-pointer shadow-sm"
        style={{
          border: '1px solid var(--border-color)',
          background: 'var(--fp-sage)',
          color: 'var(--fp-sage-text)',
        }}
        title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      >
        {theme === 'dark' ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
        <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
      </button>

      {/* ── LEFT BRANDED INSTITUTION PANEL ── */}
      <div
        className="w-full lg:w-[44%] flex flex-col justify-between p-8 lg:p-12 relative overflow-hidden min-h-[260px] lg:min-h-screen"
        style={{ background: 'var(--bg-header)', color: 'var(--header-text, var(--text-main))' }}
      >
        {/* Top-left Brand */}
        <div className="flex items-center gap-3 z-10">
          {tenant?.logo_url ? (
            <img
              src={tenant.logo_url}
              alt={brandShort}
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                objectFit: 'contain',
                background: '#ffffff',
                padding: 4,
              }}
            />
          ) : (
            <div
              className="relative flex items-center justify-center w-9 h-9 rounded-full border-2"
              style={{ borderColor: 'currentColor' }}
            >
              <Globe className="h-5 w-5 stroke-[2]" />
            </div>
          )}
          <span className="text-[19px] font-bold tracking-tight">
            {brandShort} Repository
          </span>
        </div>

        {/* Center Brand Identity & Institution Logo Showcase */}
        <div className="flex-1 flex flex-col items-center justify-center py-6 lg:py-0 text-center max-w-sm mx-auto">
          {tenant?.logo_url ? (
            <div
              className="flex items-center justify-center mb-6 shadow-sm"
              style={{
                width: 196,
                height: 196,
                borderRadius: '50%',
                background: '#ffffff',
                border: '4px solid rgba(255, 255, 255, 0.85)',
                padding: 24,
                boxShadow: '0 12px 32px rgba(0, 0, 0, 0.08)',
              }}
            >
              <img
                src={tenant.logo_url}
                alt={`${brandFull} logo`}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                }}
              />
            </div>
          ) : (
            <svg
              viewBox="0 0 420 320"
              className="w-full max-w-[300px] h-auto select-none mb-4"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle cx="210" cy="160" r="126" fill="rgba(255,255,255,0.45)" />
              <path
                d="M115 232 C135 190, 165 170, 195 168 C220 166, 240 140, 265 142 C288 144, 305 162, 325 154 L325 232 Z"
                fill="var(--fp-olive)"
              />
              <line x1="110" y1="232" x2="328" y2="232" stroke="currentColor" strokeWidth="2" opacity="0.6" />
              <circle cx="195" cy="168" r="6" fill="currentColor" />
              <circle cx="265" cy="142" r="6" fill="currentColor" />
            </svg>
          )}
          <h2 className="text-[22px] font-bold tracking-tight mb-2">{brandFull}</h2>
          <p className="text-[13px] opacity-80 leading-relaxed">
            Dedicated institutional thesis submission, academic supervision, examination, and digital research repository.
          </p>
        </div>

        <div className="text-[12px] opacity-80 font-medium hidden lg:flex items-center justify-between">
          <span>{brandFull} · Digital Thesis Archive</span>
          <button
            type="button"
            onClick={() => navigate('/')}
            style={{ background: 'none', border: 'none', color: 'inherit', textDecoration: 'underline', fontSize: 12, cursor: 'pointer' }}
          >
            All Schools
          </button>
        </div>
      </div>

      {/* ── RIGHT LOGIN PANEL ── */}
      <div
        className="flex-1 flex items-center justify-center px-6 py-12 lg:px-16"
        style={{ background: 'var(--bg-main)' }}
      >
        <div className="w-full max-w-[380px]">
          <div className="text-center mb-8">
            <span className="fp-tag-sage" style={{ display: 'inline-block', marginBottom: 10 }}>
              {brandShort} Workspace
            </span>
            <h1 className="text-[34px] font-bold tracking-tight m-0" style={{ color: 'var(--text-main)' }}>
              Log in
            </h1>
          </div>

          {error && (
            <div className="flex items-start gap-2.5 p-3.5 mb-6 rounded-xl bg-[#fdf2f0] border border-[#f5d0ca] text-[#c93b2b] text-[13px]">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-6">
            <div>
              <label
                htmlFor="login-email"
                className="block text-[13px] font-medium mb-2"
                style={{ color: 'var(--text-main)' }}
              >
                Email address
              </label>
              <input
                id="login-email"
                type="email"
                placeholder={`name@${firstDomain || 'university.edu'}`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full h-12 px-4 rounded-lg text-[14px]"
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-[13px] font-medium mb-2"
                style={{ color: 'var(--text-main)' }}
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full h-12 pl-4 pr-11 rounded-lg text-[14px]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--text-muted)', background: 'none', border: 'none' }}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleLogin}
                disabled={loading}
                className="w-full h-12 rounded-lg font-bold text-[14px] transition-colors cursor-pointer disabled:opacity-60"
                style={{
                  background: 'var(--fp-olive)',
                  color: 'var(--fp-olive-text, #ffffff)',
                  border: 'none',
                }}
              >
                {loading ? 'Logging in...' : `Log in to ${brandShort}`}
              </button>
            </div>
          </div>

          <div className="mt-8 pt-6 flex flex-col gap-3 text-center" style={{ borderTop: '1px solid var(--border-color)' }}>
            <button
              type="button"
              onClick={handleGuestAccess}
              className="w-full h-10 rounded-lg text-[13px] font-medium btn-fp-outline"
            >
              Continue as Guest
            </button>
            <button
              type="button"
              onClick={() => navigate(tenantPath('/signup'))}
              style={{ fontSize: 12.5, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              {brandShort} Academic Staff? Request an account →
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              style={{ fontSize: 12, color: 'var(--fp-olive)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
            >
              ← Switch Institution or Register New School
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
