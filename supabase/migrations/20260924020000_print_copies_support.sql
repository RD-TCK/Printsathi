-- Migration: 20260924020000_print_copies_support.sql
-- Support for Multi-Copy Printing on Print Jobs and Page Ranges

-- 1. Add copies column to print_job_pages
ALTER TABLE public.print_job_pages
ADD COLUMN IF NOT EXISTS copies integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'print_job_pages_copies_check'
  ) THEN
    ALTER TABLE public.print_job_pages
    ADD CONSTRAINT print_job_pages_copies_check CHECK (copies >= 1 AND copies <= 100);
  END IF;
END $$;

-- 2. Add copies column to print_jobs
ALTER TABLE public.print_jobs
ADD COLUMN IF NOT EXISTS copies integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'print_jobs_copies_check'
  ) THEN
    ALTER TABLE public.print_jobs
    ADD CONSTRAINT print_jobs_copies_check CHECK (copies >= 1 AND copies <= 100);
  END IF;
END $$;
