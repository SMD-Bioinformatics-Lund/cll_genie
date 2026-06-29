import {
  Alert,
  Box,
  Button,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Paper,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "../components/ui";
import {
  ArrowRight,
  ExternalLink,
  FileUp,
  FileX2,
  FlaskConical,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import Editor from "@monaco-editor/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  generateNegativeReport,
  getSample,
  apiRequest,
  applicationUrl,
  uploadSampleArtifact,
  deleteSubmission,
  deleteReport,
  updateSampleJson,
  deleteSample,
} from "../api";
import { formatBytes } from "../utils";
import { useSession } from "../session-context";
import type { Report, Sample } from "../types";
import { timeAgo } from "../dateUtils";
import { ConfirmModal } from "../components/ConfirmModal";

export function SamplePage() {
  const { sampleId = "" } = useParams();
  const { session } = useSession();
  const canAnalyze = session.user.is_admin || session.user.is_lymphotrack;
  const canReport = session.user.is_admin || session.user.is_lymphotrack;
  const client = useQueryClient();
  const [tab, setTab] = useState(0);
  const [negativeOpen, setNegativeOpen] = useState(false);
  const [negativeText, setNegativeText] = useState(
    "Vid analysen påvisas ingen förekomst av klonal IGH-sekvens, varpå mutationsstatus inte kan fastställas.",
  );
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    destructive?: boolean;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const confirmAction = (title: string, message: string, destructive: boolean, onConfirm: () => void) => {
    setConfirmConfig({ isOpen: true, title, message, destructive, onConfirm });
  };

  const query = useQuery({
    queryKey: ["sample", sampleId],
    queryFn: () => getSample(sampleId),
  });
  
  const handleOpenJson = () => {
    setJsonText(JSON.stringify(query.data?.sample, null, 2));
    setJsonOpen(true);
  };

  const updateJson = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      updateSampleJson(sampleId, payload, session.csrf_token),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["sample", sampleId] });
      setJsonOpen(false);
      toast.success("Sample updated successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to update sample: ${error.message}`);
    }
  });

  const removeSample = useMutation({
    mutationFn: () => deleteSample(sampleId, session.csrf_token),
    onSuccess: () => {
      toast.success("Sample deleted successfully");
      window.location.href = "/";
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete sample: ${error.message}`);
    }
  });

  const upload = useMutation({
    mutationFn: ({
      kind,
      file,
    }: {
      kind: "lymphotrack-excel" | "lymphotrack-qc";
      file: File;
    }) => uploadSampleArtifact(sampleId, kind, file, session.csrf_token),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["sample", sampleId] }),
  });
  const negative = useMutation({
    mutationFn: () =>
      generateNegativeReport(sampleId, negativeText, session.csrf_token),
    onSuccess: () => {
      setNegativeOpen(false);
      client.invalidateQueries({ queryKey: ["sample", sampleId] });
    },
  });
  const delSubmission = useMutation({
    mutationFn: (submissionId: string) =>
      deleteSubmission(sampleId, submissionId, session.csrf_token),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["sample", sampleId] });
      toast.success("Submission deleted successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete submission: ${error.message}`);
    },
  });
  const toggleReport = useMutation({
    mutationFn: (report: Report) =>
      apiRequest(
        `/api/v1/reports/${report._id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ hidden: !report.hidden }),
        },
        session.csrf_token,
      ),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["sample", sampleId] });
      toast.success("Report status updated successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to update report: ${error.message}`);
    },
  });
  if (query.isLoading) return <LinearProgress />;
  if (query.error || !query.data)
    return (
      <Container sx={{ py: 5 }}>
        <Alert severity="error">Sample could not be loaded.</Alert>
      </Container>
    );
  const sample = query.data.sample as unknown as Sample;
  const submissions = query.data.submissions;
  const reports = query.data.reports;
  const canDelete = session.user.is_admin || session.user.roles?.includes("lymphotrack_admin");
  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box className="page-heading">
        <div>
          <Typography variant="overline" color="primary" fontWeight={800}>
            Sample workspace
          </Typography>
          <Typography variant="h3">{sample.name}</Typography>
          <Typography color="text.secondary">
            {sample.clarity_id || "No Clarity ID"} · Run{" "}
            {sample.run_number || "unknown"}
          </Typography>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {canAnalyze && (
            <Button
              component={Link}
              to={`/samples/${sampleId}/analyze`}
              variant="contained"
              startIcon={
                sample.vquest ? (
                  <RefreshCw size={18} />
                ) : (
                  <FlaskConical size={18} />
                )
              }
            >
              {sample.vquest ? "Run another analysis" : "Start analysis"}
            </Button>
          )}
          {canDelete && (
            <>
              <Button
                variant="outlined"
                color="secondary"
                onClick={handleOpenJson}
              >
                Edit JSON
              </Button>
              <Button
                variant="outlined"
                color="error"
                onClick={() => {
                  confirmAction(
                    "Delete Sample",
                    "Are you sure you want to permanently delete this sample and all related data? This action cannot be undone.",
                    true,
                    () => removeSample.mutate()
                  );
                }}
                disabled={removeSample.isPending}
              >
                Hard Delete
              </Button>
            </>
          )}
        </div>
      </Box>
      <Paper elevation={0} className="data-panel" sx={{ mt: 3 }}>
        <Tabs value={tab} onChange={(_, value) => setTab(value)}>
          <Tab label="Overview" />
          <Tab label={`Submissions (${Object.keys(submissions).length})`} />
          <Tab label={`Reports (${reports.length})`} />
        </Tabs>
        {tab === 0 && (
          <Box sx={{ p: 3 }}>
            <div className="detail-grid text-xs">
              {[
                ["Sample ID", sample.name],
                ["Control", sample.is_control ? "Yes" : "No"],
                ["Clarity ID", sample.clarity_id],
                ["Run Number", sample.run_number],
                ["Run ID", sample.run_id],
                ["Sequencer", sample.sequencer],
                ["Assay", sample.assay],
                ["Total Raw Reads", sample.total_raw_reads?.toLocaleString()],
                ["Total Raw Bases", sample.total_raw_bases?.toLocaleString()],
                ["Total AT Bases", sample.total_bases?.toLocaleString()],
                ["Q30 AT Bases", sample.q30_bases?.toLocaleString()],
                [
                  "Q30 AT Reads Percentage",
                  sample.q30_per === "" || sample.q30_per === undefined ? "–" : `${sample.q30_per}%`,
                ],
                ["Date Added", sample.date_added ? new Date(sample.date_added).toLocaleDateString() : "–"],
              ].map(([label, value]) => (
                <div key={String(label)} className="p-2">
                  <span className="text-[0.7rem] uppercase tracking-wider">{label}</span>
                  <strong className="block text-sm font-medium">{value || "–"}</strong>
                </div>
              ))}
            </div>
            <Box className="action-row" sx={{ mt: 3 }}>
              {canAnalyze && (
                <>
                  <Button
                    component="label"
                    variant="outlined"
                    startIcon={<FileUp size={18} />}
                  >
                    Upload Excel
                    <input
                      hidden
                      type="file"
                      accept=".xlsx,.xlsm"
                      onChange={(event) =>
                        event.target.files?.[0] &&
                        upload.mutate({
                          kind: "lymphotrack-excel",
                          file: event.target.files[0],
                        })
                      }
                    />
                  </Button>
                  <Button
                    component="label"
                    variant="outlined"
                    startIcon={<FileUp size={18} />}
                  >
                    Upload QC
                    <input
                      hidden
                      type="file"
                      onChange={(event) =>
                        event.target.files?.[0] &&
                        upload.mutate({
                          kind: "lymphotrack-qc",
                          file: event.target.files[0],
                        })
                      }
                    />
                  </Button>
                </>
              )}
              {canReport && (
                <Button
                  variant="outlined"
                  color="secondary"
                  startIcon={<FileX2 size={16} />}
                  onClick={() => setNegativeOpen(true)}
                >
                  Create no-result report
                </Button>
              )}
            </Box>
            {upload.error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {upload.error.message}
              </Alert>
            )}
          </Box>
        )}
        {tab === 1 && (
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Submission</th>
                  <th>Date</th>
                  <th>Sequences</th>
                  <th>Reports</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {Object.entries(submissions).map(([id, value]) => {
                  const item = value as {
                    data_added?: string;
                    vquest_results?: Record<string, unknown>;
                  };
                  const submissionReports = reports.filter((r: any) => r.submission_id === id && !r.hidden);
                  return (
                    <tr key={id}>
                      <td>{id}</td>
                      <td>{timeAgo(item.data_added)}</td>
                      <td>{Object.keys(item.vquest_results ?? {}).length}</td>
                      <td>{submissionReports.length}</td>
                      <td>
                        <div className="flex justify-end gap-2">
                          {canDelete && (
                            <Button
                              color="error"
                              size="small"
                              variant="outlined"
                              onClick={() => {
                                confirmAction(
                                  "Delete Submission",
                                  "Are you sure you want to delete this submission and its reports?",
                                  true,
                                  () => delSubmission.mutate(id)
                                );
                              }}
                            >
                              Delete
                            </Button>
                          )}
                          <Button
                            component={Link}
                            to={`/samples/${sampleId}/submissions/${id}`}
                            endIcon={<ArrowRight size={15} />}
                          >
                            View results
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {tab === 2 && (
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Report ID</th>
                  <th>Submission ID</th>
                  <th>Type</th>
                  <th>Size</th>
                  <th>Author</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {reports.map((report: Report) => (
                  <tr key={report._id} style={{ opacity: report.hidden ? 0.5 : 1 }}>
                    <td>
                      {timeAgo(report.created_at)}
                      {report.hidden && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          (Hidden)
                        </Typography>
                      )}
                    </td>
                    <td>{report.display_id || "–"}</td>
                    <td>{report.submission_id || "–"}</td>
                    <td>{report.report_type}</td>
                    <td>{formatBytes(report.file_size)}</td>
                    <td>{report.created_by}</td>
                    <td>
                      <div className="flex justify-end gap-2">
                        {canDelete && (
                          report.hidden ? (
                            <Button
                              color="primary"
                              size="small"
                              variant="outlined"
                              disabled={toggleReport.isPending}
                              onClick={() => {
                                confirmAction(
                                  "Restore Report",
                                  "Are you sure you want to restore this report?",
                                  false,
                                  () => toggleReport.mutate(report)
                                );
                              }}
                            >
                              Restore
                            </Button>
                          ) : (
                            <Button
                              color="error"
                              size="small"
                              variant="outlined"
                              disabled={toggleReport.isPending}
                              onClick={() => {
                                confirmAction(
                                  "Delete Report",
                                  "Are you sure you want to hide this report?",
                                  true,
                                  () => toggleReport.mutate(report)
                                );
                              }}
                            >
                              Delete
                            </Button>
                          )
                        )}
                        <Button
                          href={applicationUrl(
                            `/api/v1/reports/${report._id}/artifact`,
                          )}
                          target="_blank"
                          disabled={report.hidden && !canDelete}
                          endIcon={<ExternalLink size={15} />}
                        >
                          Open report
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Paper>
      <Dialog
        open={negativeOpen}
        onClose={() => setNegativeOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Create no-result report</DialogTitle>
        <DialogContent>
          <TextField
            multiline
            minRows={6}
            label="Conclusion"
            value={negativeText}
            onChange={(e) => setNegativeText(e.target.value)}
            sx={{ mt: 1 }}
          />
          {negative.error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {negative.error.message}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            startIcon={<X size={15} />}
            onClick={() => setNegativeOpen(false)}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            startIcon={<Plus size={18} />}
            onClick={() => negative.mutate()}
            disabled={!negativeText.trim() || negative.isPending}
          >
            Create report
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={jsonOpen}
        onClose={() => setJsonOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Edit Sample JSON</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Editing raw JSON can break the application. Ensure syntax is correct.
          </Alert>
          <Box sx={{ height: 450, border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
            <Editor
              height="100%"
              defaultLanguage="json"
              value={jsonText}
              onChange={(value) => setJsonText(value || "")}
              options={{
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: "on",
                tabSize: 2,
              }}
              theme={document.documentElement.dataset.theme === "dark" ? "vs-dark" : "light"}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setJsonOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={updateJson.isPending}
            onClick={() => {
              try {
                const payload = JSON.parse(jsonText);
                updateJson.mutate(payload);
              } catch (e) {
                toast.error(`Invalid JSON: ${(e as Error).message}`);
              }
            }}
          >
            Save JSON
          </Button>
        </DialogActions>
      </Dialog>
      
      {confirmConfig.isOpen && (
        <ConfirmModal
          title={confirmConfig.title}
          message={confirmConfig.message}
          destructive={confirmConfig.destructive}
          onConfirm={() => {
            confirmConfig.onConfirm();
            setConfirmConfig(prev => ({ ...prev, isOpen: false }));
          }}
          onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
        />
      )}
    </Container>
  );
}
