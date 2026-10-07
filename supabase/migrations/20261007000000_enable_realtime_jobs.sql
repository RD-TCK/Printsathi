-- Enable realtime publication for the print_jobs table
begin;

alter publication supabase_realtime add table print_jobs;

commit;
