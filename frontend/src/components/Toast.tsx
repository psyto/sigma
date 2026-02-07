"use client";

import { useEffect, useState, useCallback, createContext, useContext, ReactNode } from "react";
import { CheckCircle, XCircle, Loader2, ExternalLink, X } from "lucide-react";

export type ToastType = "success" | "error" | "loading" | "info";

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  signature?: string;
  duration?: number;
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => string;
  removeToast: (id: string) => void;
  showSuccess: (title: string, message?: string, signature?: string) => void;
  showError: (title: string, message?: string) => void;
  showLoading: (title: string, message?: string) => string;
}

const ToastContext = createContext<ToastContextValue>({
  toasts: [],
  addToast: () => "",
  removeToast: () => {},
  showSuccess: () => {},
  showError: () => {},
  showLoading: () => "",
});

export function useToast() {
  return useContext(ToastContext);
}

interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).substring(7);
    setToasts((prev) => [...prev, { ...toast, id }]);
    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showSuccess = useCallback(
    (title: string, message?: string, signature?: string) => {
      addToast({ type: "success", title, message, signature, duration: 5000 });
    },
    [addToast]
  );

  const showError = useCallback(
    (title: string, message?: string) => {
      addToast({ type: "error", title, message, duration: 7000 });
    },
    [addToast]
  );

  const showLoading = useCallback(
    (title: string, message?: string) => {
      return addToast({ type: "loading", title, message });
    },
    [addToast]
  );

  return (
    <ToastContext.Provider
      value={{ toasts, addToast, removeToast, showSuccess, showError, showLoading }}
    >
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
}

interface ToastContainerProps {
  toasts: Toast[];
  removeToast: (id: string) => void;
}

function ToastContainer({ toasts, removeToast }: ToastContainerProps) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-md">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  );
}

interface ToastItemProps {
  toast: Toast;
  onClose: () => void;
}

function ToastItem({ toast, onClose }: ToastItemProps) {
  useEffect(() => {
    if (toast.duration && toast.type !== "loading") {
      const timer = setTimeout(onClose, toast.duration);
      return () => clearTimeout(timer);
    }
  }, [toast.duration, toast.type, onClose]);

  const getIcon = () => {
    switch (toast.type) {
      case "success":
        return <CheckCircle className="w-5 h-5 text-[var(--success)]" />;
      case "error":
        return <XCircle className="w-5 h-5 text-[var(--danger)]" />;
      case "loading":
        return <Loader2 className="w-5 h-5 text-[var(--primary)] animate-spin" />;
      default:
        return null;
    }
  };

  const getBorderColor = () => {
    switch (toast.type) {
      case "success":
        return "border-[var(--success)]";
      case "error":
        return "border-[var(--danger)]";
      case "loading":
        return "border-[var(--primary)]";
      default:
        return "border-[var(--border)]";
    }
  };

  const getExplorerUrl = (signature: string) => {
    // For localnet, we can't link to explorer, but for devnet/mainnet we can
    const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "localnet";
    if (network === "localnet") {
      return null;
    }
    const cluster = network === "mainnet-beta" ? "" : `?cluster=${network}`;
    return `https://explorer.solana.com/tx/${signature}${cluster}`;
  };

  return (
    <div
      className={`bg-[var(--card)] border ${getBorderColor()} rounded-lg p-4 shadow-lg flex items-start gap-3 animate-slide-in`}
    >
      {getIcon()}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-[var(--foreground)]">{toast.title}</p>
        {toast.message && (
          <p className="text-sm text-[var(--muted)] mt-1 break-words">{toast.message}</p>
        )}
        {toast.signature && (
          <div className="mt-2">
            {getExplorerUrl(toast.signature) ? (
              <a
                href={getExplorerUrl(toast.signature)!}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[var(--primary)] hover:underline flex items-center gap-1"
              >
                View on Explorer
                <ExternalLink className="w-3 h-3" />
              </a>
            ) : (
              <p className="text-xs text-[var(--muted)] font-mono truncate">
                {toast.signature.slice(0, 20)}...
              </p>
            )}
          </div>
        )}
      </div>
      {toast.type !== "loading" && (
        <button
          onClick={onClose}
          className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

// Add animation to globals.css
// @keyframes slide-in { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
// .animate-slide-in { animation: slide-in 0.2s ease-out; }
