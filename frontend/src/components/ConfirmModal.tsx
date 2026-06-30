import { X, AlertTriangle, Info } from "lucide-react";

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={onCancel}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 overflow-hidden flex flex-col">
        <div className="flex items-start gap-4 p-6">
          <div className={`flex-shrink-0 rounded-full p-2 ${destructive ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-500' : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-500'}`}>
            {destructive ? <AlertTriangle size={24} /> : <Info size={24} />}
          </div>
          <div className="flex-1 pt-1">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
              {title}
            </h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {message}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="flex-shrink-0 -mr-2 -mt-2 rounded-full p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-700 dark:hover:text-neutral-300 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="border-t border-neutral-100 dark:border-neutral-700/50 bg-neutral-50/50 dark:bg-neutral-800/50 px-6 py-4 flex justify-end gap-3 shrink-0">
          <button
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700/50 transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors ${
              destructive 
                ? 'bg-red-600 hover:bg-red-700' 
                : 'bg-brand-primary hover:bg-brand-primary-hover'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
