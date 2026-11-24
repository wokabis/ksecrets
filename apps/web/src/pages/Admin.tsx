import { useState, useEffect } from "react";
import { Shield, Users, Database, Clock, TrendingUp, Download, RefreshCw, Loader2, AlertCircle } from "lucide-react";
import { clsx } from "clsx";
import { useAuth } from "../hooks/useAuth";

interface Stats {
  pushes: { total: number; active: number; expired: number; deleted: number };
  auditLogs: { count: number };
  users: { count: number };
}

export function Admin() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v2/admin/stats", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchStats();
  };

  const handleExport = async (type: string) => {
    try {
      const res = await fetch(`/api/v2/admin/export/${type}`, { credentials: "include" });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${type}-${new Date().toISOString().split("T")[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error(`Failed to export ${type}:`, err);
    }
  };

  if (!user || user.role !== "admin") {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center">
        <AlertCircle className="mx-auto h-16 w-16 text-red-500 mb-4" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Access Denied</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-300">Admin privileges required</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Admin Panel</h1>
          <p className="mt-1 text-gray-600 dark:text-gray-300">System overview and management</p>
        </div>
        <button onClick={handleRefresh} className="btn-secondary flex items-center gap-2" disabled={refreshing}>
          <RefreshCw className={clsx("h-4 w-4", refreshing && "animate-spin")} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card p-6 animate-pulse">
              <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
              <div className="h-8 w-1/2 bg-gray-200 dark:bg-gray-700 rounded" />
            </div>
          ))}
        </div>
      ) : stats ? (
        <>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 mb-8">
            <div className="card p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Total Pushes</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats.pushes.total.toLocaleString()}</p>
                </div>
                <div className="h-12 w-12 rounded-lg bg-primary-100 flex items-center justify-center text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">
                  <Database className="h-6 w-6" aria-hidden="true" />
                </div>
              </div>
              <div className="mt-4 flex gap-4 text-sm">
                <span className="badge-success">Active: {stats.pushes.active}</span>
                <span className="badge-warning">Expired: {stats.pushes.expired}</span>
                <span className="badge-danger">Deleted: {stats.pushes.deleted}</span>
              </div>
            </div>

            <div className="card p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Audit Logs</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats.auditLogs.count.toLocaleString()}</p>
                </div>
                <div className="h-12 w-12 rounded-lg bg-green-100 flex items-center justify-center text-green-600 dark:bg-green-900/30 dark:text-green-400">
                  <Clock className="h-6 w-6" aria-hidden="true" />
                </div>
              </div>
            </div>

            <div className="card p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Users</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats.users.count.toLocaleString()}</p>
                </div>
                <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                  <Users className="h-6 w-6" aria-hidden="true" />
                </div>
              </div>
            </div>

            <div className="card p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">System Health</p>
                  <p className="text-3xl font-bold text-green-600 dark:text-green-400">Healthy</p>
                </div>
                <div className="h-12 w-12 rounded-lg bg-green-100 flex items-center justify-center text-green-600 dark:bg-green-900/30 dark:text-green-400">
                  <TrendingUp className="h-6 w-6" aria-hidden="true" />
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Data Export</h2>
              <p className="text-gray-600 dark:text-gray-300 mb-4">Export system data for backup or analysis</p>
              <div className="flex flex-wrap gap-3">
                <button onClick={() => handleExport("pushes")} className="btn-secondary flex items-center gap-2">
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Export Pushes
                </button>
                <button onClick={() => handleExport("audit-logs")} className="btn-secondary flex items-center gap-2">
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Export Audit Logs
                </button>
                <button onClick={() => handleExport("users")} className="btn-secondary flex items-center gap-2">
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Export Users
                </button>
              </div>
            </div>

            <div className="card p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">System Actions</h2>
              <p className="text-gray-600 dark:text-gray-300 mb-4">Administrative operations</p>
              <div className="flex flex-wrap gap-3">
                <button className="btn-secondary flex items-center gap-2">
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Cleanup Expired
                </button>
                <button className="btn-secondary flex items-center gap-2">
                  <Shield className="h-4 w-4" aria-hidden="true" />
                  Rotate Encryption Keys
                </button>
                <button className="btn-danger flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" aria-hidden="true" />
                  Emergency Shutdown
                </button>
              </div>
            </div>
          </div>
        </>
      : null}
    </div>
  );
}