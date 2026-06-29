import type {
  Draft,
  Job,
  ProvidersPayload,
  Report,
  SamplesPayload,
  Session,
} from "./types";

type ApiErrorBody = { detail?: string };

function normalizeBasePath(baseUrl: string): string {
  let base = baseUrl || "/";

  if (!base.startsWith("/")) {
    base = `/${base}`;
  }

  if (base.endsWith("/") && base !== "/") {
    base = base.slice(0, -1);
  }

  return base === "/" ? "" : base;
}

export const APP_BASE_PATH = normalizeBasePath(import.meta.env.BASE_URL);

export function applicationUrl(path: string): string {
  if (path === APP_BASE_PATH || path.startsWith(`${APP_BASE_PATH}/`)) {
    return path;
  }

  return path.startsWith("/") ? `${APP_BASE_PATH}${path}` : path;
}

async function parseError(response: Response): Promise<Error> {
  const fallback = `Request failed (${response.status})`;
  try {
    const body = (await response.json()) as ApiErrorBody;
    return new Error(body.detail || fallback);
  } catch {
    return new Error(fallback);
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  csrfToken?: string,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }
  if (csrfToken) headers.set("X-CSRF-Token", csrfToken);
  const response = await fetch(applicationUrl(path), {
    ...options,
    headers,
    credentials: "same-origin",
  });
  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function getProviders(): Promise<ProvidersPayload> {
  const response = await fetch(applicationUrl("/api/v1/auth/providers"), {
    credentials: "same-origin",
  });
  if (!response.ok) throw await parseError(response);
  return response.json() as Promise<ProvidersPayload>;
}

export async function getSession(): Promise<Session | null> {
  const response = await fetch(applicationUrl("/api/v1/auth/me"), {
    credentials: "same-origin",
  });
  if (response.status === 401) return null;
  if (!response.ok) throw await parseError(response);
  return response.json() as Promise<Session>;
}

export async function updateUserSettings(
  payload: { fullname?: string; password?: string },
  csrfToken: string,
): Promise<{ updated: boolean }> {
  return apiRequest<{ updated: boolean }>("/api/v1/auth/me", {
    method: "PATCH",
    body: JSON.stringify(payload),
  }, csrfToken);
}

export async function login(
  provider: "local" | "ldap",
  username: string,
  password: string,
): Promise<Session> {
  const response = await fetch(applicationUrl("/api/v1/auth/login"), {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, username, password }),
  });
  if (!response.ok) throw await parseError(response);
  return response.json() as Promise<Session>;
}

export async function logout(csrfToken: string): Promise<void> {
  const response = await fetch(applicationUrl("/api/v1/auth/logout"), {
    method: "POST",
    credentials: "same-origin",
    headers: { "X-CSRF-Token": csrfToken },
  });
  if (!response.ok) throw await parseError(response);
}

export function listSamples(
  search = "",
  status?: boolean,
  page = 1,
): Promise<SamplesPayload> {
  const query = new URLSearchParams({
    search,
    page: String(page),
    page_size: "25",
  });
  if (status !== undefined) query.set("report_status", String(status));
  return apiRequest(`/api/v1/samples?${query}`);
}

export function getSample(sampleId: string) {
  return apiRequest<{
    sample: Record<string, unknown>;
    submissions: Record<string, unknown>;
    reports: Report[];
  }>(`/api/v1/samples/${sampleId}`);
}

export function uploadSampleArtifact(
  sampleId: string,
  kind: "lymphotrack-excel" | "lymphotrack-qc",
  file: File,
  csrfToken: string,
) {
  const data = new FormData();
  data.append("file", file);
  return apiRequest(
    `/api/v1/samples/${sampleId}/artifacts/${kind}`,
    { method: "POST", body: data },
    csrfToken,
  );
}

export function deleteSample(sampleId: string, csrfToken: string) {
  return apiRequest(
    `/api/v1/samples/${sampleId}`,
    { method: "DELETE" },
    csrfToken,
  );
}

export function updateSampleJson(
  sampleId: string,
  payload: Record<string, unknown>,
  csrfToken: string,
) {
  return apiRequest(
    `/api/v1/samples/${sampleId}`,
    { method: "PATCH", body: JSON.stringify(payload) },
    csrfToken,
  );
}

export function previewSequences(
  sampleId: string,
  filters: Record<string, unknown>,
  csrfToken: string,
) {
  return apiRequest<{ job_id: string }>(
    `/api/v1/samples/${sampleId}/preview-sequences`,
    { method: "POST", body: JSON.stringify(filters) },
    csrfToken,
  );
}

export function getJob(jobId: string): Promise<Job> {
  return apiRequest(`/api/v1/jobs/${jobId}`);
}



export function submitVquest(
  sampleId: string,
  sequences: any[],
  options: Record<string, unknown>,
  csrfToken: string,
) {
  return apiRequest<{ job_id: string }>(
    `/api/v1/samples/${sampleId}/submit-vquest`,
    {
      method: "POST",
      body: JSON.stringify({ sequences, options }),
    },
    csrfToken,
  );
}

export function deleteSubmission(
  sampleId: string,
  submissionId: string,
  csrfToken: string,
) {
  return apiRequest(
    `/api/v1/samples/${sampleId}/submissions/${submissionId}`,
    { method: "DELETE" },
    csrfToken,
  );
}

export function deleteReport(
  reportId: string,
  csrfToken: string,
) {
  return apiRequest(
    `/api/v1/reports/${reportId}`,
    { method: "DELETE" },
    csrfToken,
  );
}


export function getSubmission(sampleId: string, submissionId: string) {
  return apiRequest<Record<string, unknown>>(
    `/api/v1/samples/${sampleId}/submissions/${submissionId}`,
  );
}

export function getReportSuggestion(sampleId: string, submissionId: string) {
  return apiRequest<{
    text: string;
    facts: Record<string, unknown>;
    rule_trace: unknown[];
  }>(
    `/api/v1/samples/${sampleId}/submissions/${submissionId}/report-suggestion`,
  );
}

export function generateReport(
  sampleId: string,
  submissionId: string,
  summary: string,
  csrfToken: string,
) {
  return apiRequest<{ report_id: string }>(
    `/api/v1/samples/${sampleId}/submissions/${submissionId}/reports`,
    { method: "POST", body: JSON.stringify({ summary }) },
    csrfToken,
  );
}

export async function previewReport(
  sampleId: string,
  submissionId: string,
  summary: string,
  csrfToken: string,
) {
  const response = await fetch(
    applicationUrl(
      `/api/v1/samples/${sampleId}/submissions/${submissionId}/report-preview`,
    ),
    {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
      },
      body: JSON.stringify({ summary, base_url: window.location.origin }),
    },
  );
  if (!response.ok) throw await parseError(response);
  const blob = new Blob([await response.text()], { type: "text/html" });
  window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer");
}

export async function downloadReportPdf(
  sampleId: string,
  submissionId: string,
  summary: string,
  csrfToken: string,
) {
  const response = await fetch(
    applicationUrl(
      `/api/v1/samples/${sampleId}/submissions/${submissionId}/report-pdf`,
    ),
    {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
      },
      body: JSON.stringify({ summary }),
    },
  );
  if (!response.ok) throw await parseError(response);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `CLL_Genie_Report_${sampleId}_${submissionId}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export function generateNegativeReport(
  sampleId: string,
  summary: string,
  csrfToken: string,
) {
  return apiRequest<{ report_id: string }>(
    `/api/v1/samples/${sampleId}/negative-report`,
    { method: "POST", body: JSON.stringify({ summary }) },
    csrfToken,
  );
}
