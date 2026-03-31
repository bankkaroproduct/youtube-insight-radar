ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS is_relevant boolean;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS relevance_reasoning text;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS last_relevance_check_at timestamptz;