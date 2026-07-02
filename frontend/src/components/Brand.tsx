import { APP_BASE_PATH } from "../api";
import { Link } from "react-router-dom";

export function Brand({ compact = false, inverse = false }: { compact?: boolean, inverse?: boolean }) {
  return (
    <Link
      to="/"
      className={`group inline-flex min-w-max items-center gap-3 transition-transform duration-300 hover:scale-105 ${compact ? "opacity-90" : ""}`}
      aria-label="CLL Genie"
    >
      <img 
        src={`${APP_BASE_PATH}/logo.svg`} 
        alt="CLL Genie Logo" 
        className="size-10 rounded-xl shadow-lg object-cover bg-white transition-transform duration-[800ms] ease-in-out group-hover:rotate-[360deg]" 
      />
      {!compact && (
        <div className="flex flex-col pt-0.5">
          <div className="text-xl leading-none tracking-wide mb-0.5 drop-shadow-lg text-brand-detail">
            <strong className="font-extrabold">CLL</strong> <span className="font-medium">Genie</span>
          </div>
          <div className={`text-[9px] font-bold tracking-wider leading-none uppercase drop-shadow-lg pb-1 ${inverse ? "text-white/80" : "text-brand-accent"}`}>
            Chronic Lymphocytic Leukemia<br/>Powered by IMGT
          </div>
        </div>
      )}
    </Link>
  );
}
