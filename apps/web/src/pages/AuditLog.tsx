import { api } from "../lib/api";
import { useState, useEffect } from "react";
import { Search, Filter, Download, ChevronLeft, ChevronRight, Calendar, Clock, User, MapPin, AlertCircle } from "lucide-react";
import { clsx } from "clsx";
import { AuditLogQuerySchema, type AuditLogEntry } from "@ksecrets/types";

const ACTION_LABELS: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  created: { label: "Created", icon: User, color: "text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30" },
  viewed: { label: "Viewed", icon: Clock, color: "text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30" },
  expired: { label: "Expired", icon: Calendar, color: "text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-800" },
  deleted: { label: "Deleted", icon: AlertCircle, color: "text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30" },
  burned: { label: "Burned", icon: AlertCircle, color: "text-orange-600 bg-orange-100 dark:text-orange-400 dark:bg-orange-900/30" },
  passphrase_failed: { label: "Passphrase Failed", icon: AlertCircle, color: "text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30" },
};

export function AuditLog() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [filters, setFilters] = useState({
    pushId: "",
    action: "",
    fromDate: "",
    toDate: "",
    search: "",
  });

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: ((page - 1) * limit).toString(),
      });
      if (filters.pushId) params.set("pushId", filters.pushId);
      if (filters.action) params.set("action", filters.action);
      if (filters.fromDate) params.set("fromDate", filters.fromDate);
      if (filters.toDate) params.set("toDate", filters.toDate);

      const res = await api(`/api/v2/audit?${params}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.items);
        setTotal(data.total);
      }
    } catch (err) {
      console.error("Failed to fetch audit logs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, filters]);

  const handleExport = async () => {
    const params = new URLSearchParams({
      limit: "10000",
      offset: "0",
      ...(filters.pushId && { pushId: filters.pushId }),
      ...(filters.action && { action: filters.action }),
      ...(filters.fromDate && { fromDate: filters.fromDate }),
      ...(filters.toDate && { toDate: filters.toDate }),
    });

    const res = await api(`/api/v2/audit?${params}`, { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      const csv = [
        ["ID", "Push ID", "Action", "IP", "User Agent", "Email", "Metadata", "Created At"],
        ...data.items.map((item: AuditLogEntry) => [
          item.id,
          item.pushId,
          item.action,
          item.ip || "",
          item.userAgent || "",
          item.retrieverEmail || "",
          JSON.stringify(item.metadata),
          item.createdAt,
        ]),
      ].map((row) => row.map((cell: unknown) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");

      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Audit Log</h1>
          <p className="mt-1 text-gray-600 dark:text-gray-300">Track all activity across your pushes</p>
        </div>
        <button onClick={handleExport} className="btn-secondary flex items-center gap-2" disabled={loading}>
          <Download className="h-4 w-4" aria-hidden="true" />
          Export CSV
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
              <input
                type="text"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                placeholder="Search push ID, IP, email..."
                className="input pl-10"
              />
            </div>
            <select
              value={filters.action}
              onChange={(e) => setFilters({ ...filters, action: e.target.value })}
              className="input"
            >
              <option value="">All Actions</option>
              <option value="created">Created</option>
              <option value="viewed">Viewed</option>
              <option value="expired">Expired</option>
              <option value="deleted">Deleted</option>
              <option value="burned">Burned</option>
              <option value="passphrase_failed">Passphrase Failed</option>
            </select>
            <input
              type="date"
              value={filters.fromDate}
              onChange={(e) => setFilters({ ...filters, fromDate: e.target.value })}
              className="input"
              placeholder="From Date"
            />
            <input
              type="date"
              value={filters.toDate}
              onChange={(e) => setFilters({ ...filters, toDate: e.target.value })}
              className="input"
              placeholder="To Date"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Time</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Action</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Push ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">IP Address</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">User Agent</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Email</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    No audit logs found
                  </td>
                </tr>
              ) : (
                <>
                  {logs.map((log) => {
                    const actionInfo = ACTION_LABELS[log.action] || { label: log.action, icon: AlertCircle, color: "text-gray-600 bg-gray-100" };
                    const Icon = actionInfo.icon;
                    return (
                      <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-mono">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <span className={clsx("inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium", actionInfo.color)}>
                            <Icon className="h-3 w-3" aria-hidden="true" />
                            {actionInfo.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 font-mono">
                          <a href={`/v/${log.pushId}`} className="hover:text-primary-600 dark:hover:text-primary-400">
                            {log.pushId.slice(0, 8)}...
                          </a>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 font-mono">
                          {log.ip || "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">
                          {log.userAgent || "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                          {log.retrieverEmail || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </>
              )}
              </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Showing page {page} of {totalPages} ({total} total entries)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || loading}
                className="btn-ghost p-2"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages || loading}
                className="btn-ghost p-2"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}