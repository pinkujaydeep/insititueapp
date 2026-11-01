export interface AppError {
  message: string;
  field?: string;
  code?: string;
}

const NETWORK_MESSAGE = "Cannot reach the server. Check your internet connection and try again.";

/** Converts Supabase/PostgREST/network errors into a user-friendly message and optional form field. */
export function toAppError(err: unknown): AppError {
  if (err instanceof TypeError) return { message: NETWORK_MESSAGE };
  if (!err || typeof err !== "object" || !("message" in err)) {
    return { message: "Something went wrong. Please try again." };
  }
  const e = err as { message: string; hint?: string | null; code?: string; status?: number };
  const code = e.code;
  if (code === "42501") return { message: "You do not have permission to perform this action.", code };
  if (code === "PGRST301" || code === "PGRST303" || e.status === 401) {
    return { message: "Your session has expired. Please sign in again.", code };
  }
  if (code === "23505") return { message: "A record with the same value already exists.", code };
  if (code === "23503") return { message: "This record is linked to other data and cannot be removed.", code };
  if (code === "23514") return { message: "Some values are not valid. Please check the form.", code };
  if (/failed to fetch|network/i.test(e.message)) return { message: NETWORK_MESSAGE };
  return { message: e.message || "Something went wrong. Please try again.", field: e.hint || undefined, code };
}

/** Throws the error from a Supabase response, otherwise returns its (success-branch) data. */
export async function unwrap<R extends { data: unknown; error: unknown }>(
  promise: PromiseLike<R>,
): Promise<Extract<R, { error: null }>["data"]> {
  const { data, error } = await promise;
  if (error) throw error;
  return data as Extract<R, { error: null }>["data"];
}
