import { Link } from "react-router-dom";
import { Shield, Home, Search, AlertTriangle } from "lucide-react";

export function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="mx-auto h-20 w-20 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 dark:bg-gray-800 dark:text-gray-500 mb-6">
          <AlertTriangle className="h-10 w-10" aria-hidden="true" />
        </div>
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white">404</h1>
        <h2 className="mt-2 text-xl text-gray-600 dark:text-gray-300">Page Not Found</h2>
        <p className="mt-4 text-gray-500 dark:text-gray-400">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
          <Link to="/" className="btn-primary flex items-center justify-center gap-2">
            <Home className="h-4 w-4" aria-hidden="true" />
            Go Home
          </Link>
          <Link to="/create" className="btn-secondary flex items-center justify-center gap-2">
            <Shield className="h-4 w-4" aria-hidden="true" />
            Create Push
          </Link>
        </div>
      </div>
    </div>
  );
}