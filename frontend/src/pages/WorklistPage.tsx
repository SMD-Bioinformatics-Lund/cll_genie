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
} from "@mui/material";
import { ChevronRight, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useSortableTable } from "../hooks/useSortableTable";
import { SortableTableHead } from "../components/SortableTableHead";
import { useSession } from "../session-context";
import { timeAgo } from "../dateUtils";
import { useState } from "react";
import { Link } from "react-router-dom";
import { listSamples } from "../api";

export function WorklistPage() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"open" | "finished">("open");
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["samples", search, tab, page],
    queryFn: () => listSamples(search, tab === "finished", page),
  });
  const { sortedData, sortKey, sortOrder, requestSort } = useSortableTable(
    query.data?.items,
    "date_added",
    "desc"
  );
  const pages = Math.max(1, Math.ceil((query.data?.total ?? 0) / 25));
  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Typography variant="overline" color="primary" fontWeight={800}>
        Clinical worklist
      </Typography>
      <Typography variant="h3" component="h1">
        Samples
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>
        Track LymphoTrack data, IMGT/V-QUEST analysis, and report completion.
      </Typography>
      <Paper elevation={0} className="data-panel">
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
            sx={{ maxWidth: 360 }}
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
                      <Chip label="Control" size="small" sx={{ ml: 1 }} />
                    )}
                    {(sample.duplicate_count ?? 0) > 1 && (
                      <Chip
                        label={`${sample.duplicate_count} duplicates`}
                        color="warning"
                        size="small"
                        sx={{ ml: 1 }}
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
                      color={sample.report ? "success" : "default"}
                      label={sample.report ? "Created" : "Pending"}
                    />
                  </td>
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
                    No matching samples
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Box
          sx={{
            p: 2,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
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
