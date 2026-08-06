import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  LinearProgress,
  Paper,
  Switch,
  Typography,
} from "../components/ui";
import { Play, Power, RefreshCcw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getTaskControls, runIngestionNow, updateTaskControl } from "../api";
import { timeAgo } from "../dateUtils";
import { useSession } from "../session-context";

export function AdminOperationsPage() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const controls = useQuery({
    queryKey: ["admin-task-controls"],
    queryFn: getTaskControls,
  });

  const updateControl = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      updateTaskControl(key, enabled, session.csrf_token),
    onSuccess: (control) => {
      queryClient.invalidateQueries({ queryKey: ["admin-task-controls"] });
      queryClient.invalidateQueries({ queryKey: ["system_status"] });
      toast.success(`${control.label} ${control.enabled ? "enabled" : "disabled"}`);
    },
    onError: (error: Error) => {
      toast.error(`Could not update task control: ${error.message}`);
    },
  });

  const queueIngestion = useMutation({
    mutationFn: () => runIngestionNow(session.csrf_token),
    onSuccess: () => {
      toast.success("Ingestion queued");
    },
    onError: (error: Error) => {
      toast.error(`Could not queue ingestion: ${error.message}`);
    },
  });

  const ingestion = controls.data?.find(
    (control) => control.key === "automated_ingestion",
  );

  return (
    <Container maxWidth="xl" className="py-8">
      <Typography variant="overline" color="primary.main" fontWeight={800}>
        Administration
      </Typography>
      <Typography variant="h3" component="h1" className="my-1">
        Operations
      </Typography>
      <Typography color="text.secondary" className="mb-6 text-[14px]">
        Control scheduled ingestion and worker-backed analysis without restarting
        containers.
      </Typography>

      {controls.isLoading && <LinearProgress />}
      {controls.error && (
        <Alert severity="error" className="mb-4">
          {(controls.error as Error).message}
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {(controls.data ?? []).map((control) => (
          <Paper key={control.key} className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Power size={18} className="text-brand-primary dark:text-brand-detail" />
                  <Typography variant="h5">{control.label}</Typography>
                  <Chip
                    size="small"
                    color={control.enabled ? "success" : "warning"}
                    label={control.enabled ? "Enabled" : "Disabled"}
                  />
                </div>
                <Typography color="text.secondary" className="max-w-2xl">
                  {control.description}
                </Typography>
                <Typography color="text.secondary" className="mt-3 text-xs">
                  Last changed{" "}
                  {control.updated_at
                    ? `${timeAgo(control.updated_at)} by ${control.updated_by || "unknown"}`
                    : "not yet"}
                </Typography>
                <div className="mt-4 grid gap-2 text-xs text-gray-600 dark:text-[#c7beb4] sm:grid-cols-2">
                  <div>
                    <span className="font-semibold text-gray-800 dark:text-[#e8dfd5]">
                      Last status:
                    </span>{" "}
                    {control.last_status || "No task run recorded"}
                  </div>
                  <div>
                    <span className="font-semibold text-gray-800 dark:text-[#e8dfd5]">
                      Last queued:
                    </span>{" "}
                    {control.last_queued_at
                      ? `${timeAgo(control.last_queued_at)} by ${control.last_queued_by || "unknown"}`
                      : "Never"}
                  </div>
                  <div>
                    <span className="font-semibold text-gray-800 dark:text-[#e8dfd5]">
                      Last started:
                    </span>{" "}
                    {control.last_started_at ? timeAgo(control.last_started_at) : "Never"}
                  </div>
                  <div>
                    <span className="font-semibold text-gray-800 dark:text-[#e8dfd5]">
                      Last finished:
                    </span>{" "}
                    {control.last_finished_at
                      ? timeAgo(control.last_finished_at)
                      : "Never"}
                  </div>
                </div>
                {control.last_task_id && (
                  <Typography color="text.secondary" className="mt-2 text-xs">
                    Task ID: <span className="font-mono">{control.last_task_id}</span>
                  </Typography>
                )}
                {control.last_error && (
                  <Alert severity="error" className="mt-3">
                    {control.last_error}
                  </Alert>
                )}
                {control.last_result && (
                  <Typography color="text.secondary" className="mt-2 text-xs">
                    Last result:{" "}
                    <span className="font-mono">
                      {JSON.stringify(control.last_result)}
                    </span>
                  </Typography>
                )}
              </div>
              <Switch
                checked={control.enabled}
                disabled={updateControl.isPending}
                onChange={(_, enabled) =>
                  updateControl.mutate({ key: control.key, enabled })
                }
                aria-label={`Toggle ${control.label}`}
              />
            </div>
          </Paper>
        ))}
      </div>

      <Paper className="mt-6 p-6">
        <Box className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Typography variant="h5">Manual ingestion run</Typography>
            <Typography color="text.secondary">
              Queue one immediate ingestion task. The task still uses the configured
              run root, result root, and duplicate-sample safety checks.
            </Typography>
          </div>
          <Button
            onClick={() => queueIngestion.mutate()}
            disabled={!ingestion?.enabled || queueIngestion.isPending}
            startIcon={
              queueIngestion.isPending ? <RefreshCcw size={16} /> : <Play size={16} />
            }
          >
            {queueIngestion.isPending ? "Queueing…" : "Run ingestion now"}
          </Button>
        </Box>
        {!ingestion?.enabled && (
          <Alert severity="warning" className="mt-4">
            Automated ingestion is disabled. Enable it before queueing a manual run.
          </Alert>
        )}
      </Paper>
    </Container>
  );
}
