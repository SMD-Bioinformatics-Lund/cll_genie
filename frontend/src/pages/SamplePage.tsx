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
  Download,
  ExternalLink,
  FileUp,
  FileX2,
  FlaskConical,
  Plus,
  RefreshCw,
  X,
  Trash2,
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
  sampleArtifactUrl,
  deleteSubmission,
  updateSampleJson,
  deleteSample,
} from "../api";
import { formatBytes } from "../utils";
import { useSession } from "../session-context";
import type { Report, Sample } from "../types";
import { timeAgo } from "../dateUtils";
import { ConfirmModal } from "../components/ConfirmModal";

const noResultConclusions = {
  nonFunctional:
    "Vid analysen finner man en klonal sekvens, men då denna sekvens saknar ett funktionellt IGH-genrearrangemang kan mutationsstatus inte undersökas. Provet skickas till Göteborg för att utföra analys av RNA.",
  noClonal:
    "Vid analysen påvisas ingen förekomst av klonal IGH-sekvens, varpå analys av IG-genrearrangemang och mutationsstatus inte är möjlig att utföra. Provet skickas till Göteborg för att utföra analys av RNA.",
} as const;

type NoResultConclusion = keyof typeof noResultConclusions;

export function SamplePage() {
  const { sampleId = "" } = useParams();
  const { session } = useSession();
  const canAnalyze = session.user.can_analyze;
  const canReport = session.user.can_analyze;
  const client = useQueryClient();
  const [tab, setTab] = useState(0);
  const [negativeOpen, setNegativeOpen] = useState(false);
  const [negativeKind, setNegativeKind] =
    useState<NoResultConclusion>("noClonal");
  const [negativeText, setNegativeText] = useState<string>(
    noResultConclusions.noClonal,
  );
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    destructive?: boolean;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const confirmAction = (
    title: string,
    message: string,
    destructive: boolean,
    onConfirm: () => void,
    confirmText = "Confirm",
  ) => {
    setConfirmConfig({
      isOpen: true,
      title,
      message,
      confirmText,
      destructive,
      onConfirm,
    });
  };

  const query = useQuery({
    queryKey: ["sample", sampleId],
    queryFn: () => getSample(sampleId),
  });

  const handleOpenJson = () => {
    setJsonText(JSON.stringify(query.data?.sample, null, 2));
    setJsonOpen(true);
  };

  const confirmUpload = (
    kind: "lymphotrack-excel" | "lymphotrack-qc",
    file: File,
    input: HTMLInputElement,
  ) => {
    const isExcel = kind === "lymphotrack-excel";
    const label = isExcel ? "LymphoTrack Excel workbook" : "LymphoTrack QC file";
    const sample = query.data?.sample;
    const hasExistingFile = Boolean(
      isExcel
        ? sample?.lymphotrack_excel_artifact_id || sample?.lymphotrack_excel
        : sample?.lymphotrack_qc_artifact_id || sample?.lymphotrack_qc,
    );
    confirmAction(
      hasExistingFile ? `Replace existing ${label}?` : `Upload ${label}?`,
      hasExistingFile
        ? `This sample already has an attached ${label.toLowerCase()}. Uploading "${file.name}" will replace the current attachment. Continue?`
        : `Upload "${file.name}" for this sample?`,
      hasExistingFile,
      () => {
        upload.mutate({ kind, file });
      },
      hasExistingFile ? "Replace file" : "Upload file",
    );
    input.value = "";
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
      <Container className="py-10">
        <Alert severity="error">Sample could not be loaded.</Alert>
      </Container>
    );
  const sample = query.data.sample as unknown as Sample;
  const submissions = query.data.submissions;
  const reports = query.data.reports;
  const canDelete = session.user.can_moderate;
  const q30Value =
    typeof sample.q30_per === "number"
      ? sample.q30_per
      : typeof sample.q30_per === "string" && sample.q30_per !== ""
        ? Number(sample.q30_per)
        : undefined;
  const q30IsLow = q30Value !== undefined && !Number.isNaN(q30Value) && q30Value < 70;
  return (
    <Container maxWidth="xl" className="py-8">
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
                  <RefreshCw size={14} />
                ) : (
                  <FlaskConical size={14} />
                )
              }
            >
              {sample.vquest ? "Run another analysis" : "Start analysis"}
            </Button>
          )}
          {canDelete && (
            <>
              {session.user.is_admin && (
                <Button
                  variant="outlined"
                  color="secondary"
                  onClick={handleOpenJson}
                >
                  Edit JSON
                </Button>
              )}
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
      <Paper  className="data-panel mt-6">
        <Tabs value={tab} onChange={(_, value) => setTab(value)}>
          <Tab label="Overview" />
          <Tab label={`Submissions (${Object.keys(submissions).length})`} />
          <Tab label={`Reports (${reports.length})`} />
        </Tabs>
        {tab === 0 && (
          <Box className="p-4">
            <div className="detail-grid text-xs">
              {[
                ["Sample ID", sample.name],
                ["Control", sample.is_control ? "Yes" : "No"],
                ["Clarity ID", sample.clarity_id],
                ["Run ID", sample.run_id],
                ["Sequencer", sample.sequencer],
                ["Assay", sample.assay],
                ["Total Raw Reads", sample.total_raw_reads?.toLocaleString()],
                ["Total Raw Bases", sample.total_raw_bases?.toLocaleString()],
                ["Total AT Bases", sample.total_bases?.toLocaleString()],
                ["Q30 AT Bases", sample.q30_bases?.toLocaleString()],
                ["Date Added", sample.date_added ? new Date(sample.date_added).toLocaleDateString() : "–"],
              ].map(([label, value]) => (
                <div key={String(label)} className="p-2">
                  <span className="text-[0.7rem] uppercase tracking-wider">{label}</span>
                  <strong className="block text-xs font-medium">{value || "–"}</strong>
                </div>
              ))}
              <div
                className={`p-2 ${
                  q30IsLow
                    ? "rounded-lg border border-red-300 bg-red-50 dark:border-red-500/40 dark:bg-red-950/30"
                    : ""
                }`}
              >
                <span className="text-[0.7rem] uppercase tracking-wider">Q30 AT Reads Percentage</span>
                <strong className={`block text-xs font-medium ${q30IsLow ? "text-red-700 dark:text-red-100" : ""}`}>
                  {q30Value === undefined || Number.isNaN(q30Value) ? "–" : `${q30Value}%`}
                </strong>
                {q30IsLow && (
                  <span className="mt-1 block text-[0.68rem] font-semibold text-red-700 dark:text-red-100">
                    Below default threshold 70%
                  </span>
                )}
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-2.5">
              {canAnalyze && (
                <>
                  <label className="group relative flex cursor-pointer items-center gap-2.5 rounded-xl border border-brand-primary/30 bg-brand-primary/5 px-4 py-2.5 transition-all duration-200 hover:border-brand-primary/60 hover:bg-brand-primary/10 hover:shadow-md dark:border-brand-detail/30 dark:bg-brand-detail/5 dark:hover:border-brand-detail/50 dark:hover:bg-brand-detail/10">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-primary/15 text-brand-primary transition-transform duration-200 group-hover:scale-110 dark:bg-brand-detail/15 dark:text-brand-detail">
                      <FileUp size={14} />
                    </span>
                    <span>
                      <span className="block text-xs font-semibold text-brand-primary dark:text-brand-detail">Upload Excel</span>
                      <span className="block text-[10px] font-normal text-gray-400 dark:text-[#a99f94]">.xlsx / .xlsm/ .xsm</span>
                    </span>
                    <input
                      hidden
                      type="file"
                      accept=".xlsx,.xlsm"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) confirmUpload("lymphotrack-excel", file, event.currentTarget);
                      }}
                    />
                  </label>
                  {sample.lymphotrack_excel_artifact_id && (
                    <Button
                      variant="outlined"
                      href={sampleArtifactUrl(sampleId, "lymphotrack-excel")}
                      target="_blank"
                      startIcon={<Download size={14} />}
                    >
                      Download Excel
                    </Button>
                  )}
                  <label className="group relative flex cursor-pointer items-center gap-2.5 rounded-xl border border-brand-primary/30 bg-brand-primary/5 px-4 py-2.5 transition-all duration-200 hover:border-brand-primary/60 hover:bg-brand-primary/10 hover:shadow-md dark:border-brand-detail/30 dark:bg-brand-detail/5 dark:hover:border-brand-detail/50 dark:hover:bg-brand-detail/10">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-primary/15 text-brand-primary transition-transform duration-200 group-hover:scale-110 dark:bg-brand-detail/15 dark:text-brand-detail">
                      <FileUp size={14} />
                    </span>
                    <span>
                      <span className="block text-xs font-semibold text-brand-primary dark:text-brand-detail">Upload QC</span>
                      <span className="block text-[10px] font-normal text-gray-400 dark:text-[#a99f94]">Quality control file</span>
                    </span>
                    <input
                      hidden
                      type="file"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) confirmUpload("lymphotrack-qc", file, event.currentTarget);
                      }}
                    />
                  </label>
                  {sample.lymphotrack_qc_artifact_id && (
                    <Button
                      variant="outlined"
                      href={sampleArtifactUrl(sampleId, "lymphotrack-qc")}
                      target="_blank"
                      startIcon={<Download size={14} />}
                    >
                      Download QC
                    </Button>
                  )}
                </>
              )}
              {canReport && (
                <button
                  type="button"
                  onClick={() => setNegativeOpen(true)}
                  className="group flex cursor-pointer items-center gap-2.5 rounded-xl border border-amber-300/60 bg-amber-50/80 px-4 py-2.5 transition-all duration-200 hover:border-amber-400 hover:bg-amber-100 hover:shadow-md dark:border-amber-500/30 dark:bg-amber-900/10 dark:hover:border-amber-500/50 dark:hover:bg-amber-900/20"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600 transition-transform duration-200 group-hover:scale-110 dark:bg-amber-900/30 dark:text-amber-400">
                    <FileX2 size={14} />
                  </span>
                  <span>
                    <span className="block text-xs font-semibold text-amber-700 dark:text-amber-400">Create no-result report</span>
                    <span className="block text-[10px] font-normal text-amber-600/60 dark:text-amber-500/60">No clonal sequence detected</span>
                  </span>
                </button>
              )}
            </div>

            {upload.error && (
              <Alert severity="error" className="mt-4">
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
                  const submissionReports = reports.filter(
                    (report) => report.submission_id === id && !report.hidden,
                  );
                  return (
                    <tr key={id}>
                      <td>{id}</td>
                      <td>{timeAgo(item.data_added)}</td>
                      <td>{Object.keys(item.vquest_results ?? {}).length}</td>
                      <td>{submissionReports.length}</td>
                      <td>
                        <div className="flex justify-center gap-6">
                          {canDelete && (
                            <Button
                              color="error"
                              size="small"
                              variant="outlined"
                              endIcon={<Trash2 size={15} />}
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
                            size="small"
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
                      <div className="flex justify-center gap-6">
                        {canDelete && (
                          report.hidden ? (
                            <Button
                              color="primary"
                              size="small"
                              variant="outlined"
                              endIcon={<RefreshCw size={15} />}
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
                              endIcon={<Trash2 size={15} />}
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
                          size="small"
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
          <fieldset className="mt-2">
            <legend className="mb-2 text-sm font-medium text-gray-700 dark:text-[#e8dfd5]">
              Result type
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["nonFunctional", "Clonal, non-functional sequence"],
                  ["noClonal", "No clonal sequence"],
                ] as const
              ).map(([kind, label]) => {
                const selected = negativeKind === kind;
                return (
                  <button
                    key={kind}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setNegativeKind(kind);
                      setNegativeText(noResultConclusions[kind]);
                    }}
                    className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${selected ? "border-brand-primary bg-brand-primary/5 text-brand-primary ring-1 ring-brand-primary/30 dark:border-brand-detail dark:bg-brand-detail/10 dark:text-brand-detail" : "border-gray-200 text-gray-700 hover:border-gray-300 dark:border-[#3b3732] dark:text-[#d8d0c7] dark:hover:border-[#5b5149]"}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <TextField
            multiline
            rows={7}
            label="Conclusion"
            value={negativeText}
            onChange={(e) => setNegativeText(e.target.value)}
            fullWidth
            className="mt-5"
          />
          {negative.error && (
            <Alert severity="error" className="mt-4">
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
        maxWidth="xl"
        fullWidth
      >
        <DialogTitle>Edit Sample JSON</DialogTitle>
        <DialogContent>
          <Alert severity="warning" className="mb-4">
            Editing raw JSON can break the application. Ensure syntax is correct.
          </Alert>
          <Box className="h-[70vh] min-h-[560px] overflow-hidden">
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
          confirmText={confirmConfig.confirmText}
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
