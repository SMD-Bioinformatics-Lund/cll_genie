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
} from "@mui/material";
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  generateNegativeReport,
  getSample,
  applicationUrl,
  uploadSampleArtifact,
} from "../api";
import { useSession } from "../session-context";
import type { Report, Sample } from "../types";
import { timeAgo } from "../dateUtils";

export function SamplePage() {
  const { sampleId = "" } = useParams();
  const { session } = useSession();
  const canAnalyze = session.user.permissions.includes("analysis:create");
  const canReport = session.user.permissions.includes("reports:create");
  const client = useQueryClient();
  const [tab, setTab] = useState(0);
  const [negativeOpen, setNegativeOpen] = useState(false);
  const [negativeText, setNegativeText] = useState(
    "Vid analysen påvisas ingen förekomst av klonal IGH-sekvens, varpå mutationsstatus inte kan fastställas.",
  );
  const query = useQuery({
    queryKey: ["sample", sampleId],
    queryFn: () => getSample(sampleId),
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
      </Box>
      <Paper elevation={0} className="data-panel" sx={{ mt: 3 }}>
        <Tabs value={tab} onChange={(_, value) => setTab(value)}>
          <Tab label="Overview" />
          <Tab label={`Submissions (${Object.keys(submissions).length})`} />
          <Tab label={`Reports (${reports.length})`} />
        </Tabs>
        {tab === 0 && (
          <Box sx={{ p: 3 }}>
            <div className="detail-grid">
              {[
                ["Sample ID", sample.name],
                ["Clarity ID", sample.clarity_id],
                ["Run ID", sample.run_id],
                ["Sequencer", sample.sequencer],
                ["Assay", sample.assay],
                ["Raw reads", sample.total_raw_reads?.toLocaleString()],
                ["Raw bases", sample.total_raw_bases?.toLocaleString()],
                [
                  "Q30",
                  sample.q30_per === "" ? "–" : `${sample.q30_per ?? "–"}%`,
                ],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <span>{label}</span>
                  <strong>{value || "–"}</strong>
                </div>
              ))}
            </div>
            <Box className="action-row" sx={{ mt: 4 }}>
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
                  <th />
                </tr>
              </thead>
              <tbody>
                {Object.entries(submissions).map(([id, value]) => {
                  const item = value as {
                    data_added?: string;
                    vquest_results?: Record<string, unknown>;
                  };
                  return (
                    <tr key={id}>
                      <td>{id}</td>
                      <td>{timeAgo(item.data_added)}</td>
                      <td>{Object.keys(item.vquest_results ?? {}).length}</td>
                      <td>
                        <Button
                          component={Link}
                          to={`/samples/${sampleId}/submissions/${id}`}
                          endIcon={<ArrowRight size={15} />}
                        >
                          View results
                        </Button>
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
                  <th>Type</th>
                  <th>Author</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {reports.map((report: Report) => (
                  <tr key={report._id}>
                    <td>{timeAgo(report.created_at)}</td>
                    <td>{report.report_type}</td>
                    <td>{report.created_by}</td>
                    <td>
                      <Button
                        href={applicationUrl(
                          `/api/v1/reports/${report._id}/artifact`,
                        )}
                        target="_blank"
                        endIcon={<ExternalLink size={15} />}
                      >
                        Open report
                      </Button>
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
    </Container>
  );
}
