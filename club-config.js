/* ============================================================
   club-config.js — where the backend is
   ============================================================
   One place for the project address and its publishable key, so
   nothing has to copy them.

   The key is meant to be in client code. Every table it can reach
   has row level security, so on its own it cannot read or change
   anything the policies do not already allow a stranger to.

   Having this separate matters for weight as much as tidiness:
   the home page reads approved artwork with a plain fetch and no
   library at all, which it could not do if these lived inside the
   module that pulls in the Supabase client.
   ============================================================ */

export const SUPABASE_URL = 'https://ljdrqhwdvwefnqnyocbu.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_OeCgiSCK5n2Cta3p54LsLw_mitOsyjL';
