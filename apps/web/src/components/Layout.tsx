import { Outlet, Link, useLocation } from "react-router-dom";
import { Menu, X, Shield, Key, ClipboardList, Settings, LogOut, User, ChevronDown, Sun, Moon } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { clsx } from "clsx";

export function Layout() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== "undefined") {
      return document.documentElement.classList.contains("dark");
    }
    return false;
  });

  const navLinks = [
    { href: "/", label: "Home", icon: Shield },
    { href: "/create", label: "Create Push", icon: Key },
    { href: "/audit", label: "Audit Log", icon: ClipboardList, auth: true },
  ];

  const userLinks = [
    { href: "/dashboard", label: "Dashboard", icon: User },
    { href: "/settings", label: "Settings", icon: Settings },
    { href: "/admin", label: "Admin", icon: Shield, admin: true },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white/80 dark:border-gray-700 dark:bg-gray-900/80 backdrop-blur-sm">
        <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8" aria-label="Main navigation">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-8">
              <Link to="/" className="flex items-center gap-2 text-xl font-bold text-primary-600 dark:text-primary-400" aria-label="KSecrets Home">
                <Shield className="h-8 w-8" />
                <span>KSecrets</span>
              </Link>

              <div className="hidden md:flex md:gap-1">
                {navLinks.map((link) => {
                  const Icon = link.icon;
                  const isActive = location.pathname === link.href || (link.href !== "/" && location.pathname.startsWith(link.href));
                  if (link.auth && !user) return null;
                  return (
                    <Link
                      key={link.href}
                      to={link.href}
                      className={clsx(
                        "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                          : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      {link.label}
                    </Link>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  setDarkMode(!darkMode);
                  document.documentElement.classList.toggle("dark", !darkMode);
                  localStorage.setItem("darkMode", (!darkMode).toString());
                }}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
                aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
              >
                {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>

              {user ? (
                <div className="relative">
                  <button
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors"
                    aria-expanded={userMenuOpen}
                    aria-haspopup="true"
                  >
                    <div className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                      {user.name?.[0]?.toUpperCase() ?? user.email[0].toUpperCase()}
                    </div>
                    <span className="hidden sm:block">{user.name ?? user.email}</span>
                    <ChevronDown className="h-4 w-4" aria-hidden="true" />
                  </button>

                  {userMenuOpen && (
                    <div className="absolute right-0 mt-2 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                      {userLinks
                        .filter((link) => !link.admin || user.role === "admin")
                        .map((link) => {
                          const Icon = link.icon;
                          return (
                            <Link
                              key={link.href}
                              to={link.href}
                              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                              onClick={() => setUserMenuOpen(false)}
                            >
                              <Icon className="h-4 w-4" aria-hidden="true" />
                              {link.label}
                            </Link>
                          );
                        })}
                      <hr className="my-1 border-gray-200 dark:border-gray-700" />
                      <button
                        onClick={() => {
                          logout();
                          setUserMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <LogOut className="h-4 w-4" aria-hidden="true" />
                        Sign out
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="hidden sm:flex sm:gap-3">
                  <Link to="/login" className="btn-ghost">
                    Sign in
                  </Link>
                  <Link to="/register" className="btn-primary">
                    Get Started
                  </Link>
                </div>
              )}

              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-menu"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>
          </div>

          {mobileMenuOpen && (
            <div id="mobile-menu" className="md:hidden py-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex flex-col gap-2">
                {navLinks.map((link) => {
                  const Icon = link.icon;
                  if (link.auth && !user) return null;
                  return (
                    <Link
                      key={link.href}
                      to={link.href}
                      className={clsx(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium",
                        location.pathname === link.href
                          ? "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                          : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                      )}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                      {link.label}
                    </Link>
                  );
                })}
                {!user && (
                  <div className="flex flex-col gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <Link to="/login" className="btn-secondary w-full" onClick={() => setMobileMenuOpen(false)}>
                      Sign in
                    </Link>
                    <Link to="/register" className="btn-primary w-full" onClick={() => setMobileMenuOpen(false)}>
                      Get Started
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}
        </nav>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="grid gap-6 md:grid-cols-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">KSecrets</h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Securely share sensitive information with automatic expiration & deletion.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Resources</h3>
              <ul className="mt-2 space-y-1 text-sm text-gray-500 dark:text-gray-400">
                <li><a href="/docs" className="hover:text-primary-600 dark:hover:text-primary-400">Documentation</a></li>
                <li><a href="/api" className="hover:text-primary-600 dark:hover:text-primary-400">API Reference</a></li>
                <li><a href="/github" className="hover:text-primary-600 dark:hover:text-primary-400">GitHub</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Legal</h3>
              <ul className="mt-2 space-y-1 text-sm text-gray-500 dark:text-gray-400">
                <li><a href="/privacy" className="hover:text-primary-600 dark:hover:text-primary-400">Privacy Policy</a></li>
                <li><a href="/terms" className="hover:text-primary-600 dark:hover:text-primary-400">Terms of Service</a></li>
                <li><a href="/security" className="hover:text-primary-600 dark:hover:text-primary-400">Security</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-8 border-t border-gray-200 pt-6 dark:border-gray-700">
            <p className="text-center text-sm text-gray-500 dark:text-gray-400">
              © {new Date().getFullYear()} KSecrets. Open source under Apache 2.0.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}