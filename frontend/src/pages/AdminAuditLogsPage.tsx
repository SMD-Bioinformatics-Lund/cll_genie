import { useQuery } from "@tanstack/react-query";
import { RefreshCw, ScrollText } from "lucide-react";
import { apiRequest } from "../api";

type AuditLogPayload = {
  items: string[];
  source: string;
};

export function AdminAuditLogsPage() {
  const query = useQuery({
    queryKey: ["admin-audit-logs"],
    queryFn: () =>
      apiRequest<AuditLogPayload>("/api/v1/admin/audit-logs?limit=500"),
    refetchInterval: 30_000,
  });

  return (
    <section className="mx-auto w-full max-w-screen-2xl p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ScrollText
              className="text-[#7B4925] dark:text-[#DF7849]"
              size={24}
            />
            <h1 className="text-2xl font-bold">Audit logs</h1>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Security and administrative events recorded by CLL Genie.
          </p>
        </div>
        <button
          type="button"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
          className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#7B4925] px-3 text-sm font-semibold text-[#7B4925] transition hover:bg-[#7B4925]/10 disabled:opacity-50 dark:border-[#DF7849] dark:text-[#DF7849]"
        >
          <RefreshCw
            size={16}
            className={query.isFetching ? "animate-spin" : ""}
          />
          Refresh
        </button>
      </div>

      {query.isError && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
        >
          {query.error instanceof Error
            ? query.error.message
            : "Could not load audit logs"}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-800">
        <div className="border-b border-gray-200 px-4 py-2 text-xs text-gray-500 dark:border-neutral-700 dark:text-gray-400">
          {query.data?.source ?? "Loading audit log..."}
        </div>
        <div className="max-h-[calc(100vh-15rem)] overflow-auto">
          {query.isLoading ? (
            <div className="flex justify-center p-10">
              <span className="size-6 animate-spin rounded-full border-2 border-gray-300 border-t-[#7B4925]" />
            </div>
          ) : query.data?.items.length ? (
            <ol className="divide-y divide-gray-100 dark:divide-neutral-700">
              {query.data.items.map((line, index) => (
                <li
                  key={`${index}-${line}`}
                  className="px-4 py-2 font-mono text-xs leading-5 text-gray-700 dark:text-gray-200"
                >
                  {line}
                </li>
              ))}
            </ol>
          ) : (
            <p className="p-10 text-center text-sm text-gray-500 dark:text-gray-400">
              No audit events have been recorded.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
