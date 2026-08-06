import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  KeyRound,
  Pencil,
  Save,
  Search,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { apiRequest } from "../api";
import { IdentityBadge } from "../components/IdentityBadge";
import { RoleBadge, RoleBadges } from "../components/RoleBadge";
import { applicationRoles, type ApplicationRole } from "../components/roles";
import { SortableTableHead } from "../components/SortableTableHead";
import {
  Alert,
  Box,
  Button,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  Pagination,
  Paper,
  Switch,
  TextField,
  Typography,
} from "../components/ui";
import { useSortableTable } from "../hooks/useSortableTable";
import { useSession } from "../session-context";
import { timeAgo } from "../dateUtils";
import type { PaginatedPayload } from "../types";

type LoginMethod = "ldap" | "local";

type AdminUser = {
  _id: string;
  username: string;
  fullname: string;
  firstname?: string;
  lastname?: string;
  email?: string;
  roles: string[];
  allowed_login_methods: LoginMethod[];
  last_login?: string | null;
  enabled?: boolean;
};

type UserForm = {
  username: string;
  fullname: string;
  firstname: string;
  lastname: string;
  email: string;
  roles: ApplicationRole[];
  allowed_login_methods: LoginMethod[];
  password: string;
  confirmPassword: string;
  enabled: boolean;
};

const initial: UserForm = {
  username: "",
  fullname: "",
  firstname: "",
  lastname: "",
  email: "",
  roles: ["user"],
  allowed_login_methods: ["ldap"],
  password: "",
  confirmPassword: "",
  enabled: true,
};

const PAGE_SIZE = 25;

