import { Container, Paper, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useSortableTable } from "../hooks/useSortableTable";
import { SortableTableHead } from "../components/SortableTableHead";
import { apiRequest } from "../api";
import { timeAgo } from "../dateUtils";
type Event = {
  _id: string;
  occurred_at: string;
  actor: string;
  action: string;
  target: string;
  details: object;
};
export function AuditPage() {
  const query = useQuery({
    queryKey: ["audit"],
    queryFn: () => apiRequest<Event[]>("/api/v1/admin/audit"),
  });
  const { sortedData, sortKey, sortOrder, requestSort } = useSortableTable(
    query.data,
    "occurred_at",
    "desc"
  );
  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Typography variant="overline" color="primary" fontWeight={800}>
        Administration
      </Typography>
      <Typography variant="h3" sx={{ mb: 3 }}>
        Audit events
      </Typography>
      <Paper className="data-panel" elevation={0}>
        <div className="responsive-table">
          <table>
            <thead>
              <tr>
                <SortableTableHead label="Time" sortKey="occurred_at" currentSortKey={sortKey as string} currentSortOrder={sortOrder} onRequestSort={requestSort} />
                <SortableTableHead label="Actor" sortKey="actor" currentSortKey={sortKey as string} currentSortOrder={sortOrder} onRequestSort={requestSort} />
                <SortableTableHead label="Action" sortKey="action" currentSortKey={sortKey as string} currentSortOrder={sortOrder} onRequestSort={requestSort} />
                <SortableTableHead label="Target" sortKey="target" currentSortKey={sortKey as string} currentSortOrder={sortOrder} onRequestSort={requestSort} />
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {sortedData.map((event) => (
                <tr key={event._id}>
                  <td>{timeAgo(event.occurred_at)}</td>
                  <td>{event.actor}</td>
                  <td>{event.action}</td>
                  <td>{event.target}</td>
                  <td>
                    <code>{JSON.stringify(event.details)}</code>
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
