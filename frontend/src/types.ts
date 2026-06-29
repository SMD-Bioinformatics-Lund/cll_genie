export type Provider = {
  id: "local" | "ldap";
  label: string;
};

export type ProvidersPayload = {
  providers: Provider[];
  version: string;
  environment: string;
};

export type User = {
  username: string;
  fullname: string;
  email: string | null;
  roles: string[];
  is_admin: boolean;
  is_lymphotrack: boolean;
};

export type Session = {
  user: User;
  provider: string;
  csrf_token: string;
};

export type Sample = {
  _id: string;
  name: string;
  clarity_id?: string;
  run_id?: string;
  run_number?: string;
  assay?: string;
  sequencer?: string | null;
  is_control?: boolean;
  lymphotrack_excel?: boolean;
  lymphotrack_qc?: boolean;
  vquest?: boolean;
  report?: boolean;
  total_raw_reads?: number;
  total_raw_bases?: number;
  total_bases?: number | string;
  q30_bases?: number | string;
  q30_per?: number | string;
  date_added?: string;
  duplicate_count?: number;
  latest_report_id?: string;
  latest_report_oid?: string;
  latest_report_type?: string;
};

export type SamplesPayload = {
  items: Sample[];
  total: number;
  page: number;
  page_size: number;
};

export type Job = {
  _id: string;
  kind: string;
  status: string;
  progress: number;
  message: string;
  error?: string;
  result?: Record<string, string | number>;
};

export type DraftSequence = {
  sequence_id: string;
  rank: number;
  sequence: string;
  merge_count: number;
  total_reads_percent: number;
  in_frame: boolean;
  no_stop_codon: boolean;
  length?: number;
  v_gene?: string;
  j_gene?: string;
  d_gene?: string;
  v_mutation?: number;
};

export type Draft = {
  _id: string;
  sample_id: string;
  status: string;
  sequences: DraftSequence[];
  metadata: Record<string, unknown>;
};

export type Report = {
  _id: string;
  display_id?: string;
  report_type: string;
  submission_id: string | null;
  summary: string;
  created_by: string;
  created_at: string;
  hidden: boolean;
  file_size?: number;
};
