import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Database,
  Info,
  RefreshCw,
  Search,
  ShieldCheck,
  Siren,
} from "lucide-react";
import { useState } from "react";
import { apiRequest } from "../api";
import { RoleBadges } from "../components/RoleBadge";
import { timeAgo } from "../dateUtils";

type Severity = "info" | "warning" | "error" | "critical";
type TimeWindow = "24h" | "7d" | "30d" | "all";

type AuditEvent = {
  _id: string;
  occurred_at: string;
  expires_at: string;
  severity: Severity;
  category: string;
  event_type: string;
  message: string;
  outcome: "success" | "failure" | "denied";
  actor: {
    username: string;
    fullname: string | null;
    roles: string[];
    provider: string | null;
  };
  resource: {
    type: string | null;
    id: string | null;
    name: string | null;
  };
  source: {
    environment: string;
    request_id: string | null;
    client_ip: string | null;
    method: string | null;
    path: string | null;
    user_agent: string | null;
  };
  tags: string[];
  metadata: Record<string, unknown>;
};

type AuditLogPayload = {
  items: AuditEvent[];
  total: number;
  page: number;
  page_size: number;
  severity_counts: Record<Severity, number>;
  categories: string[];
};

const severityStyle: Record<Severity, string> = {
  info: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/20 dark:text-sky-100",
  warning:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/45 dark:bg-amber-500/20 dark:text-amber-100",
  error:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/20 dark:text-red-100",
  critical:
    "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800 dark:border-fuchsia-500/40 dark:bg-fuchsia-500/20 dark:text-fuchsia-100",
};

const severityIcon = {
  info: Info,
  warning: AlertTriangle,
  error: CircleAlert,
  critical: Siren,
};

