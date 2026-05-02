-- 029_locked_step_voting.sql
-- Locked-step group voting: 10-venue round cap, proposal/accept step.
-- current_card_index NULL on existing rows → triggers legacy evaluateMatch path.

ALTER TABLE public.parties
  ADD COLUMN IF NOT EXISTS current_card_index   INT,
  ADD COLUMN IF NOT EXISTS voting_round         INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS proposal_location_id UUID REFERENCES public.locations(id),
  ADD COLUMN IF NOT EXISTS proposal_rank        INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rejected_location_ids UUID[] NOT NULL DEFAULT '{}';

ALTER TYPE party_status ADD VALUE IF NOT EXISTS 'proposing';

CREATE TABLE IF NOT EXISTS public.proposal_responses (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id      UUID        NOT NULL REFERENCES public.parties(id)   ON DELETE CASCADE,
  voting_round  INT         NOT NULL,
  proposal_rank INT         NOT NULL,
  location_id   UUID        NOT NULL REFERENCES public.locations(id)  ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES public.users(id)      ON DELETE CASCADE,
  accepted      BOOLEAN     NOT NULL,
  responded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (party_id, voting_round, proposal_rank, user_id)
);

ALTER TABLE public.proposal_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "proposal_responses_all_backend" ON public.proposal_responses
  FOR ALL USING (true) WITH CHECK (true);

-- Add parties to realtime publication only if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'parties'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.parties';
  END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.proposal_responses;

NOTIFY pgrst, 'reload schema';