export function AdminUsersPage() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser>();
  const [form, setForm] = useState<UserForm>(initial);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const users = useQuery({
    queryKey: ["admin-users", search, page],
    queryFn: () => {
      const params = new URLSearchParams({
        search,
        page: String(page),
        page_size: String(PAGE_SIZE),
      });
      return apiRequest<PaginatedPayload<AdminUser>>(
        `/api/v1/admin/users?${params}`,
      );
    },
  });
  const { sortedData, sortKey, sortOrder, requestSort } = useSortableTable(
    users.data?.items,
    "username",
    "asc",
  );
  const total = users.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const validationError = validateUserForm(form, editingUser);
  const save = useMutation({
    mutationFn: () => {
      if (validationError) throw new Error(validationError);
      const payload = {
        fullname: form.fullname.trim(),
        firstname: form.firstname.trim(),
        lastname: form.lastname.trim(),
        email: form.email.trim(),
        roles: form.roles,
        allowed_login_methods: form.allowed_login_methods,
        password:
          form.allowed_login_methods.includes("local") && form.password
            ? form.password
            : null,
        enabled: form.enabled,
      };
      return apiRequest(
        editingUser
          ? `/api/v1/admin/users/${editingUser.username}`
          : "/api/v1/admin/users",
        {
          method: editingUser ? "PATCH" : "POST",
          body: JSON.stringify(
            editingUser
              ? payload
              : { ...payload, username: form.username.trim() },
          ),
        },
        session.csrf_token,
      );
    },
    onSuccess: () => {
      closeDialog();
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });

  function closeDialog() {
    setOpen(false);
    setEditingUser(undefined);
    setForm(initial);
    save.reset();
  }

  function edit(user: AdminUser) {
    setEditingUser(user);
    setForm({
      username: user.username,
      fullname: user.fullname,
      firstname: user.firstname ?? "",
      lastname: user.lastname ?? "",
      email: user.email ?? "",
      roles: user.roles.filter((role): role is ApplicationRole =>
        applicationRoles.some((definition) => definition.id === role),
      ),
      allowed_login_methods: user.allowed_login_methods,
      password: "",
      confirmPassword: "",
      enabled: user.enabled !== false,
    });
    setOpen(true);
  }

  function toggleRole(role: ApplicationRole) {
    setForm((current) => ({
      ...current,
      roles: current.roles.includes(role)
        ? current.roles.filter((item) => item !== role)
        : [...current.roles, role],
    }));
  }

  function toggleLoginMethod(method: LoginMethod) {
    setForm((current) => ({
      ...current,
      allowed_login_methods: current.allowed_login_methods.includes(method)
        ? current.allowed_login_methods.filter((item) => item !== method)
        : [
            ...current.allowed_login_methods.filter((item) => item !== method),
            method,
          ].sort((left) => (left === "ldap" ? -1 : 1)),
      password:
        method === "local" && current.allowed_login_methods.includes("local")
          ? ""
          : current.password,
      confirmPassword:
        method === "local" && current.allowed_login_methods.includes("local")
          ? ""
          : current.confirmPassword,
    }));
  }

  return (
    <Container maxWidth="xl" className="py-8">
      <Box className="page-heading">
        <div>
          <Typography variant="overline" color="primary" fontWeight={800}>
            Administration
          </Typography>
          <Typography variant="h3">Users</Typography>
        </div>
        <Button
          variant="contained"
          startIcon={<UserPlus size={17} />}
          onClick={() => {
            setEditingUser(undefined);
            setForm(initial);
            setOpen(true);
          }}
        >
          Add user
        </Button>
      </Box>

      <Alert severity="info" className="my-6">
        LDAP is the primary identity source. Every account still has a local CLL
        Genie profile for roles, access state, and audit attribution.
      </Alert>

      <Paper className="data-panel">
        <Box className="toolbar-row">
          <Typography variant="body2" color="text.secondary">
            {total} {total === 1 ? "user" : "users"}
          </Typography>
          <TextField
            size="small"
            placeholder="Search users"
            aria-label="Search users"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            sx={{ maxWidth: 420 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={17} />
                </InputAdornment>
              ),
            }}
          />
        </Box>
        <div className="responsive-table">
          <table>
            <thead>
              <tr>
                <SortableTableHead
                  label="Username"
                  sortKey="username"
                  currentSortKey={sortKey as string}
                  currentSortOrder={sortOrder}
                  onRequestSort={requestSort}
                />
                <SortableTableHead
                  label="Full name"
                  sortKey="fullname"
                  currentSortKey={sortKey as string}
                  currentSortOrder={sortOrder}
                  onRequestSort={requestSort}
                />
                <SortableTableHead
                  label="Email"
                  sortKey="email"
                  currentSortKey={sortKey as string}
                  currentSortOrder={sortOrder}
                  onRequestSort={requestSort}
                />
                <th>Login methods</th>
                <SortableTableHead
                  label="Last login"
                  sortKey="last_login"
                  currentSortKey={sortKey as string}
                  currentSortOrder={sortOrder}
                  onRequestSort={requestSort}
                />
                <th>Roles</th>
                <SortableTableHead
                  label="Status"
                  sortKey="enabled"
                  currentSortKey={sortKey as string}
                  currentSortOrder={sortOrder}
                  onRequestSort={requestSort}
                />
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {sortedData.map((user: AdminUser) => (
                <tr key={user._id}>
                  <td className="font-medium">{user.username}</td>
                  <td>{user.fullname}</td>
                  <td>{user.email || "–"}</td>
                  <td>
                    <span className="flex flex-wrap gap-1">
                      {user.allowed_login_methods.map((method) => (
                        <IdentityBadge key={method} provider={method} />
                      ))}
                    </span>
                  </td>
                  <td
                    title={
                      user.last_login
                        ? new Date(user.last_login).toLocaleString()
                        : "No successful login recorded"
                    }
                  >
                    {user.last_login ? timeAgo(user.last_login) : "Never"}
                  </td>
                  <td>
                    <RoleBadges roles={user.roles ?? []} />
                  </td>
                  <td>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${user.enabled !== false ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" : "bg-gray-100 text-gray-600 dark:bg-[#2a2724] dark:text-[#d8d0c7]"}`}
                    >
                      <span
                        className={`size-1.5 rounded-full ${user.enabled !== false ? "bg-emerald-500" : "bg-gray-400"}`}
                      />
                      {user.enabled !== false ? "Enabled" : "Disabled"}
                    </span>
                  </td>
                  <td>
                    <Button
                      variant="outlined"
                      startIcon={<Pencil size={14} />}
                      onClick={() => edit(user)}
                    >
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
              {!sortedData.length && (
                <tr>
                  <td colSpan={8} className="empty-cell">No users found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Box className="flex items-center justify-between p-4">
          <Typography variant="body2" color="text.secondary">
            Page {Math.min(page, pageCount)} of {pageCount}
          </Typography>
          <Pagination page={page} count={pageCount} onChange={(_, value) => setPage(value)} />
        </Box>
      </Paper>

      <Dialog open={open} onClose={closeDialog} fullWidth maxWidth="md">
        <DialogTitle className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-brand-primary/10 text-brand-primary dark:bg-brand-detail/15 dark:text-brand-detail">
            {editingUser ? <Pencil size={17} /> : <UserPlus size={18} />}
          </span>
          <span>
            <span className="block text-base font-semibold">
              {editingUser ? `Edit ${editingUser.username}` : "Add user"}
            </span>
            <span className="block text-xs font-normal text-gray-500 dark:text-[#c7beb4]">
              Configure identity, profile information, and application access.
            </span>
          </span>
        </DialogTitle>

        <DialogContent className="max-h-[70vh] overflow-y-auto !space-y-6">
          <FormSection
            title="Allowed login methods"
            icon={<Users size={16} />}
            description="LDAP is primary. Select local as well to allow either login method."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <IdentityOption
                provider="ldap"
                selected={form.allowed_login_methods.includes("ldap")}
                onSelect={toggleLoginMethod}
              />
              <IdentityOption
                provider="local"
                selected={form.allowed_login_methods.includes("local")}
                onSelect={toggleLoginMethod}
              />
            </div>
          </FormSection>

          <FormSection
            title="User profile"
            description="This local profile controls display information and audit attribution."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                disabled={Boolean(editingUser)}
                label="Username"
                value={form.username}
                onChange={(event) =>
                  setForm({ ...form, username: event.target.value })
                }
                required
              />
              <TextField
                label="Email"
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm({ ...form, email: event.target.value })
                }
                required
                helperText={
                  form.allowed_login_methods.includes("ldap")
                    ? "Must match the LDAP directory email."
                    : undefined
                }
              />
              <TextField
                label="First name"
                value={form.firstname}
                onChange={(event) =>
                  setForm({ ...form, firstname: event.target.value })
                }
                required
              />
              <TextField
                label="Last name"
                value={form.lastname}
                onChange={(event) =>
                  setForm({ ...form, lastname: event.target.value })
                }
                required
              />
              <TextField
                label="Full display name"
                value={form.fullname}
                onChange={(event) =>
                  setForm({ ...form, fullname: event.target.value })
                }
                required
                className="sm:col-span-2"
              />
            </div>
          </FormSection>

          <FormSection
            title="Application roles"
            description="Assign one or more roles. Permissions are combined; admin grants every application permission."
          >
            <div className="grid gap-2 sm:grid-cols-3">
              {applicationRoles.map((role) => {
                const selected = form.roles.includes(role.id);
                return (
                  <button
                    type="button"
                    key={role.id}
                    onClick={() => toggleRole(role.id)}
                    aria-pressed={selected}
                    className={`relative rounded-xl border p-3 text-left transition ${selected ? "border-brand-primary bg-brand-primary/5 ring-1 ring-brand-primary/30 dark:border-brand-detail dark:bg-brand-detail/10" : "border-gray-200 hover:border-gray-300 dark:border-[#3b3732] dark:hover:border-[#5b5149]"}`}
                  >
                    <span
                      className={`absolute right-3 top-3 grid size-5 place-items-center rounded border ${selected ? "border-brand-primary bg-brand-primary text-white dark:border-brand-detail dark:bg-brand-detail dark:text-neutral-950" : "border-gray-300 dark:border-[#4a433d]"}`}
                    >
                      {selected && <Check size={13} strokeWidth={3} />}
                    </span>
                    <RoleBadge role={role.id} />
                    <span className="mt-2 block pr-5 text-xs leading-5 text-gray-500 dark:text-[#c7beb4]">
                      {role.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </FormSection>

          {form.allowed_login_methods.includes("local") && (
            <FormSection
              title="Local password"
              icon={<KeyRound size={16} />}
              description={
                editingUser?.allowed_login_methods.includes("local")
                  ? "Leave both fields empty to retain the existing password."
                  : "A password is required when creating or converting to a local account."
              }
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label={
                    editingUser?.allowed_login_methods.includes("local")
                      ? "New password"
                      : "Password"
                  }
                  type="password"
                  inputProps={{ "aria-label": "Password" }}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(event) =>
                    setForm({ ...form, password: event.target.value })
                  }
                  helperText="At least 8 characters."
                />
                <TextField
                  label="Confirm password"
                  type="password"
                  inputProps={{ "aria-label": "Confirm password" }}
                  autoComplete="new-password"
                  value={form.confirmPassword}
                  onChange={(event) =>
                    setForm({ ...form, confirmPassword: event.target.value })
                  }
                  error={Boolean(
                    form.confirmPassword &&
                    form.password !== form.confirmPassword,
                  )}
                  helperText={
                    form.confirmPassword &&
                    form.password !== form.confirmPassword
                      ? "Passwords do not match."
                      : "Enter the same password again."
                  }
                />
              </div>
            </FormSection>
          )}

          <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-[#3b3732] dark:bg-[#181818]/50">
            <div>
              <div className="text-sm font-semibold">Account enabled</div>
              <div className="mt-0.5 text-xs text-gray-500 dark:text-[#c7beb4]">
                Disabled users cannot authenticate with either identity source.
              </div>
            </div>
            <Switch
              checked={form.enabled}
              onChange={(_, checked) => setForm({ ...form, enabled: checked })}
            />
          </div>

          {save.error && <Alert severity="error">{save.error.message}</Alert>}
          {!save.error && validationError && (
            <Alert severity="warning">{validationError}</Alert>
          )}
        </DialogContent>

        <DialogActions>
          <Button startIcon={<X size={14} />} onClick={closeDialog}>
            Cancel
          </Button>
          <Button
            variant="contained"
            startIcon={<Save size={14} />}
            onClick={() => save.mutate()}
            disabled={Boolean(validationError) || save.isPending}
          >
            {save.isPending
              ? "Saving…"
              : editingUser
                ? "Save changes"
                : "Create user"}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

function validateUserForm(
  form: UserForm,
  editingUser?: AdminUser,
): string | null {
  if (
    ![
      form.username,
      form.fullname,
      form.firstname,
      form.lastname,
      form.email,
    ].every((value) => value.trim())
  )
    return "Complete all required profile fields.";
  if (!form.roles.length) return "Select at least one application role.";
  if (!form.allowed_login_methods.length)
    return "Select at least one login method.";
  if (!form.allowed_login_methods.includes("local")) return null;
  const passwordRequired =
    !editingUser || !editingUser.allowed_login_methods.includes("local");
  if (passwordRequired && !form.password)
    return "Set a password for the local account.";
  if (form.password && form.password.length < 8)
    return "The local password must contain at least 8 characters.";
  if (form.password !== form.confirmPassword)
    return "The password confirmation does not match.";
  return null;
}

function IdentityOption({
  provider,
  selected,
  onSelect,
}: {
  provider: LoginMethod;
  selected: boolean;
  onSelect: (provider: LoginMethod) => void;
}) {
  const ldap = provider === "ldap";
  return (
    <button
      type="button"
      onClick={() => onSelect(provider)}
      aria-pressed={selected}
      className={`flex items-start gap-3 rounded-xl border p-4 text-left transition ${selected ? "border-brand-primary bg-brand-primary/5 ring-1 ring-brand-primary/30 dark:border-brand-detail dark:bg-brand-detail/10" : "border-gray-200 hover:border-gray-300 dark:border-[#3b3732]"}`}
    >
      <span
        className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded border ${selected ? "border-brand-primary bg-brand-primary text-white dark:border-brand-detail dark:bg-brand-detail dark:text-neutral-950" : "border-gray-300 dark:border-[#4a433d]"}`}
      >
        {selected && <Check size={13} strokeWidth={3} />}
      </span>
      <span>
        <IdentityBadge provider={provider} />
        <span className="mt-2 block text-xs leading-5 text-gray-500 dark:text-[#c7beb4]">
          {ldap
            ? "Authenticate using organization credentials and directory email."
            : "Authenticate using a password stored in the CLL Genie user profile."}
        </span>
      </span>
    </button>
  );
}

function FormSection({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-start gap-2">
        {icon && (
          <span className="mt-0.5 text-brand-primary dark:text-brand-detail">
            {icon}
          </span>
        )}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-[#f4efe8]">
            {title}
          </h3>
          {description && (
            <p className="mt-0.5 text-xs text-gray-500 dark:text-[#c7beb4]">
              {description}
            </p>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}
