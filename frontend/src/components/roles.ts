export type ApplicationRole = "admin" | "lymphotrack_admin" | "user";

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
    description: "Clinical deletion, hiding, restoration, and workflow moderation.",
  },
  {
    id: "user",
    label: "User",
    description: "Sample analysis, IMGT/V-QUEST, comments, and report creation.",
  },
];
