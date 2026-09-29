-- Migration: 20260929000000_duplex_printer_name.sql
-- Persist the printer name used for the odd (front) side of a manual duplex job
-- so the even (back) side is guaranteed to go to the exact same physical printer,
-- even if the agent restarts between the two passes.

ALTER TABLE public.print_jobs
  ADD COLUMN IF NOT EXISTS duplex_printer_name TEXT DEFAULT NULL;

COMMENT ON COLUMN public.print_jobs.duplex_printer_name IS
  'Windows printer name used to print the odd (front) side of a manual duplex job. Returned by the claim API for even-step jobs so the agent routes the back-side to the same printer.';
