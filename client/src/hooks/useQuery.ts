import { useCallback, useEffect, useRef, useState } from "react";
import { toAppError, type AppError } from "../lib/errors";

export interface QueryState<T> {
  data: T | undefined;
  error: AppError | null;
  loading: boolean;
  reload: () => void;
}

/** Runs an async loader whenever `deps` change; keeps previous data while reloading. */
export function useQuery<T>(loader: () => Promise<T>, deps: unknown[]): QueryState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<AppError | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loaderRef.current()
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      })
      .catch((e) => !cancelled && setError(toAppError(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [...deps, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, loading, reload };
}

export function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
