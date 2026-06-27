import { APP_BASE_PATH } from "../api";

export function Brand({ compact = false, inverse = false }: { compact?: boolean, inverse?: boolean }) {
  return (
    <div
      className={`inline-flex min-w-max items-center gap-2.5 ${compact ? "opacity-90" : ""}`}
      aria-label="CLL Genie"
    >
      <img 
        src={`${APP_BASE_PATH}/logo.svg`} 
        alt="CLL Genie Logo" 
        className="size-10 rounded-lg shadow-sm object-cover bg-transparent" 
      />
      {!compact && (
        <div className="flex flex-col pt-1">
          <div className="text-xl leading-none tracking-wide mb-0.5 text-[#DF7849]">
            <strong className="font-extrabold">CLL</strong> <span className="font-medium">Genie</span>
          </div>
          <div className="text-[8px] font-bold tracking-wider text-[#FFA37A] leading-none uppercase drop-shadow-md pb-1">
            Chronic Lymphocytic Leukemia<br/>Powered by IMGT
          </div>
        </div>
      )}
    </div>
  );
}
