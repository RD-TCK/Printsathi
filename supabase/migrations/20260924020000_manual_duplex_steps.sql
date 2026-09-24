-- Migration: 20260924020000_manual_duplex_steps.sql
-- Description: Add duplex_step tracking for manual two-step double-sided printing

ALTER TABLE IF EXISTS public.print_jobs
ADD COLUMN IF NOT EXISTS duplex_step TEXT NOT NULL DEFAULT 'none';

COMMENT ON COLUMN public.print_jobs.duplex_step IS 'Manual duplex printing stage: none, odd_pending, odd_printed, even_pending, completed';
