// Editor-only typings so VS Code's built-in TypeScript checker understands Deno Edge Functions.
// Not imported by any function, so Supabase's Deno runtime never loads it.

declare namespace Deno {
  export const env: { get(key: string): string | undefined };
  export function serve(handler: (request: Request) => Response | Promise<Response>): unknown;
}

declare module "npm:@supabase/supabase-js@2" {
  export * from "@supabase/supabase-js";
}
