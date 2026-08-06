import { useState } from "react";
import { X, Save, AlertCircle, Loader2 } from "lucide-react";
import { useSession } from "../session-context";
import { updateUserSettings } from "../api";
import { Link } from "react-router-dom";
import { RoleBadges } from "./RoleBadge";

interface UserSettingsModalProps {
  onClose: () => void;
}

export function UserSettingsModal({ onClose }: UserSettingsModalProps) {
  const { session } = useSession();
  const user = session.user;

  const [fullname, setFullname] = useState(user.fullname);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password && password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setSaving(true);
    try {
      const payload: { fullname?: string; password?: string } = {};
      if (fullname && fullname !== user.fullname) {
        payload.fullname = fullname;
      }
      if (password) {
        payload.password = password;
      }

      if (Object.keys(payload).length > 0) {
        await updateUserSettings(payload, session.csrf_token);
        window.location.reload();
      }
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update settings",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl dark:bg-[#202020] border border-neutral-200 dark:border-[#3b3732] overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between border-b border-neutral-100 dark:border-[#3b3732] bg-neutral-50/50 dark:bg-[#202020]/50 px-6 py-4 shrink-0">
          <h2 className="text-xl font-bold text-neutral-800 dark:text-[#f4efe8]">
            User Settings
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-[#2a2724] dark:hover:text-neutral-300 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-6">
          <form
            id="settings-form"
            onSubmit={handleSubmit}
            className="space-y-6"
          >
            {error && (
              <div className="rounded-lg bg-red-50 p-4 border border-red-100 dark:bg-red-900/20 dark:border-red-500/40">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <AlertCircle
                      className="h-5 w-5 text-red-400 dark:text-red-500"
                      aria-hidden="true"
                    />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                      {error}
                    </h3>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-neutral-700 dark:text-[#d8d0c7] mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={user.username}
                disabled
                className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-neutral-500 dark:border-[#3b3732] dark:bg-[#202020]/50 dark:text-[#c7beb4] focus:outline-none cursor-not-allowed"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-neutral-700 dark:text-[#d8d0c7]">
                Application roles
              </label>
              <RoleBadges roles={user.roles} />
            </div>

            <div>
              <label className="block text-sm font-semibold text-neutral-700 dark:text-[#d8d0c7] mb-1.5">
                Full Name
              </label>
              <input
                type="text"
                value={fullname}
                onChange={(e) => setFullname(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-neutral-900 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary dark:border-[#3b3732] dark:bg-[#202020] dark:text-white dark:focus:border-brand-accent-dark dark:focus:ring-brand-accent-dark"
              />
            </div>

            {session.provider === "local" && (
              <>
                <div className="pt-2 border-t border-neutral-100 dark:border-[#3b3732]">
                  <label className="block text-sm font-semibold text-neutral-700 dark:text-[#d8d0c7] mb-1.5">
                    New Password (optional)
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Leave blank to keep current password"
                    className="w-full rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-neutral-900 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary dark:border-[#3b3732] dark:bg-[#202020] dark:text-white dark:focus:border-brand-accent-dark dark:focus:ring-brand-accent-dark"
                  />
                </div>
                {password && (
                  <div>
                    <label className="block text-sm font-semibold text-neutral-700 dark:text-[#d8d0c7] mb-1.5">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      className="w-full rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-neutral-900 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary dark:border-[#3b3732] dark:bg-[#202020] dark:text-white dark:focus:border-brand-accent-dark dark:focus:ring-brand-accent-dark"
                    />
                  </div>
                )}
              </>
            )}

            {user.is_admin && (
              <div className="pt-4 border-t border-neutral-100 dark:border-[#3b3732]">
                <div className="rounded-lg bg-blue-50 p-4 border border-blue-100 dark:bg-blue-900/20 dark:border-blue-900/50">
                  <h4 className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">
                    Administrator Settings
                  </h4>
                  <p className="text-xs text-blue-600 dark:text-blue-300 mb-3">
                    As an administrator, you can change user roles from the
                    Users administration page.
                  </p>
                  <Link
                    to="/admin/users"
                    onClick={onClose}
                    className="inline-flex items-center justify-center rounded-md bg-blue-100 px-3 py-1.5 text-sm font-semibold text-blue-800 hover:bg-blue-200 transition-colors dark:bg-blue-800/40 dark:text-blue-200 dark:hover:bg-blue-800/60"
                  >
                    Manage Roles
                  </Link>
                </div>
              </div>
            )}
          </form>
        </div>

        <div className="border-t border-neutral-100 dark:border-[#3b3732] bg-neutral-50/50 dark:bg-[#202020]/50 px-6 py-4 flex justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-neutral-600 hover:bg-neutral-100 dark:text-[#d8d0c7] dark:hover:bg-[#2a2724]/50 transition-colors"
          >
            Cancel
          </button>
          <button
            form="settings-form"
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Save size={16} />
            )}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
