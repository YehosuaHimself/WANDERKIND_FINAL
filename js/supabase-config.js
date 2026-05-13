/**
 * Supabase project configuration.
 *
 * The anon key is publicly safe: it's the JWT every browser client ships
 * with, gated by Row-Level Security on the database side. Embedding it
 * here is the same as embedding it in any Supabase web client.
 *
 * NOTE: do NOT add the service-role key here. Service-role bypasses RLS
 * and must only ever live on the server side (edge functions).
 */

// @ts-check

export const SUPABASE_URL = 'https://gjzhwpzgvdpkflgjesmb.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdqemh3cHpndmRwa2ZsZ2plc21iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0Mzc3OTUsImV4cCI6MjA5MjAxMzc5NX0.oHaNuCWu3FpMml2QhTpO7vFGxbgBEGo0mjKj5OUU7nI';
