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
  Wand2,
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
  getSample,
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
  const sample = useQuery({
    queryKey: ["sample", sampleId],
    queryFn: () => getSample(sampleId),
  });
  const suggestion = useQuery({
    queryKey: ["suggestion", sampleId, submissionId],
    queryFn: () => getReportSuggestion(sampleId, submissionId),
    enabled: Boolean(submission.data),
  });
  
  const validComments = submission.data?.submission_comments?.filter(c => !c.hidden) || [];
  const latestCommentText = validComments.length > 0 ? validComments[validComments.length - 1].text : "";
  const [comment, setComment] = useState("");
  const [commentTab, setCommentTab] = useState<"edit" | "preview">("edit");

  // Removed auto-set summary useEffect

  const report = useMutation({
    mutationFn: () =>
      generateReport(sampleId, submissionId, latestCommentText, session.csrf_token),
    onSuccess: (value) =>
      window.open(
        applicationUrl(`/api/v1/reports/${value.report_id}/artifact`),
        `_blank`,
      ),
  });
  const preview = useMutation({
    mutationFn: () =>
      previewReport(sampleId, submissionId, latestCommentText, session.csrf_token),
  });
  const downloadPdf = useMutation({
    mutationFn: () =>
      downloadReportPdf(sampleId, submissionId, latestCommentText, session.csrf_token),
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
    <div className="min-h-screen bg-gray-50 dark:bg-neutral-800 pb-12">
      <div className="bg-white dark:bg-neutral-900 px-8 py-8 border-b border-gray-200 dark:border-neutral-700/50">
        <div className="mx-auto flex max-w-[1536px] flex-wrap items-center justify-between gap-4">
          <div>
            <div className="mb-1 text-xs font-bold tracking-wider text-gray-500 dark:text-gray-400 uppercase flex items-center gap-2">
              <Link to={`/samples/${sampleId}`} className="hover:text-gray-900 dark:hover:text-gray-200 transition-colors">
                Sample: {(sample.data?.sample as any)?.name || sampleId}
              </Link>
              <span className="text-gray-300 dark:text-gray-600">/</span>
              <span>IMGT/V-QUEST Results</span>
            </div>
            <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white">{submissionId}</h1>
          </div>
          <div className="flex gap-3">
            <a
              href={applicationUrl(`/api/v1/samples/${sampleId}/submissions/${submissionId}/zip`)}
              className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white dark:bg-neutral-700 dark:border-gray-700 px-5 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 shadow-sm transition hover:bg-gray-50 dark:hover:bg-gray-700"
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
                className="flex items-center gap-2 rounded-lg bg-red-50 px-5 py-2.5 text-sm font-semibold text-red-600 border border-red-200 shadow-sm transition hover:bg-red-100 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-400 dark:hover:bg-red-500/20"
              >
                <Trash2 size={16} />
                Delete
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto mt-6 flex max-w-[1536px] flex-col gap-6 px-6">
        {removeSubmission.error && (
          <Alert severity="error">{removeSubmission.error.message}</Alert>
        )}

        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-neutral-700/50 bg-white dark:bg-neutral-800 shadow-sm">
          <div className="border-b border-gray-200 dark:border-neutral-700/50 bg-white dark:bg-neutral-800 px-6 py-5">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Analysis Parameters</h2>
          </div>
          <div className="grid grid-cols-1 gap-y-6 gap-x-8 p-8 text-xs sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 bg-gray-50/50 dark:bg-neutral-900/50">
            {Object.entries(submission.data.vquest_parameters).map(([key, value]) => (
              <div key={key} className="flex flex-col border-l-2 border-[#DF7849] dark:border-[#EBA98C] pl-3">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">{key}</span>
                <span className="text-gray-900 dark:text-gray-200 font-medium">{String(value ?? "–")}</span>
              </div>
            ))}
          </div>
        </div>

        {Object.entries(submission.data.vquest_results).map(([id, result]) => (
          <div key={id} className="overflow-hidden rounded-xl border border-gray-200 dark:border-neutral-700/50 bg-white dark:bg-neutral-800 shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-neutral-700/50 bg-white dark:bg-neutral-800 px-6 py-5">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Sequence Id: <span className="text-[#7B4925] dark:text-[#EBA98C]">{id.split("_")[0]}</span></h3>
              <span className="rounded-full bg-[#7B4925]/10 dark:bg-[#EBA98C]/10 px-2.5 py-1.5 text-sm font-bold text-[#7B4925] dark:text-[#EBA98C] border border-[#7B4925]/20 dark:border-[#EBA98C]/20">
                CLL Subset: {String(result.summary["CLL subset"] ?? "–")}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-800 dark:text-gray-300">
                <tbody className="divide-y divide-gray-200/60 dark:divide-neutral-700/50">
                  <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                    <th className="py-2.5 pl-3 pr-2 font-semibold text-gray-600 dark:text-gray-400 w-1/4 bg-gray-50/80 dark:bg-neutral-900/40">Sequence analysis category</th>
                    <td className="py-2.5 px-3 w-1/4 font-medium">{String(result.summary['Sequence analysis category'] ?? "–")}</td>
                    <th className="py-2.5 pl-3 pr-2 font-semibold text-gray-600 dark:text-gray-400 w-1/4 bg-gray-50/80 dark:bg-neutral-900/40">CLL subset</th>
                    <td className="py-2.5 px-3 w-1/4 font-medium">{String(result.summary['CLL subset'] ?? "–")}</td>
                  </tr>
                  
                  {Boolean(result.summary['V-REGION potential ins/del']) && (
                    <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                      <th className="py-2.5 pl-3 pr-2 font-semibold text-gray-600 dark:text-gray-400 bg-gray-50/80 dark:bg-neutral-900/40">V-REGION ins/del</th>
                      <td colSpan={3} className="py-2.5 px-3 text-red-600 dark:text-red-400 font-medium">
                        {String(result.summary['V-REGION potential ins/del'])}
                      </td>
                    </tr>
                  )}
                  
                  {(Boolean(result.summary['V-REGION insertions']) || Boolean(result.summary['V-REGION deletions'])) && (
                    <tr className="bg-yellow-50/50 dark:bg-yellow-900/10">
                      <th className="py-2.5 pl-3 pr-2 font-semibold text-gray-600 dark:text-gray-400 bg-yellow-50/80 dark:bg-yellow-900/20">Indel summary</th>
                      <td colSpan={3} className="py-2.5 px-3">
                        {Boolean(result.summary['V-REGION insertions']) && (
                          <div className="mb-1.5">
                            <span className="block text-xs font-semibold text-[#DF7849] dark:text-[#EBA98C] mb-0.5">Nucleotide insertions have been detected and removed.</span>
                            <i className="text-gray-800 dark:text-gray-300 font-medium">{String(result.summary['V-REGION insertions'])}</i>
                          </div>
                        )}
                        {Boolean(result.summary['V-REGION deletions']) && (
                          <div>
                            <span className="block text-xs font-semibold text-[#DF7849] dark:text-[#EBA98C] mb-0.5">Nucleotide deletions have been detected and removed.</span>
                            <i className="text-gray-800 dark:text-gray-300 font-medium">{String(result.summary['V-REGION deletions'])}</i>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}

                  <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                    <th className="py-2.5 pl-3 pr-2 font-semibold text-gray-600 dark:text-gray-400 bg-gray-50/80 dark:bg-neutral-900/40">V-DOMAIN functionality</th>
                    <td colSpan={3} className="py-2.5 px-3 font-medium">
                      {String(result.summary['V-DOMAIN Functionality'] ?? "–")}
                      {result.summary['V-DOMAIN Functionality comment'] ? <><br/><span className="text-gray-500 dark:text-gray-400 text-xs">{String(result.summary['V-DOMAIN Functionality comment'])}</span></> : null}
                    </td>
                  </tr>

                  <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                    <th className="py-2.5 pl-3 pr-2 font-semibold text-gray-600 dark:text-gray-400 bg-gray-50/80 dark:bg-neutral-900/40">V-GENE and allele</th>
                    <td className="py-2.5 px-3 font-medium">{String(result.summary['V-GENE and allele'] ?? "–")}</td>
                    <th className="py-2.5 pl-3 pr-2 font-semibold text-gray-600 dark:text-gray-400 bg-gray-50/80 dark:bg-neutral-900/40 border-l border-gray-200/60 dark:border-neutral-700/50">Score: {String(result.summary['V-REGION score'] ?? "–")}</th>
                    <td className="py-2.5 px-3 font-medium border-l border-gray-200/60 dark:border-neutral-700/50">
                      Identity: {String(result.summary['V-REGION identity %'] ?? "–")}% 
                      <span className="text-gray-500 dark:text-gray-400 ml-1">({String(result.summary['V-REGION identity nt'] ?? "–")})</span>
                    </td>
                  </tr>

                  <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                    <th className="py-2.5 pl-3 pr-2 font-semibold text-gray-600 dark:text-gray-400 bg-gray-50/80 dark:bg-neutral-900/40">J-GENE and allele</th>
                    <td className="py-2.5 px-3 font-medium">{String(result.summary['J-GENE and allele'] ?? "–")}</td>
                    <th className="py-2.5 pl-3 pr-2 font-semibold text-gray-600 dark:text-gray-400 bg-gray-50/80 dark:bg-neutral-900/40 border-l border-gray-200/60 dark:border-neutral-700/50">Score: {String(result.summary['J-REGION score'] ?? "–")}</th>
                    <td className="py-2.5 px-3 font-medium border-l border-gray-200/60 dark:border-neutral-700/50">
                      Identity: {String(result.summary['J-REGION identity %'] ?? "–")}% 
                      <span className="text-gray-500 dark:text-gray-400 ml-1">({String(result.summary['J-REGION identity nt'] ?? "–")})</span>
                    </td>
                  </tr>

                  <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                    <th className="py-2.5 pl-3 pr-2 font-semibold text-gray-600 dark:text-gray-400 bg-gray-50/80 dark:bg-neutral-900/40">D-GENE and allele</th>
                    <td className="py-2.5 px-3 font-medium">{String(result.summary['D-GENE and allele'] ?? "–")}</td>
                    <th className="py-2.5 pl-3 pr-2 font-semibold text-gray-600 dark:text-gray-400 bg-gray-50/80 dark:bg-neutral-900/40 border-l border-gray-200/60 dark:border-neutral-700/50">D-REGION reading frame</th>
                    <td className="py-2.5 px-3 font-medium border-l border-gray-200/60 dark:border-neutral-700/50">{String(result.summary['D-REGION reading frame'] ?? "–")}</td>
                  </tr>

                  <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                    <th className="py-2.5 pl-3 pr-2 font-semibold text-gray-600 dark:text-gray-400 bg-gray-50/80 dark:bg-neutral-900/40">FR/CDR lengths</th>
                    <td className="py-2.5 px-3 font-medium text-gray-600 dark:text-gray-400">
                      <span className="text-gray-900 dark:text-gray-200 font-medium">{String(result.summary['FR-IMGT lengths'] ?? "–")}</span> / <span className="text-gray-900 dark:text-gray-200 font-medium">[{String(result.summary['CDR-IMGT lengths'] ?? "–")}]</span>
                    </td>
                    <th className="py-2.5 pl-3 pr-2 font-semibold text-gray-600 dark:text-gray-400 bg-gray-50/80 dark:bg-neutral-900/40 border-l border-gray-200/60 dark:border-neutral-700/50">AA JUNCTION</th>
                    <td className="py-2.5 px-3 font-mono text-xs text-[#7B4925] dark:text-[#EBA98C] font-bold tracking-wider break-all border-l border-gray-200/60 dark:border-neutral-700/50">{String(result.summary['AA JUNCTION'] ?? "–")}</td>
                  </tr>

                  <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                    <th className="py-2.5 pl-3 pr-2 font-semibold text-gray-600 dark:text-gray-400 bg-gray-50/80 dark:bg-neutral-900/40">JUNCTION length/decryption</th>
                    <td colSpan={3} className="py-2.5 px-3">
                      {Boolean(result.junction['JUNCTION-nt nb']) && Boolean(result.junction['JUNCTION decryption']) ? (
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {String(result.junction['JUNCTION-nt nb'])} nt = {String(result.junction['JUNCTION decryption'])}
                        </span>
                      ) : (
                        "–"
                      )}
                      <br />
                      <a href="https://www.imgt.org/IMGT_jcta/decryption" target="_blank" rel="noreferrer" className="text-[#DF7849] dark:text-[#EBA98C] hover:underline text-xs mt-1 inline-block font-mono break-all opacity-80">
                        (3'V)3'{'{N1}'}5'(D)3'{'{N2}'}5'(5'J)
                      </a>
                    </td>
                  </tr>

                  <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                    <th className="py-2.5 pl-3 pr-2 font-semibold text-gray-600 dark:text-gray-400 bg-gray-50/80 dark:bg-neutral-900/40">Merge count</th>
                    <td className="py-2.5 px-3 font-medium">{String(result.summary['Merge Count'] ?? "–")}</td>
                    <th className="py-2.5 pl-3 pr-2 font-semibold text-gray-600 dark:text-gray-400 bg-gray-50/80 dark:bg-neutral-900/40 border-l border-gray-200/60 dark:border-neutral-700/50">Total reads</th>
                    <td className="py-2.5 px-3 font-medium border-l border-gray-200/60 dark:border-neutral-700/50">{String(result.summary['Total Reads Per'] ?? "–")}%</td>
                  </tr>
                </tbody>
              </table>
</div>
          </div>
        ))}
        
        {/* Comments and Report Actions */}
        <div className="mt-2 max-w-[1536px] mx-auto">
          <div className="flex flex-col rounded-xl border border-gray-200 dark:border-neutral-700/50 bg-white dark:bg-neutral-800 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="flex items-center gap-2 text-base font-bold text-gray-900 dark:text-gray-100">
                <MessageSquarePlus size={18} className="text-[#7B4925] dark:text-[#EBA98C]" />
                Analysis Comments
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto max-h-[340px] pr-1.5 mb-4 space-y-4">
              {submission.data.submission_comments
                ?.filter((item) => !item.hidden || session.user.permissions.includes("results:delete"))
                .map((item) => (
                  <div key={item.id} className={`rounded-xl border p-4 text-xs shadow-sm ${item.hidden ? "border-red-200 bg-red-50 text-red-900 dark:bg-red-900/10 dark:border-red-900/30 dark:text-red-300" : "border-gray-200 bg-gray-50 dark:bg-neutral-900/50 dark:border-neutral-700/50"}`}>
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
                          className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-sm font-bold transition ${item.hidden ? "bg-white text-blue-700 hover:bg-blue-50 dark:bg-neutral-700 dark:text-blue-400" : "bg-white text-gray-500 hover:bg-gray-200 hover:text-gray-700 dark:bg-neutral-700 dark:text-gray-400 dark:hover:text-gray-200"}`}
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
                  <div className="text-xs text-gray-500 dark:text-gray-400 italic text-center py-8">
                    No comments yet.
                  </div>
                )}
            </div>

            {canComment && (
              <div className="mt-auto border-t border-gray-100 dark:border-neutral-700/50 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Add a Comment</span>
                    {suggestion.data?.text && (
                      <button
                        onClick={() => {
                          setComment(suggestion.data.text);
                          setCommentTab("edit");
                        }}
                        className="flex items-center gap-1.5 rounded-md border border-[#7B4925]/30 bg-[#7B4925]/5 dark:bg-[#EBA98C]/10 px-2.5 py-1.5 text-sm font-bold text-[#7B4925] dark:text-[#EBA98C] transition hover:bg-[#7B4925]/10 dark:hover:bg-[#EBA98C]/20"
                        title="Auto-generate conclusion based on results and comments"
                      >
                        <Wand2 size={12} /> Auto-generate
                      </button>
                    )}
                  </div>
                  <div className="flex bg-gray-100 dark:bg-neutral-700 rounded-lg p-0.5">
                    <button
                      onClick={() => setCommentTab("edit")}
                      className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold transition ${commentTab === "edit" ? "bg-white dark:bg-gray-700 text-[#7B4925] dark:text-[#EBA98C] shadow-sm" : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"}`}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setCommentTab("preview")}
                      className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold transition ${commentTab === "preview" ? "bg-white dark:bg-gray-700 text-[#7B4925] dark:text-[#EBA98C] shadow-sm" : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"}`}
                    >
                      Preview
                    </button>
                  </div>
                </div>
                
                <div className="mb-3">
                  {commentTab === "edit" ? (
                    <textarea
                      className="w-full resize-y rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-neutral-900 p-3 text-sm shadow-inner focus:border-[#7B4925] dark:focus:border-[#EBA98C] focus:outline-none focus:ring-1 focus:ring-[#7B4925] dark:focus:ring-[#EBA98C] dark:text-gray-100 font-mono"
                      rows={6}
                      placeholder="Supports Markdown styling..."
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                    />
                  ) : (
                    <div className="w-full rounded-lg border border-gray-200 dark:border-neutral-700/50 bg-gray-50 dark:bg-neutral-900/50 p-4 min-h-[140px] overflow-y-auto">
                      {comment.trim() ? (
                        <Markdown className="prose dark:prose-invert prose-sm max-w-none prose-p:leading-snug prose-p:my-1">
                          {comment}
                        </Markdown>
                      ) : (
                        <p className="text-gray-400 italic text-xs text-center mt-6">Nothing to preview.</p>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => addComment.mutate()}
                    disabled={!comment.trim()}
                    className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-neutral-700 px-6 py-2.5 text-sm font-bold text-gray-700 dark:text-gray-300 shadow-sm transition hover:bg-gray-50 dark:hover:bg-neutral-600 disabled:opacity-50"
                  >
                    Post Comment
                  </button>
                </div>
              </div>
            )}

            {canReport && (
              <div className="mt-6 border-t border-gray-100 dark:border-neutral-700/50 pt-5">
                <div className="mb-3 text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center justify-between">
                  <span>Report Actions</span>
                  <span className="text-xs text-gray-500 font-normal">Using latest comment as conclusion</span>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    onClick={() => preview.mutate()}
                    disabled={!latestCommentText.trim()}
                    className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-neutral-700 px-2.5 py-1.5 text-sm font-bold text-gray-700 dark:text-gray-300 shadow-sm transition hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                  >
                    Preview HTML
                  </button>
                  <button
                    onClick={() => report.mutate()}
                    disabled={!latestCommentText.trim() || report.isPending}
                    className="flex-1 rounded-lg border border-[#7B4925]/30 bg-[#7B4925]/10 dark:bg-[#DF7849]/10 px-2.5 py-1.5 text-sm font-bold text-[#7B4925] dark:text-[#EBA98C] shadow-sm transition hover:bg-[#7B4925]/20 dark:hover:bg-[#DF7849]/20 disabled:opacity-50"
                  >
                    Save HTML Report
                  </button>
                  <button
                    onClick={() => downloadPdf.mutate()}
                    disabled={!latestCommentText.trim() || downloadPdf.isPending}
                    className="flex-1 rounded-lg bg-[#7B4925] dark:bg-[#DF7849] px-2.5 py-1.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#6a3f20] dark:hover:bg-[#C26336] disabled:opacity-50"
                  >
                    {downloadPdf.isPending ? "Generating..." : "Download PDF"}
                  </button>
                </div>
                {report.error && (
                  <div className="mt-3 text-xs font-semibold text-red-600">{report.error.message}</div>
                )}
                {downloadPdf.error && (
                  <div className="mt-3 text-xs font-semibold text-red-600">{downloadPdf.error.message}</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto mt-8 max-w-[1536px] px-6">
        <Link to={`/samples/${sampleId}`} className="inline-flex items-center gap-2 rounded-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-neutral-700 px-5 py-1 text-xs font-bold text-gray-700 dark:text-gray-300 transition hover:bg-gray-50 dark:hover:bg-gray-700 shadow-sm">
          <ChevronLeft size={16} />
          Return to Sample
        </Link>
      </div>
    </div>
  );
}
