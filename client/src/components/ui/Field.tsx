import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";

interface FieldProps {
  label: string;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactElement<Record<string, unknown>>;
}

/** Label + control + error message with correct aria wiring. */
export function Field({ label, error, hint, required, className = "", children }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
        "aria-required": required || undefined,
      })
    : children;

  return (
    <div className={`field${error ? " has-error" : ""} ${className}`}>
      <label htmlFor={id}>
        {label}
        {required && <span className="req" aria-hidden> *</span>}
      </label>
      {control}
      {hint && !error && (
        <small id={hintId} className="field-hint">
          {hint}
        </small>
      )}
      {error && (
        <small id={errorId} className="field-error">
          {error}
        </small>
      )}
    </div>
  );
}
