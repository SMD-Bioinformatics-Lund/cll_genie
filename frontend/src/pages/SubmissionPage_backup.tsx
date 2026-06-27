import {
  Alert,
  LinearProgress,
} from "@mui/material";
import {
  Download,
  EyeOff,
  FileCheck2,
  MessageSquarePlus,
  RotateCcw,
  Trash2,
  ChevronLeft,
  Pencil,
  Eye,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Markdown from "react-markdown";
import {
  apiRequest,
  applicationUrl,
  generateReport,
  getReportSuggestion,
  getSubmission,
  previewReport,
  downloadReportPdf,
} from "../api";
import { useSession } from "../session-context";

type SequenceResult = {
  summary: Record<string, unknown>;
  junction: Record<string, unknown>;
};
type Submission = {
  vquest_parameters: Record<string, unknown>;
  vquest_results: Record<string, SequenceResult>;
  submission_comments?: Array<{
    id: string;
    text: string;
    author: string;
    time_created: string;
    hidden: boolean;
  }>;
};

export function SubmissionPage() {
  const { sampleId = "", submissionId = "" } = useParams();
  const { session } = useSession();
  const canReport = session.user.permissions.includes("reports:create");
  const canComment = session.user.permissions.includes("comments:create");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const submission = useQuery({
    queryKey: ["submission", sampleId, submissionId],
    queryFn: () => getSubmission(sampleId, submissionId) as Promise<Submission>,
  });
  const suggestion = useQuery({
    queryKey: ["suggestion", sampleId, submissionId],
    queryFn: () => getReportSuggestion(sampleId, submissionId),
    enabled: Boolean(submission.data),
  });
  
  const [summary, setSummary] = useState("");
  const [summaryTab, setSummaryTab] = useState<"edit" | "preview">("edit");
  const [comment, setComment] = useState("");
  const [commentTab, setCommentTab] = useState<"edit" | "preview">("edit");

  useEffect(() => {
    if (suggestion.data?.text && !summary) setSummary(suggestion.data.text);
  }, [suggestion.data, summary]);

  const report = useMutation({
    mutationFn: () =>
      generateReport(sampleId, submissionId, summary, session.csrf_token),
    onSuccess: (value) =>
      window.open(
        applicationUrl(`/api/v1/reports/${value.report_id}/artifact`),
        `_blank`,
      ),
  });
  const preview = useMutation({
    mutationFn: () =>
      previewReport(sampleId, submissionId, summary, session.csrf_token),
  });
  const downloadPdf = useMutation({
    mutationFn: () =>
      downloadReportPdf(sampleId, submissionId, summary, session.csrf_token),
  });
  const addComment = useMutation({
    mutationFn: () =>
      apiRequest(
        `/api/v1/samples/${sampleId}/submissions/${submissionId}/comments`,
        { method: "POST", body: JSON.stringify({ text: comment }) },
        session.csrf_token,
      ),
    onSuccess: () => {
      setComment("");
      setCommentTab("edit");
      queryClient.invalidateQueries({
        queryKey: ["submission", sampleId, submissionId],
      });
    },
  });
  const toggleComment = useMutation({
    mutationFn: (
      item: NonNullable<Submission["submission_comments"]>[number],
    ) =>
      apiRequest(
        `/api/v1/samples/${sampleId}/submissions/${submissionId}/comments/${item.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ hidden: !item.hidden }),
        },
        session.csrf_token,
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["submission", sampleId, submissionId],
      }),
  });
  const removeSubmission = useMutation({
    mutationFn: () =>
      apiRequest<void>(
        `/api/v1/samples/${sampleId}/submissions/${submissionId}`,
        { method: "DELETE" },
        session.csrf_token,
      ),
    onSuccess: () => navigate(`/samples/${sampleId}`, { replace: true }),
  });

  if (submission.isLoading) return <LinearProgress />;
  if (!submission.data)
    return (
      <div className="p-8">
        <Alert severity="error">Submission could not be loaded.</Alert>
      </div>
    );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-12">
      <div className="bg-white dark:bg-gray-950 px-6 py-6 border-b border-gray-200 dark:border-gray-800">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div>
            <div className="mb-1 text-xs font-bold tracking-wider text-gray-500 dark:text-gray-400 uppercase">
              IMGT/V-QUEST Results
            </div>
            <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white">{submissionId}</h1>
          </div>
          <div className="flex gap-3">
            <a
              href={applicationUrl(`/api/v1/samples/${sampleId}/submissions/${submissionId}/zip`)}
              className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white dark:bg-gray-800 dark:border-gray-700 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 shadow-sm transition hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <Download size={16} />
              Download ZIP
            </a>
            {session.user.permissions.includes("results:delete") && (
              <button
                disabled={removeSubmission.isPending}
                onClick={() => {
                  if (window.confirm("Delete this analysis submission? This cannot be undone."))
                    removeSubmission.mutate();
                }}
                className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 border border-red-200 shadow-sm transition hover:bg-red-100 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-400 dark:hover:bg-red-500/20"
              >
                <Trash2 size={16} />
                Delete
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto mt-6 flex max-w-7xl flex-col gap-6 px-6">
        {removeSubmission.error && (
          <Alert severity="error">{removeSubmission.error.message}</Alert>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {canReport && (
            <div className="flex flex-col rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="flex items-center gap-2 text-base font-bold text-gray-900 dark:text-gray-100">
                  <FileCheck2 size={18} className="text-[#7B4925] dark:text-[#EBA98C]"/>
                  Report Conclusion
                </h2>
                <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                  <button
                    onClick={() => setSummaryTab("edit")}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition ${summaryTab === "edit" ? "bg-white dark:bg-gray-700 text-[#7B4925] dark:text-[#EBA98C] shadow-sm" : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"}`}
                  >
                    <Pencil size={12} /> Edit
                  </button>
                  <button
                    onClick={() => setSummaryTab("preview")}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition ${summaryTab === "preview" ? "bg-white dark:bg-gray-700 text-[#7B4925] dark:text-[#EBA98C] shadow-sm" : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"}`}
                  >
                    <Eye size={12} /> Preview
                  </button>
                </div>
              </div>
              
              <div className="mb-4 flex-1">
                {summaryTab === "edit" ? (
                  <textarea
                    className="w-full h-[380px] resize-none rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 p-4 text-sm focus:border-[#7B4925] dark:focus:border-[#EBA98C] focus:outline-none focus:ring-1 focus:ring-[#7B4925] dark:focus:ring-[#EBA98C] dark:text-gray-100 font-mono shadow-inner"
                    placeholder="Write your report conclusion here using Markdown..."
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                  />
                ) : (
                  <div className="w-full h-[380px] rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950/50 p-5 overflow-y-auto">
                    {summary.trim() ? (
                      <Markdown className="prose dark:prose-invert prose-sm max-w-none prose-headings:text-[#7B4925] dark:prose-headings:text-[#EBA98C] prose-a:text-[#DF7849] dark:prose-a:text-[#EBA98C]">
                        {summary}
                      </Markdown>
                    ) : (
                      <p className="text-gray-400 italic text-sm text-center mt-32">No conclusion written yet.</p>
                    )}
                  </div>
                )}
              </div>
              
              <div className="mt-auto flex gap-3">
                <button
                  onClick={() => preview.mutate()}
                  disabled={!summary.trim()}
                  className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm font-bold text-gray-700 dark:text-gray-300 shadow-sm transition hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  Draft PDF
                </button>
                <button
                  onClick={() => report.mutate()}
                  disabled={!summary.trim() || report.isPending}
                  className="flex-1 rounded-lg bg-[#7B4925] dark:bg-[#DF7849] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#6a3f20] dark:hover:bg-[#C26336] disabled:opacity-50"
                >
                  Create PDF Report
                </button>
              </div>
              {report.error && (
                <div className="mt-3 text-xs font-semibold text-red-600">{report.error.message}</div>
              )}
            </div>
          )}

          <div className="flex flex-col rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="flex items-center gap-2 text-base font-bold text-gray-900 dark:text-gray-100">
                <MessageSquarePlus size={18} className="text-[#7B4925] dark:text-[#EBA98C]" />
                Analysis Comments
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto max-h-[340px] pr-2 mb-4 space-y-4">
              {submission.data.submission_comments
                ?.filter((item) => !item.hidden || session.user.permissions.includes("results:delete"))
                .map((item) => (
                  <div key={item.id} className={`rounded-xl border p-4 text-sm shadow-sm ${item.hidden ? "border-red-200 bg-red-50 text-red-900 dark:bg-red-900/10 dark:border-red-900/30 dark:text-red-300" : "border-gray-200 bg-gray-50 dark:bg-gray-950/50 dark:border-gray-800"}`}>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex size-7 items-center justify-center rounded-full bg-[#7B4925] dark:bg-[#EBA98C] text-xs font-bold text-white dark:text-gray-900">
                          {item.author.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-bold text-gray-900 dark:text-gray-200">{item.author}</span>
                      </div>
                      {session.user.permissions.includes("results:delete") && (
                        <button
                          onClick={() => toggleComment.mutate(item)}
                          className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold transition ${item.hidden ? "bg-white text-blue-700 hover:bg-blue-50 dark:bg-gray-800 dark:text-blue-400" : "bg-white text-gray-500 hover:bg-gray-200 hover:text-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:text-gray-200"}`}
                        >
                          {item.hidden ? <><RotateCcw size={12} /> Restore</> : <><EyeOff size={12} /> Hide</>}
                        </button>
                      )}
                    </div>
                    <div className="pl-9 text-gray-700 dark:text-gray-300">
                      <Markdown className="prose dark:prose-invert prose-sm max-w-none prose-p:leading-snug prose-p:my-1">
                        {item.text}
                      </Markdown>
                    </div>
                  </div>
                ))}
                {!submission.data.submission_comments?.length && (
                  <div className="text-sm text-gray-500 dark:text-gray-400 italic text-center py-8">
                    No comments yet.
                  </div>
                )}
            </div>

            {canComment && (
              <div className="mt-auto border-t border-gray-100 dark:border-gray-800 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Add a Comment</span>
                  <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
                    <button
                      onClick={() => setCommentTab("edit")}
                      className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition ${commentTab === "edit" ? "bg-white dark:bg-gray-700 text-[#7B4925] dark:text-[#EBA98C] shadow-sm" : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"}`}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setCommentTab("preview")}
                      className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition ${commentTab === "preview" ? "bg-white dark:bg-gray-700 text-[#7B4925] dark:text-[#EBA98C] shadow-sm" : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"}`}
                    >
                      Preview
                    </button>
                  </div>
                </div>
                
                <div className="mb-3">
                  {commentTab === "edit" ? (
                    <textarea
                      className="w-full resize-none rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 p-3 text-sm shadow-inner focus:border-[#7B4925] dark:focus:border-[#EBA98C] focus:outline-none focus:ring-1 focus:ring-[#7B4925] dark:focus:ring-[#EBA98C] dark:text-gray-100 font-mono"
                      rows={4}
                      placeholder="Supports Markdown styling..."
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                    />
                  ) : (
                    <div className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950/50 p-4 h-[106px] overflow-y-auto">
                      {comment.trim() ? (
                        <Markdown className="prose dark:prose-invert prose-sm max-w-none prose-p:leading-snug prose-p:my-1">
                          {comment}
                        </Markdown>
                      ) : (
                        <p className="text-gray-400 italic text-sm text-center mt-6">Nothing to preview.</p>
                      )}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => addComment.mutate()}
                  disabled={!comment.trim()}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm font-bold text-gray-700 dark:text-gray-300 shadow-sm transition hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  Post Comment
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
          <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-5 py-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Analysis Parameters</h2>
          </div>
          <div className="grid grid-cols-1 gap-y-4 gap-x-6 p-6 text-sm sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 bg-gray-50/50 dark:bg-gray-950/50">
            {Object.entries(submission.data.vquest_parameters).map(([key, value]) => (
              <div key={key} className="flex flex-col border-l-2 border-[#DF7849] dark:border-[#EBA98C] pl-3">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">{key}</span>
                <span className="text-gray-900 dark:text-gray-200 font-medium">{String(value ?? "–")}</span>
              </div>
            ))}
          </div>
        </div>

        {Object.entries(submission.data.vquest_results).map(([id, result]) => (
          <div key={id} className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-5 py-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Sequence Id: <span className="text-[#7B4925] dark:text-[#EBA98C]">{id.split("_")[0]}</span></h3>
              <span className="rounded-full bg-[#7B4925]/10 dark:bg-[#EBA98C]/10 px-3 py-1 text-xs font-bold text-[#7B4925] dark:text-[#EBA98C] border border-[#7B4925]/20 dark:border-[#EBA98C]/20">
                CLL Subset: {String(result.summary["CLL subset"] ?? "–")}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-700 dark:text-gray-300">
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800/50">
                  <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                    <th className="py-3 pl-5 pr-3 font-semibold text-gray-900 dark:text-gray-200 w-1/4 bg-gray-50 dark:bg-gray-950/50">Merge Count</th>
                    <td className="py-3 pr-5 w-1/4">{String(result.summary['Merge Count'] ?? "–")}</td>
                    <th className="py-3 pl-4 pr-3 font-semibold text-gray-900 dark:text-gray-200 w-1/4 bg-gray-50 dark:bg-gray-950/50">Reads %</th>
                    <td className="py-3 pr-5 w-1/4">{String(result.summary['Total Reads Per'] ?? "–")}%</td>
                  </tr>
                  <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                    <th className="py-3 pl-5 pr-3 font-semibold text-gray-900 dark:text-gray-200 bg-gray-50 dark:bg-gray-950/50">Sequence length</th>
                    <td className="py-3 pr-5">{String(result.summary['Analysed sequence length'] ?? "–")}</td>
                    <th className="py-3 pl-4 pr-3 font-semibold text-gray-900 dark:text-gray-200 bg-gray-50 dark:bg-gray-950/50">Analysis category</th>
                    <td className="py-3 pr-5">{String(result.summary['Sequence analysis category'] ?? "–")}</td>
                  </tr>
                  {Boolean(result.summary['V-REGION potential ins/del']) && (
                    <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                      <th className="py-3 pl-5 pr-3 font-semibold text-gray-900 dark:text-gray-200 bg-gray-50 dark:bg-gray-950/50">V-REGION ins/del</th>
                      <td colSpan={3} className="py-3 pr-5 text-red-600 dark:text-red-400 font-medium">
                        {String(result.summary['V-REGION potential ins/del'])}
                      </td>
                    </tr>
                  )}
                  {(Boolean(result.summary['V-REGION insertions']) || Boolean(result.summary['V-REGION deletions'])) && (
                    <tr className="bg-yellow-50/50 dark:bg-yellow-900/10">
                      <th className="py-3 pl-5 pr-3 font-semibold text-gray-900 dark:text-gray-200">Indel Summary</th>
                      <td colSpan={3} className="py-3 pr-5">
                        {Boolean(result.summary['V-REGION insertions']) && (
                          <div className="mb-1.5">
                            <span className="block text-xs font-semibold text-[#DF7849] dark:text-[#EBA98C] mb-0.5">Nucleotide insertions have been detected and removed.</span>
                            <i className="text-gray-800 dark:text-gray-300">{String(result.summary['V-REGION insertions'])}</i>
                          </div>
                        )}
                        {Boolean(result.summary['V-REGION deletions']) && (
                          <div>
                            <span className="block text-xs font-semibold text-[#DF7849] dark:text-[#EBA98C] mb-0.5">Nucleotide deletions have been detected and removed.</span>
                            <i className="text-gray-800 dark:text-gray-300">{String(result.summary['V-REGION deletions'])}</i>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                  <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                    <th className="py-3 pl-5 pr-3 font-semibold text-gray-900 dark:text-gray-200 bg-gray-50 dark:bg-gray-950/50">V-GENE and allele</th>
                    <td className="py-3 pr-5">{String(result.summary['V-GENE and allele'] ?? "–")}</td>
                    <th className="py-3 pl-4 pr-3 font-semibold text-gray-900 dark:text-gray-200 bg-gray-50 dark:bg-gray-950/50">V-REGION identity %</th>
                    <td className="py-3 pr-5">{String(result.summary['V-REGION identity %'] ?? "–")}%</td>
                  </tr>
                  <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                    <th className="py-3 pl-5 pr-3 font-semibold text-gray-900 dark:text-gray-200 bg-gray-50 dark:bg-gray-950/50">J-GENE and allele</th>
                    <td className="py-3 pr-5">{String(result.summary['J-GENE and allele'] ?? "–")}</td>
                    <th className="py-3 pl-4 pr-3 font-semibold text-gray-900 dark:text-gray-200 bg-gray-50 dark:bg-gray-950/50">J-REGION identity %</th>
                    <td className="py-3 pr-5">{String(result.summary['J-REGION identity %'] ?? "–")}%</td>
                  </tr>
                  <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                    <th className="py-3 pl-5 pr-3 font-semibold text-gray-900 dark:text-gray-200 bg-gray-50 dark:bg-gray-950/50">D-GENE and allele</th>
                    <td className="py-3 pr-5">{String(result.summary['D-GENE and allele'] ?? "–")}</td>
                    <th className="py-3 pl-4 pr-3 font-semibold text-gray-900 dark:text-gray-200 bg-gray-50 dark:bg-gray-950/50">D-REGION frame</th>
                    <td className="py-3 pr-5">{String(result.summary['D-REGION reading frame'] ?? "–")}</td>
                  </tr>
                  <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                    <th className="py-3 pl-5 pr-3 font-semibold text-gray-900 dark:text-gray-200 bg-gray-50 dark:bg-gray-950/50">FR-IMGT lengths</th>
                    <td className="py-3 pr-5">{String(result.summary['FR-IMGT lengths'] ?? "–")}</td>
                    <th className="py-3 pl-4 pr-3 font-semibold text-gray-900 dark:text-gray-200 bg-gray-50 dark:bg-gray-950/50">CDR-IMGT lengths</th>
                    <td className="py-3 pr-5">[{String(result.summary['CDR-IMGT lengths'] ?? "–")}]</td>
                  </tr>
                  <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                    <th className="py-3 pl-5 pr-3 font-semibold text-gray-900 dark:text-gray-200 bg-gray-50 dark:bg-gray-950/50">AA JUNCTION</th>
                    <td colSpan={3} className="py-3 pr-5 font-mono text-xs text-[#7B4925] dark:text-[#EBA98C] font-bold tracking-wider break-all">{String(result.summary['AA JUNCTION'] ?? "–")}</td>
                  </tr>
                  <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                    <th className="py-3 pl-5 pr-3 font-semibold text-gray-900 dark:text-gray-200 bg-gray-50 dark:bg-gray-950/50">JUNCTION decryption</th>
                    <td colSpan={3} className="py-3 pr-5">
                      {Boolean(result.summary['JUNCTION-nt nb']) && Boolean(result.summary['JUNCTION decryption']) ? (
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {String(result.summary['JUNCTION-nt nb'])} nt = {String(result.summary['JUNCTION decryption'])}
                        </span>
                      ) : (
                        "–"
                      )}
                      <br />
                      <a href="https://www.imgt.org/IMGT_jcta/decryption" target="_blank" rel="noreferrer" className="text-[#DF7849] dark:text-[#EBA98C] hover:underline text-xs mt-1 inline-block font-mono break-all">
                        (3'V)3'{'{N1}'}5'(D)3'{'{N2}'}5'(5'J)
                      </a>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
      
      <div className="mx-auto mt-8 max-w-7xl px-6">
        <Link to={`/samples/${sampleId}`} className="inline-flex items-center gap-2 rounded-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-5 py-2.5 text-sm font-bold text-gray-700 dark:text-gray-300 transition hover:bg-gray-50 dark:hover:bg-gray-700 shadow-sm">
          <ChevronLeft size={16} />
          Return to Sample
        </Link>
      </div>
    </div>
  );
}
