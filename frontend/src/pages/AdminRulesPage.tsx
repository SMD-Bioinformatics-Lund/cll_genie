import {
  Alert,
  Box,
  Button,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  TextField,
  Typography,
} from "../components/ui";
import { FlaskConical, Pencil, Plus, Save, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RuleBuilder, VisualCondition, parseAstToVisual, buildAstFromVisual } from "./RuleBuilder";
import { useSortableTable } from "../hooks/useSortableTable";
import { SortableTableHead } from "../components/SortableTableHead";

import { apiRequest } from "../api";
import { useSession } from "../session-context";

type Rule = {
  _id: string;
  rule_key: string;
  version: number;
  status: string;
  report_type: string;
  language: string;
  section: string;
  priority: number;
  exclusive_group?: string | null;
  condition: object;
  template: { text: string };
};

const initial = {
  rule_key: "",
  version: 1,
  status: "DRAFT",
  report_type: "CLL_IGHV",
  language: "sv-SE",
  section: "conclusion",
  priority: 100,
  exclusive_group: null as string | null,
  condition: {} as any,
  template: "",
};

export function AdminRulesPage() {
  const { session } = useSession();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const [form, setForm] = useState(initial);
  const [visualConditions, setVisualConditions] = useState<VisualCondition[]>([]);
  const [simulation, setSimulation] = useState<string>();
  const rules = useQuery({
    queryKey: ["admin-rules"],
    queryFn: () => apiRequest<Rule[]>("/api/v1/admin/rules"),
  });
  const { sortedData, sortKey, sortOrder, requestSort } = useSortableTable(
    rules.data,
    "rule_key",
    "asc"
  );
  const body = () => ({
    ...form,
    condition: buildAstFromVisual(visualConditions),
    template: { engine: "restricted_format_v1", text: form.template },
    metadata: {},
  });
  const save = useMutation({
    mutationFn: () =>
      apiRequest(
        editingId ? `/api/v1/admin/rules/${editingId}` : "/api/v1/admin/rules",
        { method: editingId ? "PUT" : "POST", body: JSON.stringify(body()) },
        session.csrf_token,
      ),
    onSuccess: () => {
      setOpen(false);
      setEditingId(undefined);
      setForm(initial);
      client.invalidateQueries({ queryKey: ["admin-rules"] });
    },
  });
  const simulate = useMutation({
    mutationFn: () =>
      apiRequest<{ matched: boolean; text: string }>(
        "/api/v1/admin/rules/simulate",
        { method: "POST", body: JSON.stringify(body()) },
        session.csrf_token,
      ),
    onSuccess: (value) =>
      setSimulation(value.matched ? value.text : "Rule did not match."),
  });
  const edit = (rule: Rule) => {
    setEditingId(rule._id);
    setForm({
      rule_key: rule.rule_key,
      version: rule.version,
      status: rule.status,
      report_type: rule.report_type,
      language: rule.language,
      section: rule.section,
      priority: rule.priority,
      exclusive_group: rule.exclusive_group ?? null,
      condition: {}, // Unused now
      template: rule.template.text,
    });
    setVisualConditions(parseAstToVisual(rule.condition));
    setSimulation(undefined);
    setOpen(true);
  };
  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box className="page-heading">
        <div>
          <Typography variant="overline" color="primary" fontWeight={800}>
            Administration
          </Typography>
          <Typography variant="h3">Report rules</Typography>
        </div>
        <Button
          variant="contained"
          startIcon={<Plus size={18} />}
          onClick={() => {
            setEditingId(undefined);
            setForm(initial);
            setVisualConditions(parseAstToVisual(initial.condition));
            setOpen(true);
          }}
        >
          New rule
        </Button>
      </Box>
      <Alert severity="info" sx={{ my: 3 }}>
        Active rules generate report text in priority order. Simulate and review
        changes before activation.
      </Alert>
      <Paper className="data-panel" elevation={0}>
        <div className="responsive-table">
          <table>
            <thead>
              <tr>
                <th>Rule</th>
                <th>Version</th>
                <th>Section</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Template</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sortedData.map((rule) => (
                <tr key={rule._id}>
                  <td>{rule.rule_key}</td>
                  <td>{rule.version}</td>
                  <td>{rule.section}</td>
                  <td>{rule.priority}</td>
                  <td>{rule.status}</td>
                  <td className="truncate-cell">{rule.template.text}</td>
                  <td>
                    <Button
                      startIcon={<Pencil size={15} />}
                      onClick={() => edit(rule)}
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
        maxWidth="md"
      >
        <DialogTitle>
          {editingId ? "Edit report rule" : "Create report rule"}
        </DialogTitle>
        <DialogContent>
          <div className="form-grid" style={{ marginTop: 8 }}>
            <TextField
              label="Rule key"
              value={form.rule_key}
              onChange={(e) => setForm({ ...form, rule_key: e.target.value })}
            />
            <TextField
              select
              label="Section"
              value={form.section}
              onChange={(e) => setForm({ ...form, section: e.target.value })}
            >
              <MenuItem value="conclusion">Conclusion</MenuItem>
              <MenuItem value="mutation">Mutation</MenuItem>
              <MenuItem value="clinical">Clinical</MenuItem>
              <MenuItem value="rearrangement">Rearrangement</MenuItem>
              <MenuItem value="intro">Intro</MenuItem>
            </TextField>
            <TextField
              label="Priority"
              type="number"
              value={form.priority}
              onChange={(e) =>
                setForm({ ...form, priority: Number(e.target.value) })
              }
            />
            <TextField
              select
              label="Status"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <MenuItem value="DRAFT">Draft</MenuItem>
              <MenuItem value="ACTIVE">Active</MenuItem>
              <MenuItem value="RETIRED">Retired</MenuItem>
            </TextField>
          </div>
          <RuleBuilder conditions={visualConditions} onChange={setVisualConditions} />
          <TextField
            label="Text template"
            multiline
            minRows={5}
            value={form.template}
            onChange={(e) => setForm({ ...form, template: e.target.value })}
            sx={{ mt: 2 }}
          />
          {simulation && (
            <Alert severity="info" sx={{ mt: 2 }}>
              {simulation}
            </Alert>
          )}
          {(save.error || simulate.error) && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {save.error?.message || simulate.error?.message}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            startIcon={<FlaskConical size={15} />}
            onClick={() => simulate.mutate()}
          >
            Simulate
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button startIcon={<X size={15} />} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            startIcon={<Save size={15} />}
            onClick={() => save.mutate()}
            disabled={!form.rule_key || !form.template}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
