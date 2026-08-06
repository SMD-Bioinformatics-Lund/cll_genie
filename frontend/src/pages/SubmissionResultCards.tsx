type SequenceResult = {
  summary: Record<string, unknown>;
  junction: Record<string, unknown>;
};

export function AnalysisParametersCard({
  parameters,
}: {
  parameters: Record<string, unknown>;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-[#3b3732] dark:bg-[#202020]">
      <div className="border-b border-gray-200 bg-white px-6 py-5 dark:border-[#3b3732] dark:bg-[#202020]">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">
          Analysis Parameters
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-x-8 gap-y-6 bg-gray-50/50 p-8 text-xs dark:bg-[#181818]/50 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Object.entries(parameters).map(([key, value]) => (
          <div key={key} className="flex flex-col border-l-2 border-brand-detail pl-3">
            <span className="mb-1 text-xs font-semibold text-gray-500 dark:text-[#c7beb4]">
              {key}
            </span>
            <span className="font-medium text-gray-900 dark:text-[#e8dfd5]">
              {String(value ?? "–")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SequenceResultCard({
  id,
  result,
}: {
  id: string;
  result: SequenceResult;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-[#3b3732] dark:bg-[#202020]">
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-5 dark:border-[#3b3732] dark:bg-[#202020]">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white">
          Sequence Id: <span className="text-brand-primary">{id.split("_")[0]}</span>
        </h3>
        <SubsetBadge subset={String(result.summary["CLL subset"] ?? "–")} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-gray-800 dark:text-[#d8d0c7]">
          <tbody className="divide-y divide-gray-200/60 dark:divide-[#34302c]">
            <ResultRow
              label="Sequence analysis category"
              value={result.summary["Sequence analysis category"]}
              secondLabel="CLL subset"
              secondValue={result.summary["CLL subset"]}
            />
            {Boolean(result.summary["V-REGION potential ins/del"]) && (
              <ResultRow
                label="V-REGION ins/del"
                value={result.summary["V-REGION potential ins/del"]}
                valueClassName="text-red-600 dark:text-red-400"
                span
              />
            )}
            {(Boolean(result.summary["V-REGION insertions"]) ||
              Boolean(result.summary["V-REGION deletions"])) && (
              <tr className="bg-yellow-50/50 dark:bg-yellow-900/10">
                <HeaderCell className="bg-yellow-50/80 dark:bg-yellow-900/20">
                  Indel summary
                </HeaderCell>
                <td colSpan={3} className="px-3 py-2.5">
                  {Boolean(result.summary["V-REGION insertions"]) && (
                    <div className="mb-1.5">
                      <span className="mb-0.5 block text-xs font-semibold text-brand-detail">
                        Nucleotide insertions have been detected and removed.
                      </span>
                      <i className="font-medium text-gray-800 dark:text-[#d8d0c7]">
                        {String(result.summary["V-REGION insertions"])}
                      </i>
                    </div>
                  )}
                  {Boolean(result.summary["V-REGION deletions"]) && (
                    <div>
                      <span className="mb-0.5 block text-xs font-semibold text-brand-detail">
                        Nucleotide deletions have been detected and removed.
                      </span>
                      <i className="font-medium text-gray-800 dark:text-[#d8d0c7]">
                        {String(result.summary["V-REGION deletions"])}
                      </i>
                    </div>
                  )}
                </td>
              </tr>
            )}
            <tr className="hover:bg-gray-50/50 dark:hover:bg-[#2a2724]">
              <HeaderCell>V-DOMAIN functionality</HeaderCell>
              <td colSpan={3} className="px-3 py-2.5">
                <FunctionalityBadge value={result.summary["V-DOMAIN Functionality"]} />
                {result.summary["V-DOMAIN Functionality comment"] ? (
                  <>
                    <br />
                    <span className="mt-1 inline-block text-xs text-gray-500 dark:text-[#c7beb4]">
                      {String(result.summary["V-DOMAIN Functionality comment"])}
                    </span>
                  </>
                ) : null}
              </td>
            </tr>
            <tr className="hover:bg-gray-50/50 dark:hover:bg-[#2a2724]">
              <HeaderCell>V-GENE and allele</HeaderCell>
              <td className="px-3 py-2.5 font-medium">
                {String(result.summary["V-GENE and allele"] ?? "–")}
              </td>
              <HeaderCell leftBorder>
                Score: {String(result.summary["V-REGION score"] ?? "–")}
              </HeaderCell>
              <td className="border-l border-gray-200/60 px-3 py-2.5 dark:border-[#3b3732]">
                <span className="mr-1 text-gray-600 dark:text-[#c7beb4]">
                  Identity:
                </span>
                <IdentityBadge value={result.summary["V-REGION identity %"]} />
                <span className="ml-1 text-xs text-gray-500 dark:text-[#c7beb4]">
                  ({String(result.summary["V-REGION identity nt"] ?? "–")})
                </span>
              </td>
            </tr>
            <ResultRow
              label="J-GENE and allele"
              value={result.summary["J-GENE and allele"]}
              secondLabel={`Score: ${String(result.summary["J-REGION score"] ?? "–")}`}
              secondValue={`Identity: ${String(result.summary["J-REGION identity %"] ?? "–")}% (${String(result.summary["J-REGION identity nt"] ?? "–")})`}
            />
            <ResultRow
              label="D-GENE and allele"
              value={result.summary["D-GENE and allele"]}
              secondLabel="D-REGION reading frame"
              secondValue={result.summary["D-REGION reading frame"]}
            />
            <tr className="hover:bg-gray-50/50 dark:hover:bg-[#2a2724]">
              <HeaderCell>FR/CDR lengths</HeaderCell>
              <td className="px-3 py-2.5 font-medium text-gray-600 dark:text-[#c7beb4]">
                <span className="font-medium text-gray-900 dark:text-[#e8dfd5]">
                  {String(result.summary["FR-IMGT lengths"] ?? "–")}
                </span>{" "}
                /{" "}
                <span className="font-medium text-gray-900 dark:text-[#e8dfd5]">
                  [{String(result.summary["CDR-IMGT lengths"] ?? "–")}]
                </span>
              </td>
              <HeaderCell leftBorder>AA JUNCTION</HeaderCell>
              <td className="border-l border-gray-200/60 px-3 py-2.5 font-mono text-xs font-bold tracking-wider text-brand-primary dark:border-[#3b3732]">
                {String(result.summary["AA JUNCTION"] ?? "–")}
              </td>
            </tr>
            <tr className="hover:bg-gray-50/50 dark:hover:bg-[#2a2724]">
              <HeaderCell>JUNCTION length/decryption</HeaderCell>
              <td colSpan={3} className="px-3 py-2.5">
                {Boolean(result.junction["JUNCTION-nt nb"]) &&
                Boolean(result.junction["JUNCTION decryption"]) ? (
                  <span className="font-medium text-gray-900 dark:text-[#f4efe8]">
                    {String(result.junction["JUNCTION-nt nb"])} nt ={" "}
                    {String(result.junction["JUNCTION decryption"])}
                  </span>
                ) : (
                  "–"
                )}
                <br />
                <a
                  href="https://www.imgt.org/IMGT_jcta/decryption"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block break-all font-mono text-xs text-brand-detail opacity-80 hover:underline"
                >
                  (3'V)3'{"{N1}"}5'(D)3'{"{N2}"}5'(5'J)
                </a>
              </td>
            </tr>
            <ResultRow
              label="Merge count"
              value={result.summary["Merge Count"]}
              secondLabel="Total reads"
              secondValue={`${String(result.summary["Total Reads Per"] ?? "–")}%`}
            />
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HeaderCell({
  children,
  leftBorder = false,
  className = "",
}: {
  children: ReactNode;
  leftBorder?: boolean;
  className?: string;
}) {
  return (
    <th
      className={`bg-gray-50/80 py-2.5 pl-3 pr-2 font-semibold text-gray-600 dark:bg-[#181818]/40 dark:text-[#c7beb4] ${
        leftBorder ? "border-l border-gray-200/60 dark:border-[#3b3732]" : ""
      } ${className}`}
    >
      {children}
    </th>
  );
}

function ResultRow({
  label,
  value,
  secondLabel,
  secondValue,
  span = false,
  valueClassName = "",
}: {
  label: string;
  value: unknown;
  secondLabel?: string;
  secondValue?: unknown;
  span?: boolean;
  valueClassName?: string;
}) {
  return (
    <tr className="hover:bg-gray-50/50 dark:hover:bg-[#2a2724]">
      <HeaderCell>{label}</HeaderCell>
      <td
        colSpan={span ? 3 : 1}
        className={`px-3 py-2.5 font-medium ${valueClassName}`}
      >
        {String(value ?? "–")}
      </td>
      {!span && secondLabel && (
        <>
          <HeaderCell leftBorder>{secondLabel}</HeaderCell>
          <td className="border-l border-gray-200/60 px-3 py-2.5 font-medium dark:border-[#3b3732]">
            {String(secondValue ?? "–")}
          </td>
        </>
      )}
    </tr>
  );
}

function SubsetBadge({ subset }: { subset: string }) {
  const className =
    subset === "2" || subset === "8"
      ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/20 dark:text-amber-100 dark:border-amber-500/45"
      : subset !== "–" && subset !== "None"
        ? "bg-brand-primary/10 text-brand-primary border-brand-primary/20 dark:bg-[#3a2a22] dark:border-[#684431] dark:text-[#ffb487]"
        : "bg-gray-100 text-gray-500 border-gray-200 dark:bg-[#202020] dark:text-[#c7beb4] dark:border-[#3b3732]";
  return (
    <span className={`rounded-full border px-2.5 py-1.5 text-sm font-bold ${className}`}>
      CLL Subset: {subset}
    </span>
  );
}

function FunctionalityBadge({ value }: { value: unknown }) {
  const text = String(value ?? "–");
  const lower = text.toLowerCase();
  const className =
    lower.includes("productive") && !lower.includes("unproductive")
      ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-100 dark:border-emerald-500/40"
      : lower.includes("unproductive")
        ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/20 dark:text-red-100 dark:border-red-500/40"
        : "bg-gray-100 text-gray-600 border-gray-200 dark:bg-[#202020] dark:text-[#c7beb4] dark:border-[#3b3732]";
  return (
    <span className={`inline-block rounded-md border px-2 py-0.5 text-xs font-semibold ${className}`}>
      {text}
    </span>
  );
}

function IdentityBadge({ value }: { value: unknown }) {
  const numeric = parseFloat(String(value));
  const className =
    numeric >= 98
      ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/20 dark:text-red-100 dark:border-red-500/40"
      : numeric >= 97
        ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/20 dark:text-amber-100 dark:border-amber-500/45"
        : numeric < 97
          ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-100 dark:border-emerald-500/40"
          : "border-transparent font-medium text-gray-900 dark:text-[#f4efe8]";
  return (
    <span
      title={
        numeric >= 98
          ? "U-CLL (Unmutated)"
          : numeric >= 97
            ? "Borderline"
            : "M-CLL (Mutated)"
      }
      className={`inline-block cursor-help rounded-md border px-1.5 py-0.5 text-xs font-bold ${className}`}
    >
      {String(value ?? "–")}%
    </span>
  );
}

export type { SequenceResult };
import type { ReactNode } from "react";
