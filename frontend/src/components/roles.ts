export type ApplicationRole = "admin" | "lymphotrack_admin" | "lymphotrack";

export const applicationRoles: Array<{
  id: ApplicationRole;
  label: string;
  description: string;
}> = [
  {
    id: "admin",
    label: "Admin",
    description: "Full application and user administration.",
  },
  {
    id: "lymphotrack_admin",
    label: "LymphoTrack admin",
    description: "Clinical workflow administration and content controls.",
  },
  {
    id: "lymphotrack",
    label: "LymphoTrack",
    description: "Sample analysis, V-QUEST, and reporting workflows.",
  },
];
