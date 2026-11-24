import { Link } from "react-router-dom";
import { Shield, Key, Clock, Eye, FileText, Globe, Lock, CheckCircle, ArrowRight } from "lucide-react";
import { clsx } from "clsx";

const features = [
  {
    icon: Lock,
    title: "End-to-End Encryption",
    description: "Your secrets are encrypted in the browser before they ever reach our servers. We never see your plaintext data.",
  },
  {
    icon: Clock,
    title: "Automatic Expiration",
    description: "Set limits by views (1-1000) or time (hours to days). Links self-destruct after the limit is reached.",
  },
  {
    icon: Eye,
    title: "Full Audit Trail",
    description: "Track every view with IP, timestamp, and user agent. Know exactly who accessed your secret and when.",
  },
  {
    icon: FileText,
    title: "Files & Notes",
    description: "Share not just passwords but files, notes, and URLs. All with the same security guarantees.",
  },
  {
    icon: Globe,
    title: "31 Languages",
    description: "Interface and secret pages available in 31 languages. Recipients see content in their preferred language.",
  },
  {
    icon: CheckCircle,
    title: "Open Source",
    description: "Fully auditable code under Apache 2.0. No vendor lock-in — self-host anywhere with Docker or our $0 edge deployment.",
  },
];

const useCases = [
  { title: "DevOps & Engineering", desc: "Share DB credentials, API keys, SSH keys, and Kubernetes secrets with team members." },
  { title: "IT Support & MSPs", desc: "Send temporary access credentials to clients without storing them in email or chat." },
  { title: "Security Teams", desc: "Distribute incident response credentials, pentest findings, and vulnerability details." },
  { title: "Remote Teams", desc: "Share WiFi passwords, VPN configs, and onboarding secrets across time zones." },
];

export function Home() {
  return (
    <div className="flex flex-col">
      <section className="relative overflow-hidden bg-gradient-to-b from-primary-50 to-white dark:from-gray-900 dark:to-gray-950 py-20 lg:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <Shield className="mx-auto h-16 w-16 text-primary-600 dark:text-primary-400 mb-6" aria-hidden="true" />
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-gray-900 dark:text-white">
              Share Secrets <span className="text-primary-600 dark:text-primary-400">Securely</span>
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              Create one-time links for passwords, notes, files, and URLs that automatically expire after a set number of views or time. Zero-knowledge encryption, full audit logs, and zero infrastructure cost.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/create" className="btn-primary text-base px-8 py-3 w-full sm:w-auto">
                Create Your First Push
                <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
              </Link>
              <Link to="/create" className="btn-secondary text-base px-8 py-3 w-full sm:w-auto">
                Try Demo
              </Link>
            </div>
            <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">
              No account required · Free forever · Open source
            </p>
          </div>
        </div>
      </section>

      <section className="py-20 lg:py-28 bg-white dark:bg-gray-950">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">
              Built for <span className="text-primary-600 dark:text-primary-400">Security First</span>
            </h2>
            <p className="mt-4 text-lg text-gray-600 dark:text-gray-300">
              Every feature designed with zero-trust principles. Your data, your control.
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div key={index} className="card p-6 hover:shadow-md transition-shadow">
                  <div className="h-12 w-12 rounded-lg bg-primary-100 flex items-center justify-center text-primary-600 dark:bg-primary-900/30 dark:text-primary-400 mb-4">
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{feature.title}</h3>
                  <p className="text-gray-600 dark:text-gray-300">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-20 lg:py-28 bg-gray-50 dark:bg-gray-900">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">
              Trusted by <span className="text-primary-600 dark:text-primary-400">Teams Worldwide</span>
            </h2>
            <p className="mt-4 text-lg text-gray-600 dark:text-gray-300">
              From startups to enterprises, teams rely on KSecrets for secure credential sharing.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {useCases.map((useCase, index) => (
              <div key={index} className="card p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{useCase.title}</h3>
                <p className="text-gray-600 dark:text-gray-300">{useCase.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 lg:py-28 bg-white dark:bg-gray-950">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="card overflow-hidden">
            <div className="bg-primary-600 px-8 py-12 sm:px-12">
              <div className="max-w-2xl">
                <h2 className="text-3xl sm:text-4xl font-bold text-white">
                  Ready to share securely?
                </h2>
                <p className="mt-4 text-lg text-primary-100">
                  Create your first push in seconds. No registration required for basic usage.
                </p>
              </div>
            </div>
            <div className="px-8 py-8 sm:px-12 flex flex-col sm:flex-row items-center justify-between gap-4">
              <Link to="/create" className="btn-primary text-base px-8 py-3 w-full sm:w-auto">
                Create Push Now
                <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
              </Link>
              <div className="flex items-center gap-6 text-sm text-gray-500 dark:text-gray-400">
                <span className="flex items-center gap-1">
                  <CheckCircle className="h-4 w-4 text-green-500" aria-hidden="true" />
                  No credit card
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle className="h-4 w-4 text-green-500" aria-hidden="true" />
                  100% open source
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle className="h-4 w-4 text-green-500" aria-hidden="true" />
                  Self-hostable
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}