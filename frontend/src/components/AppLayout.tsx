import {
  ClipboardList,
  FileText,
  LogOut,
  Settings,
  ScrollText,
  Users,
  Menu,
} from "lucide-react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useSession } from "../session-context";
import { Brand } from "./Brand";
import { ThemeControl } from "./ThemeControl";
import { useState } from "react";
import packageJson from "../../package.json";
import { UserSettingsModal } from "./UserSettingsModal";

export function AppLayout() {
  const { session, signOut } = useSession();
  const location = useLocation();
  const admin = session.user.is_admin;
  const [isExpanded, setIsExpanded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const links = [
    { to: "/", label: "Worklist", icon: ClipboardList },
    { to: "/reports", label: "Reports", icon: FileText },
    ...(admin
      ? [
          { to: "/admin/rules", label: "Report rules", icon: Settings },
          { to: "/admin/users", label: "Users", icon: Users },
          { to: "/admin/audit-logs", label: "Audit logs", icon: ScrollText },
        ]
      : []),
  ];

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-neutral-900 text-gray-900 dark:text-gray-100">
      {/* Top App Bar */}
      <header className="fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between border-brand-primary-hover bg-brand-primary px-4 shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex size-10 items-center justify-center rounded-full text-white/90 hover:bg-white/10 hover:text-white transition"
          >
            <Menu size={24} />
          </button>
          <Brand inverse={true} />
        </div>

        <div className="flex items-center gap-2 sm:gap-4 relative">
          <ThemeControl />
          <div className="flex items-center gap-3">
            <span className="hidden md:inline-block text-sm font-medium text-white">
              {session.user.fullname || session.user.username}
            </span>
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-2 hover:bg-white/10 p-1 rounded-full transition relative"
            >
              <div className="flex size-9 items-center justify-center rounded-full bg-white/20 text-sm font-bold text-white border border-white/10 shadow-inner">
                {(session.user.fullname ||
                  session.user.username)[0]?.toUpperCase()}
              </div>
            </button>
          </div>

          {showDropdown && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowDropdown(false)}
              ></div>
              <div className="absolute right-0 top-12 z-50 w-48 rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 dark:bg-neutral-800 dark:ring-neutral-700">
                <button
                  onClick={() => {
                    setShowDropdown(false);
                    setShowSettings(true);
                  }}
                  className="flex w-full items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-neutral-700"
                >
                  <Settings size={16} className="mr-2" />
                  Settings
                </button>
                <button
                  onClick={() => {
                    setShowDropdown(false);
                    signOut();
                  }}
                  className="flex w-full items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-neutral-700"
                >
                  <LogOut size={16} className="mr-2" />
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 top-16 z-40 flex flex-col border-brand-primary-hover bg-brand-primary transition-all duration-300 shadow-sm ${
          isExpanded ? "w-50" : "w-16"
        }`}
      >
        <nav className="flex-1 space-y-1 p-2">
          {links.map(({ to, label, icon: Icon }) => {
            const isActive = location.pathname === to;
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-2 rounded-xl text-sm p-1.5 transition-colors ${
                  isActive
                    ? "bg-white/20 text-white font-semibold shadow-inner"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                } ${isExpanded ? "justify-start" : "justify-center"}`}
                title={!isExpanded ? label : undefined}
              >
                <Icon size={20} className="shrink-0" />
                {isExpanded && <span className="truncate">{label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-3">
          {isExpanded ? (
            <div className="flex flex-col overflow-hidden text-sm px-1">
              <span className="truncate font-semibold text-white whitespace-pre-wrap break-words leading-tight">
                {session.user.fullname || session.user.username}
              </span>
              <span className="truncate text-xs text-white/60 mt-0.5">
                CLL Genie v{packageJson.version}
              </span>
            </div>
          ) : (
            <div className="flex justify-center">
              <span
                className="text-[10px] font-bold text-white/60 tracking-tighter"
                title={`CLL Genie v${packageJson.version}`}
              >
                v{packageJson.version}
              </span>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main
        className={`min-w-0 flex-1 pt-16 transition-all duration-300 ${
          isExpanded ? "ml-56" : "ml-16"
        }`}
      >
        <div className="h-full w-full">
          <Outlet />
        </div>
      </main>

      {showSettings && (
        <UserSettingsModal onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
