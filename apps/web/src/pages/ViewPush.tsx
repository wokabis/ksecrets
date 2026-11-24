import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Shield, Key, FileText, Globe, Eye, Clock, AlertCircle, Loader2, Check, Copy, Download, Info } from "lucide-react";
import { clsx } from "clsx";
import { ViewPushSchema, type ViewPushResponse } from "@pwpush/types";
import { decrypt, deserializeResult } from "@pwpush/crypto";

interface Props {
  secure?: boolean;
}

export function ViewPush({ secure = false }: Props) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [data, setData] = useState<ViewPushResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [copied, setCopied] = useState(false);
  const [burned, setBurned] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetchPush();
  }, [id, passphrase]);

  const fetchPush = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/v2/pushes/" + id, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ passphrase: passphrase || undefined }),
      });

      const result = await res.json();

      if (!res.ok) {
        if (res.status === 403 && result.error?.code === "PASSPHRASE_REQUIRED") {
          setError("PASSPHRASE_REQUIRED");
          setLoading(false);
          return;
        }
        if (res.status === 403 && result.error?.code === "INVALID_PASSPHRASE") {
          setError("INVALID_PASSPHRASE");
          setVerifying(false);
          return;
        }
        if (res.status === 410 || res.status === 404) {
          setError(result.error?.code || "NOT_FOUND");
          setLoading(false);
          return;
        }
        throw new Error(result.error?.message || "Failed to fetch push");
      }

      setData(result);
      setError(null);
      setVerifying(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handlePassphraseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setVerifying(true);
    fetchPush();
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadFile = async () => {
    if (!data || data.kind !== "file") return;
    try {
      const masterKeyHex = import.meta.env.VITE_MASTER_KEY || "";
      if (!masterKeyHex) throw new Error("Encryption key not configured");

      const masterKey = new Uint8Array(Buffer.from(masterKeyHex, "hex"));
      const encryptedPayload = (data as any).encryptedPayload;
      if (!encryptedPayload) throw new Error("No encrypted payload");

      const result = deserializeResult(encryptedPayload);
      const decrypted = await decrypt(result, masterKey);
      const blob = new Blob([decrypted], { type: data.contentType || "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename || "download";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary-600" aria-hidden="true" />
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading secure push...</p>
        </div>
      </div>
    );
  }

  if (error === "PASSPHRASE_REQUIRED") {
    return (
      <div className="mx-auto max-w-md px-4 py-12 sm:px-6 lg:px-8">
        <div className="card p-8 text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 dark:bg-primary-900/30 dark:text-primary-400 mb-6">
            <Shield className="h-8 w-8" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Passphrase Required</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-300">This push is protected with a passphrase. Enter it to access the secret.</p>

          <form onSubmit={handlePassphraseSubmit} className="mt-6 space-y-4">
            <div className="relative">
              <input
                type={showPassphrase ? "text" : "password"}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                className="input pr-12 text-center text-lg font-mono tracking-wider"
                placeholder="Enter passphrase"
                autoFocus
                required
              />
              <button
                type="button"
                onClick={() => setShowPassphrase(!showPassphrase)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showPassphrase ? <Eye className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            <button type="submit" className="btn-primary w-full" disabled={verifying}>
              {verifying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Verifying...
                </>
              ) : (
                "Access Secret"
              )}
            </button>
          </form>

          <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">
            Don't have the passphrase? Contact the sender.
          </p>
        </div>
      </div>
    );
  }

  if (error === "INVALID_PASSPHRASE") {
    return (
      <div className="mx-auto max-w-md px-4 py-12 sm:px-6 lg:px-8">
        <div className="card p-8 text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-red-100 flex items-center justify-center text-red-600 dark:bg-red-900/30 dark:text-red-400 mb-6">
            <AlertCircle className="h-8 w-8" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Incorrect Passphrase</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-300">The passphrase you entered is incorrect. Please try again.</p>

          <form onSubmit={handlePassphraseSubmit} className="mt-6 space-y-4">
            <div className="relative">
              <input
                type={showPassphrase ? "text" : "password"}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                className="input pr-12 text-center text-lg font-mono tracking-wider border-red-300 dark:border-red-700"
                placeholder="Enter passphrase"
                autoFocus
                required
              />
              <button
                type="button"
                onClick={() => setShowPassphrase(!showPassphrase)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showPassphrase ? <Eye className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            <button type="submit" className="btn-primary w-full" disabled={verifying}>
              {verifying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Verifying...
                </>
              ) : (
                "Try Again"
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (error === "EXPIRED" || error === "NOT_FOUND") {
    return (
      <div className="mx-auto max-w-md px-4 py-12 sm:px-6 lg:px-8">
        <div className="card p-8 text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 dark:bg-gray-800 dark:text-gray-500 mb-6">
            <Shield className="h-8 w-8" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {error === "EXPIRED" ? "This Push Has Expired" : "Push Not Found"}
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-300">
            {error === "EXPIRED"
              ? "The maximum number of views has been reached or the time limit has expired. The secret has been securely deleted."
              : "This push doesn't exist or has already been deleted."}
          </p>
          <Link to="/create" className="mt-6 btn-primary inline-flex">
            Create New Push
          </Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const icons = { password: Key, note: FileText, file: FileText, url: Globe };
  const Icon = icons[data.kind];

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="card overflow-hidden">
        <div className={clsx("px-6 py-4 border-b", secure ? "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800" : "bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700")}>
          <div className="flex items-center gap-3">
            <div className={clsx("h-10 w-10 rounded-lg flex items-center justify-center", secure ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" : "bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400")}>
              <Icon className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                {data.kind.charAt(0).toUpperCase() + data.kind.slice(1)} Push
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {secure ? "Direct secret access — burns after viewing" : "Preview page — click to reveal secret"}
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {data.note && (
            <div className="rounded-lg bg-blue-50 p-4 border border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
                <div>
                  <h3 className="font-medium text-blue-900 dark:text-blue-300">Note from Sender</h3>
                  <p className="mt-1 text-blue-700 dark:text-blue-400">{data.note}</p>
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
              <p className="text-sm text-gray-500 dark:text-gray-400">Views</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{data.views} / {data.maxViews || "∞"}</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
              <p className="text-sm text-gray-500 dark:text-gray-400">Expires</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {data.expiresAt ? new Date(data.expiresAt).toLocaleString() : "Never"}
              </p>
            </div>
          </div>

          {data.kind === "file" && data.filename && (
            <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{data.filename}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {data.contentType} · {(data.size || 0) / 1024 / 1024} MB
                  </p>
                </div>
              </div>
              <button
                onClick={downloadFile}
                className="btn-secondary flex items-center gap-2"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Download
              </button>
            </div>
          )}

          {secure ? (
            <>
              {!showSecret ? (
                <div className="text-center py-8">
                  <div className="mx-auto h-20 w-20 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 dark:bg-primary-900/30 dark:text-primary-400 mb-4">
                    <Shield className="h-10 w-10" aria-hidden="true" />
                  </div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Ready to Reveal Secret</h2>
                  <p className="mt-2 text-gray-600 dark:text-gray-300">Click below to view the secret. This will count as a view and may burn the link.</p>
                  <button
                    onClick={() => setShowSecret(true)}
                    className="mt-6 btn-primary"
                  >
                    <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
                    Reveal Secret
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-900 dark:text-white">Secret Content</span>
                      <button
                        onClick={() => copyToClipboard((data as any).payload)}
                        className={clsx("btn-ghost p-1", copied && "text-green-600")}
                        aria-label={copied ? "Copied!" : "Copy to clipboard"}
                      >
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </button>
                    </div>
                    <pre className="font-mono text-sm whitespace-pre-wrap break-all text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-900 p-4 rounded-lg max-h-64 overflow-y-auto">
                      {(data as any).payload}
                    </pre>
                  </div>
                  {data.kind === "url" && (
                    <a
                      href={(data as any).payload}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-primary w-full flex items-center justify-center gap-2"
                    >
                      <Globe className="h-4 w-4" aria-hidden="true" />
                      Open Link
                    </a>
                  )}
                </div>
              )}

              {!burned && data.maxViews && data.views >= data.maxViews && (
                <div className="rounded-lg bg-red-50 p-4 border border-red-200 dark:bg-red-900/20 dark:border-red-800">
                  <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                    <AlertCircle className="h-5 w-5" aria-hidden="true" />
                    <span>This push has reached its maximum views and has been burned.</span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8">
              <div className="mx-auto h-20 w-20 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 dark:bg-primary-900/30 dark:text-primary-400 mb-4">
                <Shield className="h-10 w-10" aria-hidden="true" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Secure Preview</h2>
              <p className="mt-2 text-gray-600 dark:text-gray-300">Click below to access the secret. The sender will be notified of the view.</p>
              <button
                onClick={() => navigate(`/s/${id}`)}
                className="mt-6 btn-primary"
              >
                <Key className="mr-2 h-4 w-4" aria-hidden="true" />
                Access Secret
              </button>
            </div>
          )}

          <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
              This push was created on {new Date(data.createdAt).toLocaleDateString()}
              {data.retrieverEmail && <span className="mx-2">·</span>}
              {data.retrieverEmail && <span>Intended for {data.retrieverEmail}</span>}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}