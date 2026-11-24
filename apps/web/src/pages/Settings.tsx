import { useState, useEffect } from "react";
import { Shield, Key, User, Bell, Moon, Save, Loader2, Check, QrCode, Download, Upload } from "lucide-react";
import { clsx } from "clsx";
import { useAuth } from "../hooks/useAuth";

const THEMES = [
  "cerulean", "cosmo", "cyborg", "darkly", "flatly", "journal", "litera", "lumen",
  "lux", "materia", "minty", "morph", "pulse", "quartz", "sandstone", "simplex",
  "sketchy", "slate", "solar", "spacelab", "superhero", "united", "vapor", "yeti", "zephyr"
];

export function Settings() {
  const { user, refreshUser } = useAuth();
  const [activeTab, setActiveTab] = useState<"profile" | "security" | "appearance" | "api">("profile");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [name, setName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaSecret, setMfaSecret] = useState("");
  const [mfaUri, setMfaUri] = useState("");
  const [theme, setTheme] = useState("cerulean");
  const [apiKeys, setApiKeys] = useState<Array<{ id: string; name: string; prefix: string; scopes: string[]; lastUsedAt: string | null; expiresAt: string | null }>>([]);
  const [newApiKeyName, setNewApiKeyName] = useState("");
  const [newApiKeyScopes, setNewApiKeyScopes] = useState<string[]>(["pushes:write"]);
  const [showNewApiKey, setShowNewApiKey] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setName(user.name || "");
      setMfaEnabled(user.mfaEnabled);
    }
    fetchApiKeys();
  }, [user]);

  const fetchApiKeys = async () => {
    try {
      const res = await fetch("/api/v2/auth/api-keys", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setApiKeys(data.items || []);
      }
    } catch (err) {
      console.error("Failed to fetch API keys:", err);
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/v2/auth/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: name || null }),
      });
      if (res.ok) {
        await refreshUser();
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (err) {
      console.error("Failed to save profile:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      alert("Passwords do not match");
      return;
    }
    if (newPassword.length < 12) {
      alert("Password must be at least 12 characters");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/v2/auth/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (res.ok) {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        const data = await res.json();
        alert(data.error?.message || "Failed to change password");
      }
    } catch (err) {
      console.error("Failed to change password:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleEnableMfa = async () => {
    try {
      const res = await fetch("/api/v2/auth/mfa/enable", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setMfaSecret(data.secret);
        setMfaUri(data.uri);
        setMfaEnabled(true);
      }
    } catch (err) {
      console.error("Failed to enable MFA:", err);
    }
  };

  const handleDisableMfa = async () => {
    if (!confirm("Disable two-factor authentication?")) return;
    try {
      const res = await fetch("/api/v2/auth/mfa/disable", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        setMfaEnabled(false);
        setMfaSecret("");
        setMfaUri("");
      }
    } catch (err) {
      console.error("Failed to disable MFA:", err);
    }
  };

  const handleCreateApiKey = async () => {
    try {
      const res = await fetch("/api/v2/auth/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: newApiKeyName, scopes: newApiKeyScopes }),
      });
      if (res.ok) {
        const data = await res.json();
        setShowNewApiKey(data.key);
        setNewApiKeyName("");
        fetchApiKeys();
      }
    } catch (err) {
      console.error("Failed to create API key:", err);
    }
  };

  const handleRevokeApiKey = async (id: string) => {
    if (!confirm("Revoke this API key?")) return;
    try {
      const res = await fetch(`/api/v2/auth/api-keys/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        fetchApiKeys();
      }
    } catch (err) {
      console.error("Failed to revoke API key:", err);
    }
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const tabs = [
    { id: "profile", label: "Profile", icon: User },
    { id: "security", label: "Security", icon: Shield },
    { id: "appearance", label: "Appearance", icon: Moon },
    { id: "api", label: "API Keys", icon: Key },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Settings</h1>
        <p className="mt-1 text-gray-600 dark:text-gray-300">Manage your account and preferences</p>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="flex overflow-x-auto" aria-label="Settings tabs">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={clsx(
                    "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                    activeTab === tab.id
                      ? "border-primary-500 text-primary-600 dark:text-primary-400"
                      : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-6">
          {saved && (
            <div className="mb-6 flex items-center gap-2 rounded-lg bg-green-50 p-3 border border-green-200 dark:bg-green-900/20 dark:border-green-800">
              <Check className="h-5 w-5 text-green-600 dark:text-green-400" aria-hidden="true" />
              <span className="text-green-700 dark:text-green-300">Saved successfully</span>
            </div>
          )}

          {activeTab === "profile" && (
            <div className="space-y-6 max-w-xl">
              <div>
                <label className="label">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label className="label">Email</label>
                <input
                  type="email"
                  value={user?.email || ""}
                  className="input bg-gray-50 dark:bg-gray-800"
                  disabled
                />
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Email cannot be changed</p>
              </div>
              <button onClick={handleSaveProfile} className="btn-primary" disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          )}

          {activeTab === "security" && (
            <div className="space-y-8 max-w-xl">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Change Password</h3>
                <div className="space-y-4">
                  <div>
                    <label className="label">Current Password</label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="input"
                      placeholder="••••••••"
                    />
                  </div>
                  <div>
                    <label className="label">New Password</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="input"
                      placeholder="••••••••••••"
                      minLength={12}
                    />
                  </div>
                  <div>
                    <label className="label">Confirm New Password</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="input"
                      placeholder="••••••••••••"
                    />
                  </div>
                  <button onClick={handleChangePassword} className="btn-primary" disabled={saving}>
                    {saving ? "Saving..." : "Update Password"}
                  </button>
                </div>
              </div>

              <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Two-Factor Authentication</h3>
                {mfaEnabled ? (
                  <div className="space-y-4">
                    <div className="rounded-lg bg-green-50 p-4 border border-green-200 dark:bg-green-900/20 dark:border-green-800">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-green-800 dark:text-green-300">MFA Enabled</p>
                          <p className="text-sm text-green-700 dark:text-green-400">Your account is protected with two-factor authentication</p>
                        </div>
                        <button onClick={handleDisableMfa} className="btn-danger">Disable MFA</button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-gray-600 dark:text-gray-300">Add an extra layer of security to your account using an authenticator app.</p>
                    <button onClick={handleEnableMfa} className="btn-primary" disabled={saving}>
                      {saving ? "Enabling..." : "Enable MFA"}
                    </button>
                  </div>
                )}

                {mfaSecret && (
                  <div className="rounded-lg bg-blue-50 p-4 border border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
                    <h4 className="font-medium text-blue-900 dark:text-blue-300 mb-3">Setup Instructions</h4>
                    <ol className="space-y-2 text-sm text-blue-700 dark:text-blue-400 list-decimal list-inside">
                      <li>Open your authenticator app (Google Authenticator, Authy, 1Password, etc.)</li>
                      <li>Scan the QR code or enter this secret: <code className="font-mono bg-blue-100 dark:bg-blue-900/30 px-1 rounded">{mfaSecret}</code></li>
                      <li>Enter the 6-digit code to verify</li>
                    </ol>
                    {mfaUri && (
                      <div className="mt-4 text-center">
                        <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(mfaUri)}`} alt="MFA QR Code" className="mx-auto rounded-lg border border-blue-200 dark:border-blue-800" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "appearance" && (
            <div className="space-y-6 max-w-xl">
              <div>
                <label className="label">Theme</label>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {THEMES.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTheme(t)}
                      className={clsx(
                        "px-3 py-2 rounded-lg border-2 text-sm font-medium transition-colors capitalize",
                        theme === t
                          ? "border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300"
                          : "border-gray-200 hover:border-gray-300 dark:border-gray-700"
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Dark Mode</label>
                <div className="flex gap-4">
                  <button className="btn-secondary flex-1">System</button>
                  <button className="btn-secondary flex-1">Light</button>
                  <button className="btn-secondary flex-1">Dark</button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "api" && (
            <div className="space-y-6 max-w-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">API Keys</h3>
                <button onClick={() => setShowNewApiKey("new")} className="btn-primary">
                  <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                  Create API Key
                </button>
              </div>

              {showNewApiKey === "new" && (
                <div className="rounded-lg bg-blue-50 p-4 border border-blue-200 dark:bg-blue-900/20 dark:border-blue-800 animate-slide-in">
                  <h4 className="font-medium text-blue-900 dark:text-blue-300 mb-3">Create New API Key</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="label">Name</label>
                      <input
                        type="text"
                        value={newApiKeyName}
                        onChange={(e) => setNewApiKeyName(e.target.value)}
                        className="input"
                        placeholder="My API Key"
                      />
                    </div>
                    <div>
                      <label className="label">Scopes</label>
                      <div className="flex flex-wrap gap-2">
                        {["pushes:read", "pushes:write", "audit:read", "admin"].map((scope) => (
                          <label key={scope} className="inline-flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={newApiKeyScopes.includes(scope)}
                              onChange={(e) => setNewApiKeyScopes(e.target.checked ? [...newApiKeyScopes, scope] : newApiKeyScopes.filter((s) => s !== scope))}
                              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300">{scope}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => setShowNewApiKey(null)} className="btn-secondary">Cancel</button>
                      <button onClick={handleCreateApiKey} className="btn-primary" disabled={saving || !newApiKeyName}>
                        {saving ? "Creating..." : "Create Key"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {showNewApiKey && showNewApiKey !== "new" && (
                <div className="rounded-lg bg-green-50 p-4 border border-green-200 dark:bg-green-900/20 dark:border-green-800 animate-slide-in">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-green-800 dark:text-green-300">API Key Created</h4>
                    <button onClick={() => setShowNewApiKey(null)} className="btn-ghost p-1">✕</button>
                  </div>
                  <p className="text-sm text-green-700 dark:text-green-400 mb-3">Copy this key now. You won't be able to see it again.</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={showNewApiKey}
                      readOnly
                      className="input flex-1 font-mono text-sm"
                    />
                    <button onClick={() => copyToClipboard(showNewApiKey)} className="btn-secondary">
                      <Copy className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-green-600 dark:text-green-500">Store this key securely. It provides access to your account via the API.</p>
                </div>
              )}

              <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Prefix</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Scopes</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Last Used</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Expires</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {apiKeys.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">No API keys created yet</td>
                      </tr>
                    ) : (
                      apiKeys.map((key) => (
                        <tr key={key.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{key.name}</td>
                          <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 font-mono">{key.prefix}****</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {key.scopes.map((s) => (
                                <span key={s} className="badge-info">{s}</span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                            {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : "Never"}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                            {key.expiresAt ? new Date(key.expiresAt).toLocaleDateString() : "Never"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleRevokeApiKey(key.id)}
                              className="btn-ghost p-1 text-red-600 hover:text-red-700"
                              aria-label="Revoke key"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}