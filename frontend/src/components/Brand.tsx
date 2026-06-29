import { APP_BASE_PATH } from "../api";

export function Brand({ compact = false, inverse = false }: { compact?: boolean, inverse?: boolean }) {
  return (
    <div
      className={`inline-flex min-w-max items-center gap-3 ${compact ? "opacity-90" : ""}`}
      aria-label="CLL Genie"
    >
      <img 
        src={`${APP_BASE_PATH}/logo.svg`} 
        alt="CLL Genie Logo" 
        className="size-12 rounded-xl shadow-lg object-cover bg-white" 
      />
      {!compact && (
        <div className="flex flex-col pt-1">
          <div className="text-xl leading-none tracking-wide mb-1 drop-shadow-lg text-[#DF7849]">
            <strong className="font-extrabold">CLL</strong> <span className="font-medium">Genie</span>
          </div>
          <div className="text-[9px] font-bold tracking-wider text-[#FFA37A] leading-none uppercase drop-shadow-lg pb-1">
            Chronic Lymphocytic Leukemia<br/>Powered by IMGT
          </div>
        </div>
      )}
    </div>
  );
}
