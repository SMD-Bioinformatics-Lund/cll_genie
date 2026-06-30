import {
  Box,
  Chip,
  Container,
  IconButton,
  InputAdornment,
  Pagination,
  Paper,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "../components/ui";
import { ChevronRight, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useSortableTable } from "../hooks/useSortableTable";
import { SortableTableHead } from "../components/SortableTableHead";
import { useSession } from "../session-context";
import { timeAgo } from "../dateUtils";
import { useState } from "react";
import { Link } from "react-router-dom";
import { listSamples, applicationUrl, getSystemStatus } from "../api";

export function WorklistPage() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"open" | "finished">("open");
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["samples", search, tab, page],
    queryFn: () => listSamples(search, tab === "finished", page),
  });
  
  const openCountQuery = useQuery({
    queryKey: ["samples_count", "open"],
    queryFn: () => listSamples("", false, 1),
  });
  
  const finishedCountQuery = useQuery({
    queryKey: ["samples_count", "finished"],
    queryFn: () => listSamples("", true, 1),
  });

  const systemStatusQuery = useQuery({
    queryKey: ["system_status"],
    queryFn: () => getSystemStatus(),
    refetchInterval: 60000,
  });

  const { sortedData, sortKey, sortOrder, requestSort } = useSortableTable(
    query.data?.items,
    "date_added",
    "desc"
  );
  const pages = Math.max(1, Math.ceil((query.data?.total ?? 0) / 25));
  return (
    <Container maxWidth="xl" className="py-8">
      <Typography variant="overline" color="primary.main" fontWeight={800}>
        Clinical worklist
      </Typography>
      <Typography variant="h3" component="h1" className="my-1">
        Samples Overview
      </Typography>
      <Typography color="text.secondary" className="mb-6 text-[14px]">
        Track LymphoTrack data, IMGT/V-QUEST analysis, and report completion.
      </Typography>

      <Box className="flex gap-6 mb-8">
        <Paper  className="p-6 flex-1 bg-white dark:bg-neutral-800">
          <Typography variant="overline" color="text.secondary">Open Samples</Typography>
          <Typography variant="h3" color="primary.main">
            {openCountQuery.data?.total ?? "..."}
          </Typography>
        </Paper>
        <Paper  className="p-6 flex-1 bg-white dark:bg-neutral-800">
          <Typography variant="overline" color="text.secondary">Finished Samples</Typography>
          <Typography variant="h3" color="success.main">
            {finishedCountQuery.data?.total ?? "..."}
          </Typography>
        </Paper>
        <Paper  className="p-6 flex-1 bg-white dark:bg-neutral-800">
          <Typography variant="overline" color="text.secondary">System Status</Typography>
          {systemStatusQuery.isLoading ? (
            <Box className="flex items-center gap-2 mt-2">
              <Box className="w-[12px] h-[12px] bg-gray-400 rounded-full animate-pulse" />
              <Typography variant="h6">Checking systems...</Typography>
            </Box>
          ) : systemStatusQuery.isError ? (
            <Box className="flex items-center gap-2 mt-2">
              <Box className="w-[12px] h-[12px] bg-red-500 rounded-full" />
              <Typography variant="h6" color="error">System Offline</Typography>
            </Box>
          ) : (
            <Box className="flex items-center gap-2 mt-2">
              <Box className={`w-[12px] h-[12px] ${systemStatusQuery.data?.imgt === "error" || systemStatusQuery.data?.database === "error" ? "bg-red-500" : "bg-emerald-500"} rounded-full`} />
              <Typography variant="h6" color={systemStatusQuery.data?.imgt === "error" || systemStatusQuery.data?.database === "error" ? "error" : "text.primary"}>
                {systemStatusQuery.data?.database === "error" ? "Database Unavailable" : systemStatusQuery.data?.imgt === "error" ? "IMGT/V-QUEST Unavailable" : "All Systems Operational"}
              </Typography>
            </Box>
          )}
        </Paper>
      </Box>
      <Paper  className="data-panel">
        <Box className="toolbar-row">
          <Tabs
            value={tab}
            onChange={(_, value) => {
              setTab(value);
              setPage(1);
            }}
          >
            <Tab value="open" label="Open samples" />
            <Tab value="finished" label="Finished" />
          </Tabs>
          <TextField
            size="small"
            placeholder="Search sample ID"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            sx={{ maxWidth: 480 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={18} />
                </InputAdornment>
              ),
            }}
          />
        </Box>
        <div className="responsive-table">
          <table>
            <thead>
              <tr>
                <SortableTableHead label="Date" sortKey="date_added" currentSortKey={sortKey as string} currentSortOrder={sortOrder} onRequestSort={requestSort} />
                <SortableTableHead label="Sample" sortKey="name" currentSortKey={sortKey as string} currentSortOrder={sortOrder} onRequestSort={requestSort} />
                <SortableTableHead label="Clarity ID" sortKey="clarity_id" currentSortKey={sortKey as string} currentSortOrder={sortOrder} onRequestSort={requestSort} />
                <SortableTableHead label="Run" sortKey="run_id" currentSortKey={sortKey as string} currentSortOrder={sortOrder} onRequestSort={requestSort} />
                <th>Data</th>
                <th>Analysis</th>
                <th>Report</th>
                {tab === "finished" && <th>Latest Report</th>}
                <th />
              </tr>
            </thead>
            <tbody>
              {sortedData.map((sample) => (
                <tr key={sample._id}>
                  <td>{timeAgo(sample.date_added)}</td>
                  <td>
                    <Link to={`/samples/${sample._id}`}>{sample.name}</Link>
                    {sample.is_control && (
                      <Chip label="Control" size="small" className="ml-2" />
                    )}
                    {(sample.duplicate_count ?? 0) > 1 && (
                      <Chip
                        label={`${sample.duplicate_count} duplicates`}
                        color="warning"
                        size="small"
                        className="ml-2"
                      />
                    )}
                  </td>
                  <td>{sample.clarity_id || "–"}</td>
                  <td>{sample.run_number || "–"}</td>
                  <td>
                    <Chip
                      size="small"
                      color={
                        sample.lymphotrack_excel && sample.lymphotrack_qc
                          ? "success"
                          : "default"
                      }
                      label={
                        sample.lymphotrack_excel && sample.lymphotrack_qc
                          ? "Ready"
                          : "Incomplete"
                      }
                    />
                  </td>
                  <td>
                    <Chip
                      size="small"
                      color={sample.vquest ? "success" : "default"}
                      label={sample.vquest ? "Analyzed" : "Pending"}
                    />
                  </td>
                  <td>
                    <Chip
                      size="small"
                      color={sample.report ? (sample.latest_report_type === "NEGATIVE" ? "warning" : "success") : "default"}
                      label={sample.report ? (sample.latest_report_type === "NEGATIVE" ? "Created (NR)" : "Created") : "Pending"}
                    />
                  </td>
                  {tab === "finished" && (
                    <td>
                      {sample.latest_report_id ? (
                        <a
                          href={applicationUrl(`/api/v1/reports/${sample.latest_report_oid}/artifact`)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:text-blue-700 font-medium text-sm"
                        >
                          {sample.latest_report_id}
                        </a>
                      ) : (
                        <span className="text-gray-400 text-sm">None</span>
                      )}
                    </td>
                  )}
                  <td>
                    <IconButton
                      component={Link}
                      to={`/samples/${sample._id}`}
                      aria-label={`Open ${sample.name}`}
                    >
                      <ChevronRight size={19} />
                    </IconButton>
                  </td>
                </tr>
              ))}
              {!query.isLoading && !query.data?.items.length && (
                <tr>
                  <td colSpan={8} className="empty-cell">
                    No samples found! 
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Box
          className="p-4 flex justify-between items-center"
        >
          <Typography variant="body2" color="text.secondary">
            {query.data?.total ?? 0} samples
          </Typography>
          <Pagination
            page={page}
            count={pages}
            onChange={(_, value) => setPage(value)}
          />
        </Box>
      </Paper>
    </Container>
  );
}
