import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  InputAdornment,
  Pagination,
  Paper,
  TextField,
  Typography,
} from "../components/ui";
import { EyeOff, ExternalLink, RotateCcw, Search } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, applicationUrl } from "../api";
import { useSession } from "../session-context";
import type { PaginatedPayload, Report } from "../types";
import { timeAgo } from "../dateUtils";
import { useState } from "react";

const PAGE_SIZE = 25;

export function ReportsPage() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const canArchive = session.user.can_moderate;
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["reports", search, page],
    queryFn: () => {
      const params = new URLSearchParams({
        search,
        page: String(page),
        page_size: String(PAGE_SIZE),
      });
      return apiRequest<PaginatedPayload<Report>>(`/api/v1/reports?${params}`);
    },
  });
  const archive = useMutation({
    mutationFn: (report: Report) =>
      apiRequest(
        `/api/v1/reports/${report._id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ hidden: !report.hidden }),
        },
        session.csrf_token,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reports"] }),
  });
  const reports = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <Container maxWidth="xl" className="py-8">
      <Typography variant="overline" color="primary" fontWeight={800}>
        Report archive
      </Typography>
      <Typography variant="h3" className="mb-6">
        Reports
      </Typography>
      {archive.error && (
        <Alert severity="error" className="mb-4">
          {archive.error.message}
        </Alert>
      )}
      <Paper className="data-panel">
        <Box className="toolbar-row">
          <Typography variant="body2" color="text.secondary">
            {total} {total === 1 ? "report" : "reports"}
          </Typography>
          <TextField
            size="small"
            placeholder="Search reports"
            aria-label="Search reports"
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
                <th>Date</th>
                <th>Sample</th>
                <th>Type</th>
                <th>Submission</th>
                <th>Author</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report._id} style={{ opacity: report.hidden ? 0.5 : 1 }}>
                  <td>{timeAgo(report.created_at)}</td>
                  <td>
                    {(report as Report & { sample_name?: string }).sample_name}
                  </td>
                  <td>{report.report_type}</td>
                  <td>{report.submission_id || "–"}</td>
                  <td>{report.created_by}</td>
                  <td>
                    <Chip
                      size="small"
                      label={report.hidden ? "Hidden" : "Available"}
                    />
                  </td>
                  <td>
                    <div className="flex justify-center gap-6">
                    <Button
                      size="small"
                      href={applicationUrl(
                        `/api/v1/reports/${report._id}/artifact`,
                      )}
                      target="_blank"
                      disabled={report.hidden && !canArchive}
                      endIcon={<ExternalLink size={16} />}
                    >
                      Open
                    </Button>
                    {canArchive && (
                      <Button
                        size="small"
                        color={report.hidden ? "primary" : "warning"}
                        startIcon={
                          report.hidden ? (
                            <RotateCcw size={16} />
                          ) : (
                            <EyeOff size={16} />
                          )
                        }
                        onClick={() => archive.mutate(report)}
                        disabled={archive.isPending}
                      >
                        {report.hidden ? "Restore" : "Hide"}
                      </Button>
                    )}
                    </div>
                  </td>
                </tr>
              ))}
              {!reports.length && (
                <tr>
                  <td colSpan={7} className="empty-cell">No reports found.</td>
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
    </Container>
  );
}
