import {
  Alert,
  Button,
  Chip,
  Container,
  Paper,
  Typography,
} from "../components/ui";
import { EyeOff, ExternalLink, RotateCcw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, applicationUrl } from "../api";
import { useSession } from "../session-context";
import type { Report } from "../types";
import { timeAgo } from "../dateUtils";

export function ReportsPage() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const canArchive = session.user.is_admin;
  const query = useQuery({
    queryKey: ["reports"],
    queryFn: () => apiRequest<Report[]>("/api/v1/reports"),
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
      <Paper className="data-panel" >
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
              {query.data?.map((report) => (
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
            </tbody>
          </table>
        </div>
      </Paper>
    </Container>
  );
}
