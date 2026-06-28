import {
  Alert,
  Box,
  Button,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Paper,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { Pencil, Save, UserPlus, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiRequest } from "../api";
import { useSession } from "../session-context";
import { useSortableTable } from "../hooks/useSortableTable";
import { SortableTableHead } from "../components/SortableTableHead";

type AdminUser = {
  _id: string;
  fullname: string;
  email?: string;
  roles: string[];
  groups: string[];
  enabled?: boolean;
};
const initial = {
  username: "",
  fullname: "",
  email: "",
  roles: "admin",
  groups: "lymphotrack",
  password: "",
  enabled: true,
};

export function AdminUsersPage() {
  const { session } = useSession();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string>();
  const [form, setForm] = useState(initial);
  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => apiRequest<AdminUser[]>("/api/v1/admin/users"),
  });
  const { sortedData, sortKey, sortOrder, requestSort } = useSortableTable(
    users.data,
    "_id",
    "asc"
  );
  const save = useMutation({
    mutationFn: () => {
      const payload = {
        fullname: form.fullname,
        email: form.email || null,
        roles: form.roles
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        groups: form.groups
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        password: form.password || null,
        enabled: form.enabled,
      };
      return apiRequest(
        editing ? `/api/v1/admin/users/${editing}` : "/api/v1/admin/users",
        {
          method: editing ? "PATCH" : "POST",
          body: JSON.stringify(
            editing ? payload : { ...payload, username: form.username },
          ),
        },
        session.csrf_token,
      );
    },
    onSuccess: () => {
      setOpen(false);
      setEditing(undefined);
      setForm(initial);
      client.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });
  const edit = (user: AdminUser) => {
    setEditing(user._id);
    setForm({
      username: user._id,
      fullname: user.fullname,
      email: user.email ?? "",
      roles: user.roles?.join(", ") ?? "",
      groups: user.groups?.join(", ") ?? "",
      password: "",
      enabled: user.enabled !== false,
    });
    setOpen(true);
  };
  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box className="page-heading">
        <div>
          <Typography variant="overline" color="primary" fontWeight={800}>
            Administration
          </Typography>
          <Typography variant="h3">Users</Typography>
        </div>
        <Button
          variant="contained"
          startIcon={<UserPlus size={18} />}
          onClick={() => {
            setEditing(undefined);
            setForm(initial);
            setOpen(true);
          }}
        >
          Add user
        </Button>
      </Box>
      <Alert severity="info" sx={{ my: 3 }}>
        LDAP authenticates passwords only. Full name, groups, and
        enabled state always come from this local user object.
      </Alert>
      <Paper className="data-panel" elevation={0}>
        <div className="responsive-table">
          <table>
            <thead>
              <tr>
                <SortableTableHead label="Username" sortKey="_id" currentSortKey={sortKey as string} currentSortOrder={sortOrder} onRequestSort={requestSort} />
                <SortableTableHead label="Full name" sortKey="fullname" currentSortKey={sortKey as string} currentSortOrder={sortOrder} onRequestSort={requestSort} />
                <SortableTableHead label="Email" sortKey="email" currentSortKey={sortKey as string} currentSortOrder={sortOrder} onRequestSort={requestSort} />
                <th>Roles</th>
                <th>Groups</th>
                <SortableTableHead label="Status" sortKey="enabled" currentSortKey={sortKey as string} currentSortOrder={sortOrder} onRequestSort={requestSort} />
                <th />
              </tr>
            </thead>
            <tbody>
              {sortedData.map((user: AdminUser) => (
                <tr key={user._id}>
                  <td>{user._id}</td>
                  <td>{user.fullname}</td>
                  <td>{user.email || "–"}</td>
                  <td>{user.roles?.join(", ")}</td>
                  <td>{user.groups?.join(", ")}</td>
                  <td>{user.enabled !== false ? "Enabled" : "Disabled"}</td>
                  <td>
                    <Button
                      startIcon={<Pencil size={15} />}
                      onClick={() => edit(user)}
                    >
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Paper>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          {editing ? "Edit user" : "Add local application user"}
        </DialogTitle>
        <DialogContent>
          <TextField
            disabled={Boolean(editing)}
            label="Username"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            sx={{ mt: 1, mb: 2 }}
          />
          <TextField
            label="Full name"
            value={form.fullname}
            onChange={(e) => setForm({ ...form, fullname: e.target.value })}
            sx={{ mb: 2 }}
          />
          <TextField
            label="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            sx={{ mb: 2 }}
          />
          <TextField
            label="Roles (comma separated)"
            value={form.roles}
            onChange={(e) => setForm({ ...form, roles: e.target.value })}
            sx={{ mb: 2 }}
          />
          <TextField
            label="Groups (comma separated)"
            value={form.groups}
            onChange={(e) => setForm({ ...form, groups: e.target.value })}
            sx={{ mb: 2 }}
          />
          <TextField
            label={
              editing
                ? "New local password (leave empty to retain)"
                : "Local password (optional for LDAP-only users)"
            }
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <FormControlLabel
            control={
              <Switch
                checked={form.enabled}
                onChange={(_, checked) =>
                  setForm({ ...form, enabled: checked })
                }
              />
            }
            label="Enabled"
          />
          {save.error && <Alert severity="error">{save.error.message}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button startIcon={<X size={15} />} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            startIcon={<Save size={15} />}
            onClick={() => save.mutate()}
            disabled={!form.username || !form.fullname}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
