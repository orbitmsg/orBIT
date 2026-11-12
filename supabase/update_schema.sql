ALTER TABLE public.profile_updates ADD COLUMN IF NOT EXISTS hide_profile_id BOOLEAN DEFAULT false;
ALTER TABLE public.profile_updates ADD COLUMN IF NOT EXISTS sender_code TEXT;
ALTER TABLE public.profile_updates ADD COLUMN IF NOT EXISTS numeric_id TEXT;
ALTER TABLE public.profile_updates ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE public.profile_updates ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE public.profile_updates ADD COLUMN IF NOT EXISTS birthday TEXT;
CREATE INDEX IF NOT EXISTS idx_profile_updates_chat_id ON public.profile_updates(chat_id);
CREATE INDEX IF NOT EXISTS idx_profile_updates_numeric_id ON public.profile_updates(numeric_id);
CREATE INDEX IF NOT EXISTS idx_profile_updates_username ON public.profile_updates(username);
CREATE INDEX IF NOT EXISTS idx_profile_updates_username_lower ON public.profile_updates(LOWER(username));

DELETE FROM public.profile_updates a
USING public.profile_updates b
WHERE a.chat_id = b.chat_id
  AND a.username IS NOT NULL
  AND TRIM(a.username) <> ''
  AND b.username IS NOT NULL
  AND TRIM(b.username) <> ''
  AND LOWER(TRIM(a.username)) = LOWER(TRIM(b.username))
  AND (
    COALESCE(a.sender_code, '') = COALESCE(b.sender_code, '')
    OR a.sender_code IS NULL
    OR b.sender_code IS NULL
  )
  AND (
    COALESCE(a.updated_at, to_timestamp(0)) < COALESCE(b.updated_at, to_timestamp(0))
    OR (
      COALESCE(a.updated_at, to_timestamp(0)) = COALESCE(b.updated_at, to_timestamp(0))
      AND a.id < b.id
    )
  );

ALTER TABLE public.handshakes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on handshakes" ON public.handshakes;
CREATE POLICY "Allow all on handshakes" ON public.handshakes FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on messages" ON public.messages;
CREATE POLICY "Allow all on messages" ON public.messages FOR ALL USING (true) WITH CHECK (true);
