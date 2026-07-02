import {
  Alert,
  LinearProgress,
} from "../components/ui";
import {
  Download,
  EyeOff,
  MessageSquarePlus,
  RotateCcw,
  Trash2,
  ChevronLeft,
  Wand2,
  Bold,
  Italic,
  Strikethrough,
  Code,
  Quote,
  Link as LinkIcon,
  List,
  ListOrdered,
  Heading2,
  Minus,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useRef } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import Markdown from "react-markdown";
import {
  apiRequest,
  applicationUrl,
  getReportSuggestion,
  getSubmission,
  previewReport,
  downloadReportPdf,
  getSample,
  deleteSubmission,
} from "../api";
import { useSession } from "../session-context";
import { timeAgo } from "../dateUtils";
import { ConfirmModal } from "../components/ConfirmModal";

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
  const canReport = session.user.can_analyze;
  const canComment = session.user.can_analyze;
  const canModerate = session.user.can_moderate;
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
  
  const vquestParameters = submission.data?.vquest_parameters ?? {};
  const vquestResults = submission.data?.vquest_results ?? {};
  const hasMalformedSubmission = Boolean(submission.data) && (
    !submission.data?.vquest_parameters || !submission.data?.vquest_results
  );
  const validComments = [...(submission.data?.submission_comments || [])].filter(c => !c.hidden).sort((a, b) => new Date(b.time_created).getTime() - new Date(a.time_created).getTime());
  const latestCommentText = validComments.length > 0 ? validComments[0].text : "";
  const [comment, setComment] = useState("");
  const [commentTab, setCommentTab] = useState<"edit" | "preview">("edit");
  const [commentPage, setCommentPage] = useState(1);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertMarkdown = (prefix: string, suffix: string = "") => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selectedText = text.substring(start, end);

    const before = text.substring(0, start);
    const after = text.substring(end);
    
    const insertion = suffix === "" && selectedText === "" 
      ? prefix
      : `${prefix}${selectedText || (suffix ? 'text' : '')}${suffix}`;

    const newValue = before + insertion + after;
    setComment(newValue);

    setTimeout(() => {
      textarea.focus();
      if (selectedText === "" && suffix) {
        textarea.setSelectionRange(start + prefix.length, start + prefix.length + 4);
      } else {
        textarea.setSelectionRange(start + prefix.length, start + prefix.length + selectedText.length);
      }
    }, 0);
  };
  
  const COMMENTS_PER_PAGE = 2;
  const allComments = [...(submission.data?.submission_comments || [])].sort((a, b) => new Date(b.time_created).getTime() - new Date(a.time_created).getTime());
  const totalCommentPages = Math.ceil(allComments.length / COMMENTS_PER_PAGE);
  const paginatedComments = allComments.slice((commentPage - 1) * COMMENTS_PER_PAGE, commentPage * COMMENTS_PER_PAGE);
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    destructive?: boolean;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const confirmAction = (title: string, message: string, destructive: boolean, onConfirm: () => void) => {
    setConfirmConfig({ isOpen: true, title, message, destructive, onConfirm });
  };

  const removeSubmission = useMutation({
    mutationFn: () =>
      deleteSubmission(sampleId, submissionId, session.csrf_token),
    onSuccess: () => {
      toast.success("Submission deleted successfully");
      navigate(`/samples/${sampleId}`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete submission: ${error.message}`);
    }
  });

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.data?.type === "REPORT_SAVED") {
        queryClient.invalidateQueries({
          queryKey: ["sample", sampleId],
        });
        toast.success("Report saved successfully");
        navigate("/");
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [navigate, queryClient, sampleId]);

  const preview = useMutation({
    mutationFn: () =>
      previewReport(sampleId, submissionId, latestCommentText, session.csrf_token),
    onError: (error: Error) => {
      toast.error(`Failed to generate preview: ${error.message}`);
    }
  });
  
  const downloadPdf = useMutation({
    mutationFn: () =>
      downloadReportPdf(sampleId, submissionId, latestCommentText, session.csrf_token),
    onSuccess: () => {
      toast.success("PDF downloaded successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to download PDF: ${error.message}`);
    }
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
      toast.success("Comment posted successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to post comment: ${error.message}`);
    }
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
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["submission", sampleId, submissionId],
      });
      toast.success("Comment status updated");
    },
    onError: (error: Error) => {
      toast.error(`Failed to update comment: ${error.message}`);
    }
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
        <div className="mx-auto flex max-w-[1728px] flex-wrap items-center justify-between gap-4">
          <div>
            <div className="mb-1 text-xs font-bold tracking-wider text-gray-500 dark:text-gray-400 uppercase flex items-center gap-2">
              <Link to={`/samples/${sampleId}`} className="hover:text-gray-900 dark:hover:text-gray-200 transition-colors">
                Sample: {sample.data?.sample.name || sampleId}
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
            {canModerate && (
              <button
                disabled={removeSubmission.isPending}
                onClick={() => {
                  confirmAction(
                    "Delete Submission",
                    "Delete this analysis submission? This cannot be undone.",
                    true,
                    () => removeSubmission.mutate()
                  );
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

      <div className="mx-auto mt-6 flex max-w-[1728px] flex-col gap-6 px-6">
        {removeSubmission.error && (
          <Alert severity="error">{removeSubmission.error.message}</Alert>
        )}
        {hasMalformedSubmission && (
          <Alert severity="error">
            This submission is missing parsed IMGT/V-QUEST result sections. The raw
            record was loaded, but it cannot be rendered as an analysis result.
          </Alert>
        )}

        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-neutral-700/50 bg-white dark:bg-neutral-800 shadow-sm">
          <div className="border-b border-gray-200 dark:border-neutral-700/50 bg-white dark:bg-neutral-800 px-6 py-5">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Analysis Parameters</h2>
          </div>
          <div className="grid grid-cols-1 gap-y-6 gap-x-8 p-8 text-xs sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 bg-gray-50/50 dark:bg-neutral-900/50">
            {Object.entries(vquestParameters).map(([key, value]) => (
              <div key={key} className="flex flex-col border-l-2 border-brand-detail dark:border-brand-detail pl-3">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">{key}</span>
                <span className="text-gray-900 dark:text-gray-200 font-medium">{String(value ?? "–")}</span>
              </div>
            ))}
          </div>
        </div>

        {Object.entries(vquestResults).map(([id, result]) => (
          <div key={id} className="overflow-hidden rounded-xl border border-gray-200 dark:border-neutral-700/50 bg-white dark:bg-neutral-800 shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-neutral-700/50 bg-white dark:bg-neutral-800 px-6 py-5">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Sequence Id: <span className="text-brand-primary">{id.split("_")[0]}</span></h3>
              <span className={`rounded-full px-2.5 py-1.5 text-sm font-bold border ${
                String(result.summary["CLL subset"] ?? "–") === "2" || String(result.summary["CLL subset"] ?? "–") === "8"
                  ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800/40"
                  : String(result.summary["CLL subset"] ?? "–") !== "–" && String(result.summary["CLL subset"] ?? "–") !== "None"
                  ? "bg-brand-primary/10 text-brand-primary border-brand-primary/20 dark:bg-brand-detail/10 dark:border-brand-detail/20"
                  : "bg-gray-100 text-gray-500 border-gray-200 dark:bg-neutral-800 dark:text-gray-400 dark:border-neutral-700"
              }`}>
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
                            <span className="block text-xs font-semibold text-brand-detail dark:text-brand-detail mb-0.5">Nucleotide insertions have been detected and removed.</span>
                            <i className="text-gray-800 dark:text-gray-300 font-medium">{String(result.summary['V-REGION insertions'])}</i>
                          </div>
                        )}
                        {Boolean(result.summary['V-REGION deletions']) && (
                          <div>
                            <span className="block text-xs font-semibold text-brand-detail dark:text-brand-detail mb-0.5">Nucleotide deletions have been detected and removed.</span>
                            <i className="text-gray-800 dark:text-gray-300 font-medium">{String(result.summary['V-REGION deletions'])}</i>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}

                  <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                    <th className="py-2.5 pl-3 pr-2 font-semibold text-gray-600 dark:text-gray-400 bg-gray-50/80 dark:bg-neutral-900/40">V-DOMAIN functionality</th>
                    <td colSpan={3} className="py-2.5 px-3">
                      <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold border ${
                        String(result.summary['V-DOMAIN Functionality']).toLowerCase().includes("productive") && !String(result.summary['V-DOMAIN Functionality']).toLowerCase().includes("unproductive")
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/40"
                          : String(result.summary['V-DOMAIN Functionality']).toLowerCase().includes("unproductive")
                          ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800/40"
                          : "bg-gray-100 text-gray-600 border-gray-200 dark:bg-neutral-800 dark:text-gray-400 dark:border-neutral-700"
                      }`}>
                        {String(result.summary['V-DOMAIN Functionality'] ?? "–")}
                      </span>
                      {result.summary['V-DOMAIN Functionality comment'] ? <><br/><span className="text-gray-500 dark:text-gray-400 text-xs mt-1 inline-block">{String(result.summary['V-DOMAIN Functionality comment'])}</span></> : null}
                    </td>
                  </tr>

                  <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                    <th className="py-2.5 pl-3 pr-2 font-semibold text-gray-600 dark:text-gray-400 bg-gray-50/80 dark:bg-neutral-900/40">V-GENE and allele</th>
                    <td className="py-2.5 px-3 font-medium">{String(result.summary['V-GENE and allele'] ?? "–")}</td>
                    <th className="py-2.5 pl-3 pr-2 font-semibold text-gray-600 dark:text-gray-400 bg-gray-50/80 dark:bg-neutral-900/40 border-l border-gray-200/60 dark:border-neutral-700/50">Score: {String(result.summary['V-REGION score'] ?? "–")}</th>
                    <td className="py-2.5 px-3 border-l border-gray-200/60 dark:border-neutral-700/50">
                      <span className="text-gray-600 dark:text-gray-400 mr-1">Identity:</span>
                      <span 
                        title={parseFloat(String(result.summary['V-REGION identity %'])) >= 98 ? "U-CLL (Unmutated)" : parseFloat(String(result.summary['V-REGION identity %'])) >= 97 ? "Borderline" : "M-CLL (Mutated)"}
                        className={`inline-block rounded-md px-1.5 py-0.5 text-xs font-bold border cursor-help ${
                        parseFloat(String(result.summary['V-REGION identity %'])) >= 98
                          ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800/40"
                          : parseFloat(String(result.summary['V-REGION identity %'])) >= 97
                          ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800/40"
                          : parseFloat(String(result.summary['V-REGION identity %'])) < 97
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/40"
                          : "font-medium text-gray-900 dark:text-gray-100 border-transparent"
                      }`}>
                        {String(result.summary['V-REGION identity %'] ?? "–")}% 
                      </span>
                      <span className="text-gray-500 dark:text-gray-400 ml-1 text-xs">({String(result.summary['V-REGION identity nt'] ?? "–")})</span>
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
                    <td className="py-2.5 px-3 font-mono text-xs text-brand-primary font-bold tracking-wider break-all border-l border-gray-200/60 dark:border-neutral-700/50">{String(result.summary['AA JUNCTION'] ?? "–")}</td>
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
                      <a href="https://www.imgt.org/IMGT_jcta/decryption" target="_blank" rel="noreferrer" className="text-brand-detail dark:text-brand-detail hover:underline text-xs mt-1 inline-block font-mono break-all opacity-80">
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
        <div className="w-full">
          <div className="flex flex-col rounded-xl border border-gray-200 dark:border-neutral-700/50 bg-white dark:bg-neutral-800 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="flex items-center gap-2 text-base font-bold text-gray-900 dark:text-gray-100">
                <MessageSquarePlus size={18} className="text-brand-primary" />
                Analysis Comments
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto max-h-[340px] pr-1.5 mb-4 space-y-4">
              {paginatedComments.map((item) => (
                  <div key={item.id} className={`rounded-xl border p-4 text-xs shadow-sm ${item.hidden ? "border-red-200 bg-red-50 text-red-900 dark:bg-red-900/10 dark:border-red-900/30 dark:text-red-300 opacity-50" : "border-gray-200 bg-gray-50 dark:bg-neutral-900/50 dark:border-neutral-700/50"}`}>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex size-7 items-center justify-center rounded-full bg-brand-primary text-xs font-bold text-white dark:text-gray-900">
                          {item.author.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-bold text-gray-900 dark:text-gray-200">{item.author}</span>
                        <span className="text-gray-400 dark:text-gray-500">•</span>
                        <span className="text-gray-500 dark:text-gray-400">{timeAgo(item.time_created)}</span>
                      </div>
                      {canModerate && (
                        <button
                          onClick={() => toggleComment.mutate(item)}
                          className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-sm font-bold transition ${item.hidden ? "bg-white text-blue-700 hover:bg-blue-50 dark:bg-neutral-700 dark:text-blue-400" : "bg-white text-gray-500 hover:bg-gray-200 hover:text-gray-700 dark:bg-neutral-700 dark:text-gray-400 dark:hover:text-gray-200"}`}
                        >
                          {item.hidden ? <><RotateCcw size={12} /> Restore</> : <><EyeOff size={12} /> Hide</>}
                        </button>
                      )}
                    </div>
                    <div className="pl-9 text-gray-700 dark:text-gray-300">
                      {item.hidden && (
                        <div className="italic text-gray-500 font-bold mb-1">This comment has been hidden</div>
                      )}
                      <Markdown className="prose dark:prose-invert prose-sm max-w-none prose-p:leading-snug prose-p:my-1">
                        {item.text}
                      </Markdown>
                    </div>
                  </div>
                ))}
                {!allComments.length && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 italic text-center py-8">
                    No comments yet.
                  </div>
                )}
                
                {totalCommentPages > 1 && (
                  <div className="mt-2 flex items-center justify-between px-2 pt-2 border-t border-gray-100 dark:border-neutral-700/50">
                    <button
                      onClick={() => setCommentPage(p => Math.max(1, p - 1))}
                      disabled={commentPage === 1}
                      className="text-xs font-semibold text-brand-primary transition hover:opacity-70 disabled:opacity-30"
                    >
                      Previous
                    </button>
                    <span className="text-xs font-medium text-gray-500">Page {commentPage} of {totalCommentPages}</span>
                    <button
                      onClick={() => setCommentPage(p => Math.min(totalCommentPages, p + 1))}
                      disabled={commentPage === totalCommentPages}
                      className="text-xs font-semibold text-brand-primary transition hover:opacity-70 disabled:opacity-30"
                    >
                      Next
                    </button>
                  </div>
                )}
            </div>

            {canComment && (
              <div className="mt-auto border-t border-gray-100 dark:border-neutral-700/50 pt-5">
                {/* Header row */}
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-brand-primary dark:text-brand-detail">
                    Add a comment
                  </p>
                  <div className="flex items-center gap-2">
                    {suggestion.data?.text && (
                      <button
                        onClick={() => {
                          setComment(suggestion.data.text);
                          setCommentTab("edit");
                        }}
                        className="flex items-center gap-1.5 rounded-full border border-brand-primary/30 bg-brand-primary/5 px-3 py-1 text-[11px] font-bold text-brand-primary transition hover:bg-brand-primary/10 dark:border-brand-detail/30 dark:bg-brand-detail/5 dark:text-brand-detail dark:hover:bg-brand-detail/10"
                        title="Auto-generate conclusion based on results and comments"
                      >
                        <Wand2 size={11} /> Auto-generate
                      </button>
                    )}
                    {/* Segmented Edit / Preview */}
                    <div className="flex rounded-full border border-gray-200 bg-gray-100 p-0.5 dark:border-neutral-700 dark:bg-neutral-700/60">
                      <button
                        onClick={() => setCommentTab("edit")}
                        className={`rounded-full px-3.5 py-1 text-xs font-semibold transition-all duration-150 ${
                          commentTab === "edit"
                            ? "bg-white text-brand-primary shadow-sm dark:bg-neutral-800 dark:text-brand-detail"
                            : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        }`}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setCommentTab("preview")}
                        className={`rounded-full px-3.5 py-1 text-xs font-semibold transition-all duration-150 ${
                          commentTab === "preview"
                            ? "bg-white text-brand-primary shadow-sm dark:bg-neutral-800 dark:text-brand-detail"
                            : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        }`}
                      >
                        Preview
                      </button>
                    </div>
                  </div>
                </div>

                {/* Textarea / Preview */}
                <div className="mb-3">
                  {commentTab === "edit" ? (
                    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden focus-within:border-brand-primary focus-within:ring-1 focus-within:ring-brand-primary dark:border-neutral-600 dark:bg-neutral-900 dark:focus-within:border-brand-detail dark:focus-within:ring-brand-detail transition">
                      <div className="flex flex-wrap items-center gap-1 border-b border-gray-100 dark:border-neutral-800 bg-gray-50/50 dark:bg-neutral-800/30 px-3 py-2">
                        <button
                          onClick={() => insertMarkdown("**", "**")}
                          className="rounded-md p-1.5 text-gray-500 hover:bg-gray-200 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-neutral-700 dark:hover:text-gray-100 transition"
                          title="Bold"
                        >
                          <Bold size={14} />
                        </button>
                        <button
                          onClick={() => insertMarkdown("*", "*")}
                          className="rounded-md p-1.5 text-gray-500 hover:bg-gray-200 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-neutral-700 dark:hover:text-gray-100 transition"
                          title="Italic"
                        >
                          <Italic size={14} />
                        </button>
                        <button
                          onClick={() => insertMarkdown("~~", "~~")}
                          className="rounded-md p-1.5 text-gray-500 hover:bg-gray-200 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-neutral-700 dark:hover:text-gray-100 transition"
                          title="Strikethrough"
                        >
                          <Strikethrough size={14} />
                        </button>
                        <button
                          onClick={() => insertMarkdown("`", "`")}
                          className="rounded-md p-1.5 text-gray-500 hover:bg-gray-200 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-neutral-700 dark:hover:text-gray-100 transition"
                          title="Inline Code"
                        >
                          <Code size={14} />
                        </button>
                        <button
                          onClick={() => insertMarkdown("[", "](url)")}
                          className="rounded-md p-1.5 text-gray-500 hover:bg-gray-200 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-neutral-700 dark:hover:text-gray-100 transition"
                          title="Link"
                        >
                          <LinkIcon size={14} />
                        </button>
                        <div className="w-px h-4 bg-gray-300 dark:bg-neutral-700 mx-1"></div>
                        <button
                          onClick={() => insertMarkdown("## ", "")}
                          className="rounded-md p-1.5 text-gray-500 hover:bg-gray-200 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-neutral-700 dark:hover:text-gray-100 transition"
                          title="Heading 2"
                        >
                          <Heading2 size={14} />
                        </button>
                        <button
                          onClick={() => insertMarkdown("> ", "")}
                          className="rounded-md p-1.5 text-gray-500 hover:bg-gray-200 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-neutral-700 dark:hover:text-gray-100 transition"
                          title="Blockquote"
                        >
                          <Quote size={14} />
                        </button>
                        <div className="w-px h-4 bg-gray-300 dark:bg-neutral-700 mx-1"></div>
                        <button
                          onClick={() => insertMarkdown("- ", "")}
                          className="rounded-md p-1.5 text-gray-500 hover:bg-gray-200 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-neutral-700 dark:hover:text-gray-100 transition"
                          title="Bullet List"
                        >
                          <List size={14} />
                        </button>
                        <button
                          onClick={() => insertMarkdown("1. ", "")}
                          className="rounded-md p-1.5 text-gray-500 hover:bg-gray-200 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-neutral-700 dark:hover:text-gray-100 transition"
                          title="Numbered List"
                        >
                          <ListOrdered size={14} />
                        </button>
                        <button
                          onClick={() => insertMarkdown("\n---\n", "")}
                          className="rounded-md p-1.5 text-gray-500 hover:bg-gray-200 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-neutral-700 dark:hover:text-gray-100 transition"
                          title="Horizontal Rule"
                        >
                          <Minus size={14} />
                        </button>
                      </div>
                      <textarea
                        ref={textareaRef}
                        className="w-full resize-y border-none bg-transparent px-4 py-3 font-mono text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-0 dark:text-gray-100"
                        rows={8}
                        style={{ minHeight: "180px" }}
                        placeholder="Write your clinical comment… (supports Markdown)"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                      />
                    </div>
                  ) : (
                    <div className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 min-h-[180px] overflow-y-auto dark:border-neutral-600 dark:bg-neutral-900/50">
                      {comment.trim() ? (
                        <Markdown className="prose dark:prose-invert prose-sm max-w-none prose-p:leading-snug prose-p:my-1 whitespace-pre-wrap">
                          {comment}
                        </Markdown>
                      ) : (
                        <p className="mt-8 text-center text-xs italic text-gray-400">Nothing to preview.</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Post button */}
                <div className="flex justify-end">
                  <button
                    onClick={() => addComment.mutate()}
                    disabled={!comment.trim()}
                    className="inline-flex items-center gap-2 rounded-full bg-brand-primary px-5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-brand-primary/90 disabled:opacity-40 dark:bg-brand-detail dark:text-neutral-950 dark:hover:bg-brand-detail/90"
                  >
                    Post Comment
                  </button>
                </div>
              </div>
            )}

            {canReport && (
              <div className="mt-5 border-t border-gray-100 dark:border-neutral-700/50 pt-5">
                {/* Header */}
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-brand-primary dark:text-brand-detail">
                    Report actions
                  </p>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">
                    Uses latest comment as conclusion
                  </span>
                </div>

                {/* Warning chip when no comment */}
                {!latestCommentText.trim() && (
                  <div className="mb-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 dark:border-amber-800/40 dark:bg-amber-900/20">
                    <span className="text-amber-500 dark:text-amber-400 shrink-0">⚠</span>
                    <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                      Post a comment first to generate a report.
                    </span>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2.5">
                  <button
                    onClick={() => preview.mutate()}
                    disabled={!latestCommentText.trim() || preview.isPending}
                    className="group flex-1 flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs font-semibold text-gray-700 transition hover:border-brand-primary/40 hover:bg-brand-primary/5 hover:text-brand-primary disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-800 dark:text-gray-300 dark:hover:border-brand-detail/40 dark:hover:bg-brand-detail/5 dark:hover:text-brand-detail"
                  >
                    Preview HTML
                  </button>
                  <button
                    onClick={() => downloadPdf.mutate()}
                    disabled={!latestCommentText.trim() || downloadPdf.isPending}
                    className="group flex-1 flex items-center justify-center gap-2 rounded-xl bg-brand-primary px-3 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-primary/90 disabled:opacity-40 dark:bg-brand-detail dark:text-neutral-950 dark:hover:bg-brand-detail/90"
                  >
                    {downloadPdf.isPending ? "Generating…" : "Download PDF"}
                  </button>
                </div>

                {downloadPdf.error && (
                  <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400">
                    {downloadPdf.error.message}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>

      <div className="mx-auto mt-8 max-w-[1728px] px-6">
        <Link to={`/samples/${sampleId}`} className="inline-flex items-center gap-2 rounded-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-neutral-700 px-5 py-1 text-xs font-bold text-gray-700 dark:text-gray-300 transition hover:bg-gray-50 dark:hover:bg-gray-700 shadow-sm">
          <ChevronLeft size={16} />
          Return to Sample
        </Link>
      </div>

      {confirmConfig.isOpen && (
        <ConfirmModal
          title={confirmConfig.title}
          message={confirmConfig.message}
          destructive={confirmConfig.destructive}
          onConfirm={() => {
            confirmConfig.onConfirm();
            setConfirmConfig(prev => ({ ...prev, isOpen: false }));
          }}
          onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
        />
      )}
    </div>
  );
}
