import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { Button } from "./Button";
import { Modal } from "./Modal";

// ---------------------------------------------------------------- Toasts
type ToastTone = "success" | "error" | "info";
interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

const ToastContext = createContext<((message: string, tone?: ToastTone) => void) | null>(null);

// ---------------------------------------------------------------- Confirm dialog
interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary";
}
const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const nextId = useRef(1);

  const toast = useCallback((message: string, tone: ToastTone = "success") => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, tone, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 7000 : 4000);
  }, []);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setConfirmState({ ...options, resolve })),
    [],
  );

  const closeConfirm = (value: boolean) => {
    confirmState?.resolve(value);
    setConfirmState(null);
  };

  const icon = (tone: ToastTone) =>
    tone === "success" ? <CheckCircle2 size={18} /> : tone === "error" ? <AlertTriangle size={18} /> : <Info size={18} />;

  return (
    <ToastContext.Provider value={toast}>
      <ConfirmContext.Provider value={confirm}>
        {children}
        <div className="toast-region" aria-live="polite" aria-atomic="false">
          {toasts.map((t) => (
            <div key={t.id} className={`toast toast-${t.tone}`} role={t.tone === "error" ? "alert" : "status"}>
              {icon(t.tone)}
              <span>{t.message}</span>
              <button
                type="button"
                className="icon-btn"
                aria-label="Dismiss"
                onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
        {confirmState && (
          <Modal
            title={confirmState.title}
            size="sm"
            onClose={() => closeConfirm(false)}
            footer={
              <>
                <Button variant="secondary" onClick={() => closeConfirm(false)}>
                  Cancel
                </Button>
                <Button variant={confirmState.tone === "danger" ? "danger" : "primary"} onClick={() => closeConfirm(true)}>
                  {confirmState.confirmLabel ?? "Confirm"}
                </Button>
              </>
            }
          >
            <div className="confirm-message">{confirmState.message}</div>
          </Modal>
        )}
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside FeedbackProvider");
  return ctx;
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside FeedbackProvider");
  return ctx;
}