export function AdminAuditLogsPage() {
  const [page, setPage] = useState(1);
  const [severity, setSeverity] = useState<Severity | "">("");
  const [category, setCategory] = useState("");
  const [actor, setActor] = useState("");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("7d");

  const query = useQuery({
    queryKey: [
      "admin-audit-logs",
      page,
      severity,
      category,
      actor,
      appliedSearch,
      timeWindow,
    ],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (severity) params.set("severity", severity);
      if (category) params.set("category", category);
      if (actor.trim()) params.set("actor", actor.trim());
      if (appliedSearch) params.set("search", appliedSearch);
      if (timeWindow !== "all") {
        const hours =
          timeWindow === "24h" ? 24 : timeWindow === "7d" ? 24 * 7 : 24 * 30;
        params.set(
          "from",
          new Date(Date.now() - hours * 60 * 60 * 1000).toISOString(),
        );
      }
      return apiRequest<AuditLogPayload>(`/api/v1/admin/audit-logs?${params}`);
    },
    refetchInterval: 30_000,
  });

  const pages = Math.max(1, Math.ceil((query.data?.total ?? 0) / 50));

  function applySearch() {
    setPage(1);
    setAppliedSearch(search.trim());
  }

  function clearFilters() {
    setPage(1);
    setSeverity("");
    setCategory("");
    setActor("");
    setSearch("");
    setAppliedSearch("");
    setTimeWindow("7d");
  }

  return (
    <section className="mx-auto w-full max-w-[1728px] p-4 sm:p-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck
              className="text-brand-primary dark:text-brand-detail"
              size={23}
            />
            <h1 className="text-xl font-semibold tracking-tight">
              Audit events
            </h1>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-[#c7beb4]">
            Searchable security, identity, clinical activity, and system events.
          </p>
        </div>
        <button
          type="button"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
          className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-brand-primary px-3 text-sm font-medium text-brand-primary transition hover:bg-brand-primary/10 disabled:opacity-50 dark:border-brand-detail dark:text-brand-detail"
        >
          <RefreshCw
            size={15}
            className={query.isFetching ? "animate-spin" : ""}
          />
          Refresh
        </button>
      </header>

      <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {(["info", "warning", "error", "critical"] as Severity[]).map(
          (level) => {
            const Icon = severityIcon[level];
            return (
              <button
                type="button"
                key={level}
                onClick={() => {
                  setPage(1);
                  setSeverity(severity === level ? "" : level);
                }}
                className={`flex items-center justify-between rounded-xl border p-3 text-left transition hover:-translate-y-px ${severityStyle[level]} ${severity === level ? "ring-2 ring-current ring-offset-2 dark:ring-offset-neutral-900" : ""}`}
              >
                <span>
                  <span className="block text-xs font-semibold uppercase tracking-wider">
                    {level}
                  </span>
                  <span className="mt-0.5 block text-xl font-semibold tabular-nums">
                    {query.data?.severity_counts[level] ?? 0}
                  </span>
                </span>
                <Icon size={20} />
              </button>
            );
          },
        )}
      </div>

      <div className="mb-4 rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-[#3b3732] dark:bg-[#202020]">
        <div className="grid gap-2 md:grid-cols-[minmax(13rem,1fr)_10rem_11rem_11rem_auto]">
          <form
            className="relative"
            onSubmit={(event) => {
              event.preventDefault();
              applySearch();
            }}
          >
            <Search
              className="pointer-events-none absolute left-3 top-2.5 text-gray-400"
              size={16}
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search event, resource, or tag"
              aria-label="Search audit events"
              className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 dark:border-[#4a433d] dark:bg-[#181818]"
            />
          </form>
          <select
            value={category}
            onChange={(event) => {
              setPage(1);
              setCategory(event.target.value);
            }}
            aria-label="Filter by category"
            className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-[#4a433d] dark:bg-[#181818]"
          >
            <option value="">All categories</option>
            {query.data?.categories.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            value={timeWindow}
            onChange={(event) => {
              setPage(1);
              setTimeWindow(event.target.value as TimeWindow);
            }}
            aria-label="Filter by time range"
            className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-[#4a433d] dark:bg-[#181818]"
          >
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="all">All retained</option>
          </select>
          <input
            value={actor}
            onChange={(event) => {
              setPage(1);
              setActor(event.target.value);
            }}
            placeholder="Filter by username"
            aria-label="Filter by username"
            className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-brand-primary dark:border-[#4a433d] dark:bg-[#181818]"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={applySearch}
              className="h-9 rounded-lg bg-brand-primary px-4 text-sm font-medium text-white dark:bg-brand-detail dark:text-neutral-950"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={clearFilters}
              className="h-9 rounded-lg border border-gray-300 px-3 text-sm font-medium dark:border-[#4a433d]"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {query.isError && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-200"
        >
          {query.error instanceof Error
            ? query.error.message
            : "Could not load audit events"}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-[#3b3732] dark:bg-[#202020]">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2 text-xs text-gray-500 dark:border-[#3b3732] dark:text-[#c7beb4]">
          <span className="inline-flex items-center gap-1.5">
            <Database size={13} /> MongoDB audit_events
          </span>
          <span>{query.data?.total ?? 0} matching events</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-[#181818]/60 dark:text-[#c7beb4]">
              <tr>
                <th className="px-4 py-2.5 font-medium">Time</th>
                <th className="px-3 py-2.5 font-medium">Level</th>
                <th className="px-3 py-2.5 font-medium">Event</th>
                <th className="px-3 py-2.5 font-medium">Actor</th>
                <th className="px-3 py-2.5 font-medium">Resource</th>
                <th className="px-4 py-2.5 font-medium">Context</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-[#34302c]">
              {query.isLoading ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-gray-500">
                    Loading audit events…
                  </td>
                </tr>
              ) : query.data?.items.length ? (
                query.data.items.map((item) => (
                  <AuditEventRow event={item} key={item._id} />
                ))
              ) : (
                <tr>
                  <td
                    colSpan={6}
                    className="p-12 text-center text-gray-500 dark:text-[#c7beb4]"
                  >
                    <Activity className="mx-auto mb-2" size={24} />
                    No events match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 text-sm dark:border-[#3b3732]">
          <span className="text-gray-500 dark:text-[#c7beb4]">
            Page {page} of {pages}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              aria-label="Previous page"
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
              className="rounded-md border border-gray-300 p-1.5 disabled:opacity-40 dark:border-[#4a433d]"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              aria-label="Next page"
              disabled={page >= pages}
              onClick={() => setPage((value) => value + 1)}
              className="rounded-md border border-gray-300 p-1.5 disabled:opacity-40 dark:border-[#4a433d]"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function AuditEventRow({ event }: { event: AuditEvent }) {
  const Icon = severityIcon[event.severity];
  const resource = event.resource.name || event.resource.id;
  return (
    <tr className="align-top hover:bg-gray-50/70 dark:hover:bg-[#2a2724]/30">
      <td className="whitespace-nowrap px-4 py-3">
        <span className="block text-xs font-medium">
          {new Date(event.occurred_at).toLocaleString()}
        </span>
        <span className="text-xs text-gray-500">
          {timeAgo(event.occurred_at)}
        </span>
      </td>
      <td className="px-3 py-3">
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${severityStyle[event.severity]}`}
        >
          <Icon size={12} /> {event.severity}
        </span>
      </td>
      <td className="max-w-sm px-3 py-3">
        <div className="font-medium text-gray-900 dark:text-[#f4efe8]">
          {event.message}
        </div>
        <div className="mt-0.5 font-mono text-[11px] text-gray-500">
          {event.event_type}
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {event.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600 dark:bg-[#2a2724] dark:text-[#d8d0c7]"
            >
              {tag}
            </span>
          ))}
        </div>
      </td>
      <td className="px-3 py-3">
        <span className="block font-medium">
          {event.actor.fullname || event.actor.username}
        </span>
        <span className="block text-xs text-gray-500">
          {event.actor.username}
        </span>
        {event.actor.roles.length > 0 && (
          <div className="mt-1.5">
            <RoleBadges roles={event.actor.roles} />
          </div>
        )}
        {event.source.client_ip && (
          <span className="block font-mono text-[11px] text-gray-500">
            {event.source.client_ip}
          </span>
        )}
      </td>
      <td className="px-3 py-3">
        <span className="block text-xs font-medium capitalize">
          {event.resource.type?.replaceAll("_", " ") || "—"}
        </span>
        <span
          className="block max-w-48 truncate font-mono text-[11px] text-gray-500"
          title={resource || ""}
        >
          {resource || "—"}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="mb-1 flex items-center gap-1.5">
          <span
            className={`size-1.5 rounded-full ${event.outcome === "success" ? "bg-emerald-500" : "bg-red-500"}`}
          />
          <span className="text-xs capitalize">{event.outcome}</span>
          <span className="text-xs text-gray-400">· {event.category}</span>
        </div>
        <details className="text-xs">
          <summary className="cursor-pointer text-brand-primary dark:text-brand-detail">
            View event details
          </summary>
          <div className="mt-2 w-80 space-y-1 rounded-lg bg-gray-50 p-2 text-[11px] dark:bg-[#181818]">
            <Detail label="Request ID" value={event.source.request_id} />
            <Detail
              label="Request"
              value={
                event.source.method && event.source.path
                  ? `${event.source.method} ${event.source.path}`
                  : null
              }
            />
            <Detail label="Provider" value={event.actor.provider} />
            <Detail
              label="Expires"
              value={new Date(event.expires_at).toLocaleDateString()}
            />
            {Object.keys(event.metadata).length > 0 && (
              <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-all rounded bg-gray-100 p-2 dark:bg-[#202020]">
                {JSON.stringify(event.metadata, null, 2)}
              </pre>
            )}
          </div>
        </details>
      </td>
    </tr>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-[5rem_1fr] gap-2">
      <span className="text-gray-500">{label}</span>
      <span className="break-all font-mono">{value}</span>
    </div>
  );
}
