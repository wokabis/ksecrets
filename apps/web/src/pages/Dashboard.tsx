import { api } from "../lib/api";
import { generatePushKey, fromBase64Url } from "../lib/pushKey";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Shield, Key, FileText, Globe, Eye, Clock, Trash2, Copy, Check, Plus, Loader2, Filter } from "lucide-react";
import { clsx } from "clsx";
import { useAuth } from "../hooks/useAuth";
import { CreatePushSchema, type CreatePushInput, type PushResponse } from "@ksecrets/types";
import { encryptWithMasterKey, serializationResult } from "@ksecrets/crypto/browser";

const KINDS = ["password", "note", "file", "url"] as const;

const icons = { password: Key, note: FileText, file: FileText, url: Globe };

const statusColors = {
  active: "badge-success",
  expired: "badge-warning",
  deleted: "badge-danger",
  burned: "badge-danger",
};

export function Dashboard() {
  const { user } = useAuth();
  const [pushes, setPushes] = useState<PushResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const FILTERS = ["all", "active", "expired", "deleted"] as const;
  type Filter = typeof FILTERS[number];
  const [filter, setFilter] = useState<Filter>("all");
  const [copied, setCopied] = useState<string | null>(null);
  const [createError, setCreateError] = useState("");
  const [createdLink, setCreatedLink] = useState<{ url: string; secretUrl: string } | null>(null);

  const [formData, setFormData] = useState({
    kind: "password" as CreatePushInput["kind"],
    payload: "",
    passphrase: "",
    expiryViews: "" as string,
    expiryDays: "7" as string,
    filename: "",
    note: "",
    retrieverEmail: "",
  });

  const fetchPushes = async () => {
    setLoading(true);
    try {
      const res = await api("/api/v2/pushes?limit=100", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setPushes(data.items);
      }
    } catch (err) {
      console.error("Failed to fetch pushes:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPushes();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError("");

    try {
      const keyFragment = generatePushKey();
      const pushKey = fromBase64Url(keyFragment);
      const result = await encryptWithMasterKey(formData.payload, pushKey, "web");
      const encryptedPayload = serializationResult(result);

      const body: Record<string, unknown> = {
        kind: formData.kind,
        payload: encryptedPayload,
        expiryViews: formData.expiryViews ? parseInt(formData.expiryViews) : undefined,
        expiryDays: formData.expiryDays ? parseInt(formData.expiryDays) : undefined,
      };
      if (formData.passphrase.trim()) body.passphrase = formData.passphrase;
      if (formData.filename.trim()) body.filename = formData.filename;
      if (formData.note.trim()) body.note = formData.note;
      if (formData.retrieverEmail.trim()) body.retrieverEmail = formData.retrieverEmail;

      const res = await api("/api/v2/pushes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const newPush = await res.json();
        const withKey = {
          ...newPush,
          url: `${newPush.url}#k=${keyFragment}`,
          secretUrl: `${newPush.secretUrl}#k=${keyFragment}`,
        };
        setPushes((prev) => [withKey, ...prev]);
        setCreatedLink({ url: withKey.url, secretUrl: withKey.secretUrl });
        closeCreate();
        setFormData({ kind: "password", payload: "", passphrase: "", expiryViews: "", expiryDays: "7", filename: "", note: "", retrieverEmail: "" } as typeof formData);
      } else {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message || body?.message || "Failed to create push");
      }
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create push");
    } finally {
      setCreating(false);
    }
  };

  const openCreate = () => {
    setCreateError("");
    setShowCreate(true);
  };

  const closeCreate = () => {
    setCreateError("");
    setShowCreate(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this push? This action cannot be undone.")) return;
    try {
      const res = await api(`/api/v2/pushes/${id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) {
        setPushes((prev) => prev.filter((p) => p.id !== id));
      }
    } catch (err) {
      console.error("Failed to delete push:", err);
    }
  };

  const copyUrl = async (url: string, id: string) => {
    await navigator.clipboard.writeText(url);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const filteredPushes = pushes.filter((p) => {
    if (filter === "all") return true;
    return p.status === filter;
  });

  const renderPushList = () => {
    if (loading) {
      return (
        <div className="p-8 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary-600" aria-hidden="true" />
          <p className="mt-4 text-gray-500 dark:text-gray-400">Loading pushes...</p>
        </div>
      );
    }

    if (filteredPushes.length === 0) {
      return (
        <div className="p-12 text-center">
          <Shield className="mx-auto h-16 w-16 text-gray-300 dark:text-gray-600 mb-4" aria-hidden="true" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">No pushes found</h3>
          <p className="mt-1 text-gray-500 dark:text-gray-400">Create your first secure push to get started</p>
          <button onClick={() => openCreate()} className="mt-4 btn-primary">
            Create Push
          </button>
        </div>
      );
    }

    return (
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {filteredPushes.map((push) => {
          const Icon = icons[push.kind];
          return (
            <div key={push.id} className="px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0 flex-1">
                <div className={clsx("h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0",
                  push.kind === "password" && "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
                  push.kind === "note" && "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
                  push.kind === "file" && "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
                  push.kind === "url" && "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
                )}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white truncate">
                    {push.kind === "file" ? push.filename || "File" : "Push"}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                    <span className={statusColors[push.status]}>{push.status}</span>
                    <span>·</span>
                    <span>{push.views}/{push.maxViews || "∞"} views</span>
                    <span>·</span>
                    <span>{new Date(push.createdAt).toLocaleDateString()}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => copyUrl(push.url, push.id)}
                  className={clsx("btn-ghost p-2", copied === push.id && "text-green-600")}
                  aria-label={copied === push.id ? "Copied!" : "Copy preview link"}
                >
                  {copied === push.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
                <Link to={`/v/${push.id}`} className="btn-ghost p-2" aria-label="Preview">
                  <Eye className="h-4 w-4" aria-hidden="true" />
                </Link>
                <button
                  onClick={() => handleDelete(push.id)}
                  className="btn-ghost p-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                  aria-label="Delete"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderCreateModal = () => {
    if (!showCreate) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => closeCreate()}>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Create New Push</h2>
            <button onClick={() => closeCreate()} className="btn-ghost p-2">✕</button>
          </div>
          <form onSubmit={handleCreate} className="p-6 space-y-4">
            <div>
              <label className="label">Type</label>
              <div className="mt-2 grid gap-2 sm:grid-cols-4">
                {KINDS.map((k) => (
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, kind: k })}
                    key={k}
                    className={clsx(
                      "px-3 py-2 rounded-lg border-2 text-sm font-medium transition-colors",
                      formData.kind === k
                        ? "border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300"
                        : "border-gray-200 hover:border-gray-300 dark:border-gray-700"
                    )}
                  >
                    {k.charAt(0).toUpperCase() + k.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">Content</label>
              <textarea
                value={formData.payload}
                onChange={(e) => setFormData({ ...formData, payload: e.target.value })}
                rows={4}
                className="input font-mono text-sm"
                placeholder={formData.kind === "password" ? "Enter password..." : formData.kind === "url" ? "https://..." : "Enter note..."}
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Expire After Views</label>
                <input
                  type="number"
                  value={formData.expiryViews as unknown as string | number}
                  onChange={(e) => setFormData({ ...formData, expiryViews: e.target.value as any })}
                  className="input"
                  placeholder="1"
                  min="1"
                  max="1000"
                />
              </div>
              <div>
                <label className="label">Expire After Days</label>
                <input
                  type="number"
                  value={formData.expiryDays as unknown as string | number}
                  onChange={(e) => setFormData({ ...formData, expiryDays: e.target.value as any })}
                  className="input"
                  placeholder="7"
                  min="1"
                  max="365"
                />
              </div>
            </div>

            <div>
              <label className="label">Passphrase (Optional)</label>
              <input
                type="password"
                value={formData.passphrase}
                onChange={(e) => setFormData({ ...formData, passphrase: e.target.value })}
                className="input"
                placeholder="Optional passphrase"
              />
            </div>

            <div>
              <label className="label">Note for Recipient</label>
              <textarea
                value={formData.note}
                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                rows={2}
                className="input"
                placeholder="Optional context..."
              />
            </div>

            <div>
              <label className="label">Recipient Email (Optional)</label>
              <input
                type="email"
                value={formData.retrieverEmail}
                onChange={(e) => setFormData({ ...formData, retrieverEmail: e.target.value })}
                className="input"
                placeholder="recipient@example.com"
              />
            </div>

            {createError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                {createError}
              </div>
            )}

            <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button type="button" onClick={() => closeCreate()} className="btn-secondary flex-1">Cancel</button>
              <button type="submit" className="btn-primary flex-1" disabled={creating || !formData.payload.trim()}>
                {creating ? "Creating..." : "Create Push"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="mt-1 text-gray-600 dark:text-gray-300">Manage your secure pushes</p>
        </div>
        <button onClick={() => openCreate()} className="btn-primary flex items-center gap-2">
          <Plus className="h-4 w-4" aria-hidden="true" />
          New Push
        </button>
      </div>

      {createdLink && (
        <div className="card mb-6 border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-green-800 dark:text-green-300">
                Push created. Copy the secret link now — the key is not stored.
              </p>
              <input
                readOnly
                value={createdLink.secretUrl}
                className="input mt-2 font-mono text-xs"
                onFocus={(e) => e.target.select()}
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => copyUrl(createdLink.secretUrl, "created")} className="btn-secondary">
                {copied === "created" ? "Copied" : "Copy link"}
              </button>
              <button onClick={() => setCreatedLink(null)} className="btn-ghost">Dismiss</button>
            </div>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={clsx(
                  "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  filter === f
                    ? "bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                    : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                )}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {renderPushList()}
      </div>

      {renderCreateModal()}
    </div>
  );
}