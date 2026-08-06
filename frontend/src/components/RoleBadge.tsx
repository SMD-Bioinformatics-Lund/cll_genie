import { Crown, Microscope, ShieldCheck } from "lucide-react";
import type { ApplicationRole } from "./roles";

const roleStyles = {
  admin: {
    label: "Admin",
    icon: Crown,
    className:
      "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-400/45 dark:bg-violet-500/20 dark:text-violet-100",
  },
  lymphotrack_admin: {
    label: "LymphoTrack admin",
    icon: ShieldCheck,
    className:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/45 dark:bg-amber-500/20 dark:text-amber-100",
  },
  user: {
    label: "User",
    icon: Microscope,
    className:
      "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/45 dark:bg-sky-500/20 dark:text-sky-100",
  },
} as const;

export function RoleBadge({ role }: { role: string }) {
  const definition = roleStyles[role as ApplicationRole];
  if (!definition) {
    return (
      <span className="inline-flex rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600 dark:border-[#4a433d] dark:bg-[#2a2724] dark:text-[#d8d0c7]">
        {role.replaceAll("_", " ")}
      </span>
    );
  }
  const Icon = definition.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${definition.className}`}
    >
      <Icon size={12} aria-hidden="true" />
      {definition.label}
    </span>
  );
}

export function RoleBadges({ roles }: { roles: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {roles.map((role) => (
        <RoleBadge key={role} role={role} />
      ))}
    </div>
  );
}
