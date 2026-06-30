import { Building2, HardDrive } from "lucide-react";

export function IdentityBadge({ provider }: { provider: "ldap" | "local" }) {
  const ldap = provider === "ldap";
  const Icon = ldap ? Building2 : HardDrive;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${
        ldap
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
          : "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
      }`}
    >
      <Icon size={12} aria-hidden="true" />
      {ldap ? "LDAP" : "Local"}
    </span>
  );
}
