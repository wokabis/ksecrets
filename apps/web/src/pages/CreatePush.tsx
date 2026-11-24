import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Shield, Key, FileText, Globe, Eye, Clock, Copy, Check, AlertCircle, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import { CreatePushSchema, type PushKind, type CreatePushInput } from "@pwpush/types";
import { encrypt, serializationResult } from "@pwpush/crypto";

const KINDS: { value: PushKind; label: string; description: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "password", label: "Password", description: "Share a password or secret text", icon: Key },
  { value: "note", label: "Secure Note", description: "Share a longer text note or message", icon: FileText },
  { { value: "url", label: "URL / Link", description: "Share a private URL with tracking", icon: Globe },
  { value: "file", label: "File", description: "Upload and share a file securely", icon: FileText },
];

export function CreatePush() {
  const navigate = useNavigate();
  const [kind, setKind] = useState<PushKind>("password");
  const [payload, setPayload] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [expiryViews, setExpiryViews] = useState("");
  const [expiryDays, setExpiryDays] = useState("");
  const [filename, setFilename] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [retrieverEmail, setRetrieverEmail] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ id: string; url: string; secretUrl: string } | null>(null);
  const [copied, setCopied] = useState<"url" | "secret" | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const input: CreatePushInput = {
        kind,
        payload: kind === "file" && file ? await fileToBase64(file) : payload,
        passphrase: passphrase || undefined,
        expiryViews: expiryViews ? parseInt(expiryViews) : undefined,
        expiryDays: expiryDays ? parseInt(expiryDays) : undefined,
        filename: filename || (file?.name || undefined),
        contentType: file?.type || undefined,
        size: file?.size || undefined,
        note: note || undefined,
        retrieverEmail: retrieverEmail || undefined,
      };

      const parsed = CreatePushSchema.safeParse(input);
      if (!parsed.success) {
        setError(parsed.error.errors.map((e) => e.message).join(", "));
        setSubmitting(false);
        return;
      }

      const masterKeyHex = import.meta.env.VITE_MASTER_KEY || "";
      if (!masterKeyHex) {
        setError("Encryption key not configured. Please contact administrator.");
        setSubmitting(false);
        return;
      }

      const masterKey = new Uint8Array(Buffer.from(masterKeyHex, "hex"));
      const result = await encrypt(parsed.data.payload, masterKey);
      const encryptedPayload = serializationResult(result);

      const res = await fetch("/api/v2/pushes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...parsed.data,
          payload: encryptedPayload,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message || "Failed to create push");
        setSubmitting(false);
        return;
      }

      setSuccess({ id: data.id, url: data.url, secretUrl: data.secretUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  const copyToClipboard = async (text: string, type: "url" | "secret") => {
    await navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
    });
  };

  if (success) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="card overflow-hidden">
          <div className="bg-green-50 p-6 border-b border-green-200 dark:bg-green-900/20 dark:border-green-800">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center text-green-600 dark:bg-green-900/30 dark:text-green-400">
                <Check className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Push Created Successfully</h2>
                <p className="text-gray-600 dark:text-gray-300">Your secret is ready to share securely</p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            <div>
              <label className="label">Shareable Link (Preview)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={success.url}
                  readOnly
                  className="input flex-1 font-mono text-sm"
                />
                <button
                  onClick={() => copyToClipboard(success.url, "url")}
                  className={clsx("btn-secondary", copied === "url" && "bg-green-100 text-green-700")}
                  aria-label={copied === "url" ? "Copied!" : "Copy link"}
                >
                  {copied === "url" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Recipient sees a preview page before accessing the secret</p>
            </div>

            <div>
              <label className="label">Direct Secret Link (One-time)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={success.secretUrl}
                  readOnly
                  className="input flex-1 font-mono text-sm"
                />
                <button
                  onClick={() => copyToClipboard(success.secretUrl, "secret")}
                  className={clsx("btn-secondary", copied === "secret" && "bg-green-100 text-green-700")}
                  aria-label={copied === "secret" ? "Copied!" : "Copy secret link"}
                >
                  {copied === "secret" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Direct access to secret — burns after first view</p>
            </div>

            <div className="flex gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <Link to="/create" className="btn-secondary flex-1">
                Create Another
              </Link>
              <Link to={`/v/${success.id}`} className="btn-primary flex-1">
                Preview Page
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Create Secure Push</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-300">
          Share passwords, notes, files, and URLs with automatic expiration and full audit trails.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card overflow-hidden">
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Type</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {KINDS.map((k) => {
              const Icon = k.icon;
              return (
                <button
                  type="button"
                  onClick={() => setKind(k.value)}
                  key={k.value}
                  className={clsx(
                    "relative flex flex-col items-center gap-2 rounded-lg p-4 border-2 transition-all",
                    kind === k.value
                      ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20"
                      : "border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600"
                  )}
                >
                  <div className={clsx("h-10 w-10 rounded-lg flex items-center justify-center", kind === k.value ? "bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400")}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <span className="font-medium text-sm">{k.label}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 text-center">{k.description}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-6 space-y-6">
          {kind === "file" ? (
            <div>
              <label className="label">File Upload</label>
              <div
                className={clsx(
                  "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
                  file ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20" : "border-gray-200 hover:border-gray-300 dark:border-gray-700"
                )}
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); }}
              >
                <input
                  type="file"
                  id="file-upload"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])}
                  accept="*"
                />
                <FileText className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500 mb-4" aria-hidden="true" />
                {file ? (
                  <div className="space-y-2">
                    <p className="font-medium text-gray-900 dark:text-white">{file.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{(file.size / 1024 / 1024).toFixed(2)} MB · {file.type || "Unknown type"}</p>
                    <button type="button" onClick={() => setFile(null)} className="text-sm text-primary-600 hover:text-primary-700">Remove</button>
                  </div>
                ) : (
                  <>
                    <p className="text-gray-600 dark:text-gray-300">Drag & drop a file here, or click to browse</p>
                    <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Max 100MB · All file types supported</p>
                    <button type="button" onClick={() => document.getElementById("file-upload")?.click()} className="mt-4 btn-primary">
                      Browse Files
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div>
              <label className="label">{kind === "password" ? "Password / Secret" : kind === "url" ? "URL" : "Note Content"}</label>
              <textarea
                value={payload}
                onChange={(e) => setPayload(e.target.value)}
                rows={kind === "note" ? 6 : 3}
                className="input font-mono text-sm"
                placeholder={kind === "password" ? "Enter password or secret text..." : kind === "url" ? "https://example.com/private-link" : "Enter your secure note..."}
                required
                maxLength={10000000}
              />
              <p className="text-sm text-gray-500 dark:text-gray-400">Max 10MB · Encrypted in your browser before sending</p>
            </div>
          )}

          <div>
            <label className="label flex items-center gap-2">
              Passphrase (Optional)
              <span className="text-sm font-normal text-gray-500 dark:text-gray-400">(Recipient must enter this to view)</span>
            </label>
            <div className="relative mt-1">
              <input
                type={showPassphrase ? "text" : "password"}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                className="input pr-12"
                placeholder="Optional passphrase for extra security"
                maxLength={256}
              />
              <button
                type="button"
                onClick={() => setShowPassphrase(!showPassphrase)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showPassphrase ? <Eye className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Expire After Views</label>
              <input
                type="number"
                value={expiryViews}
                onChange={(e) => setExpiryViews(e.target.value)}
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
                value={expiryDays}
                onChange={(e) => setExpiryDays(e.target.value)}
                className="input"
                placeholder="7"
                min="1"
                max="365"
              />
            </div>
          </div>

          {kind !== "file" && (
            <div>
              <label className="label">Filename (Optional)</label>
              <input
                type="text"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                className="input"
                placeholder={kind === "password" ? "credentials.txt" : kind === "url" ? "link.url" : "note.txt"}
                maxLength={256}
              />
            </div>
          )}

          <div>
            <label className="label">Note for Recipient (Optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="input"
              placeholder="Add context or instructions for the recipient..."
              maxLength={5000}
            />
          </div>

          <div>
            <label className="label">Recipient Email (Optional)</label>
            <input
              type="email"
              value={retrieverEmail}
              onChange={(e) => setRetrieverEmail(e.target.value)}
              className="input"
              placeholder="recipient@example.com"
              maxLength={256}
            />
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Used for audit logging and optional notification</p>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-4 border border-red-200 dark:bg-red-900/20 dark:border-red-800">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                <AlertCircle className="h-5 w-5" aria-hidden="true" />
                <span>{error}</span>
              </div>
            </div>
          )}

          <div className="flex gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button type="submit" className="btn-primary flex-1" disabled={submitting || (kind !== "file" && !payload.trim()) || (kind === "file" && !file)}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Creating...
                </>
              ) : (
                <>
                  <Shield className="mr-2 h-4 w-4" aria-hidden="true" />
                  Create Secure Push
                </>
              )}
            </button>
            <Link to="/" className="btn-secondary flex-1">
              Cancel
            </Link>
          </div>
        </div>
      </form>

      <div className="mt-8 card p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">How It Works</h3>
        <div className="grid gap-4 sm:grid-cols-3 text-sm">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary-100 flex items-center justify-center text-primary-600 dark:bg-primary-900/30 dark:text-primary-400 flex-shrink-0">
              <Shield className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white">Encrypt</h4>
              <p className="text-gray-500 dark:text-gray-400">Your secret is encrypted in your browser using AES-GCM before it ever leaves your device.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary-100 flex items-center justify-center text-primary-600 dark:bg-primary-900/30 dark:text-primary-400 flex-shrink-0">
              <Key className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white">Share</h4>
              <p className="text-gray-500 dark:text-gray-400">Send the generated link via any channel. The recipient views it in their browser.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary-100 flex items-center justify-center text-primary-600 dark:bg-primary-900/30 dark:text-primary-400 flex-shrink-0">
              <Clock className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white">Expire</h4>
              <p className="text-gray-500 dark:text-gray-400">The link automatically self-destructs after the set views or time. Full audit trail retained.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}