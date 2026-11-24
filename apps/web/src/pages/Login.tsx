import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Shield, Mail, Lock, Eye, AlertCircle, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import { useAuth } from "../hooks/useAuth";

export function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showMfa, setShowMfa] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await login(email, password, mfaCode || undefined);
      if (result.mfaRequired) {
        setShowMfa(true);
        setLoading(false);
        return;
      }
      navigate(callbackUrl, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      if (!showMfa) setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gray-50 dark:bg-gray-900">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 text-2xl font-bold text-primary-600 dark:text-primary-400">
            <Shield className="h-8 w-8" aria-hidden="true" />
            Password Pusher
          </Link>
          <h1 className="mt-6 text-2xl font-bold text-gray-900 dark:text-white">Sign in</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">Access your dashboard and manage pushes</p>
        </div>

        <div className="card p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="rounded-lg bg-red-50 p-4 border border-red-200 dark:bg-red-900/20 dark:border-red-800">
                <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                  <AlertCircle className="h-5 w-5" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              </div>
            )}

            <div>
              <label htmlFor="email" className="label">Email</label>
              <div className="relative mt-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" aria-hidden="true" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input pl-10"
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="label">Password</label>
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" aria-hidden="true" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pl-10 pr-12"
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  {showPassword ? <Eye className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {showMfa && (
              <div className="rounded-lg bg-blue-50 p-4 border border-blue-200 dark:bg-blue-900/20 dark:border-blue-800 animate-slide-in">
                <h3 className="font-medium text-blue-900 dark:text-blue-300 mb-2">Two-Factor Authentication</h3>
                <p className="text-sm text-blue-700 dark:text-blue-400 mb-3">Enter the 6-digit code from your authenticator app</p>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" aria-hidden="true" />
                  <input
                    type="text"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    className="input pl-10 text-center text-2xl tracking-widest font-mono"
                    placeholder="000000"
                    maxLength={6}
                    required
                    autoComplete="one-time-code"
                    disabled={loading}
                  />
                </div>
              </div>
            )}

            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Signing in...
                </>
              ) : (
                showMfa ? "Verify Code" : "Sign In"
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
            <p>Don't have an account? <Link to="/register" className="text-primary-600 hover:text-primary-700 font-medium">Create one</Link></p>
            <p className="mt-2"><Link to="/forgot-password" className="text-primary-600 hover:text-primary-700">Forgot password?</Link></p>
          </div>
        </div>
      </div>
    </div>
  );
}