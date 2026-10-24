DO $$
DECLARE
  r RECORD;
  t text;
  tables text[] := ARRAY[
    'messages',
    'handshakes',
    'offline_handshakes',
    'non_messages',
    'profile_updates',
    'message_reactions',
    'reactions',
    'user_public_keys',
    'one_time_pre_keys',
    'support_tickets',
    'support_messages',
    'public_channels',
    'channel_members',
    'channel_posts',
    'profiles',
    'groups',
    'group_members',
    'group_messages',
    'group_calls',
    'user_configs',
    'developers'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

      FOR r IN (
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename = t 
          AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
      ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
      END LOOP;

      EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon, authenticated', t);
      EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', t);
      EXECUTE format('GRANT ALL ON public.%I TO service_role, postgres', t);

      IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename = t 
          AND cmd = 'SELECT'
      ) THEN
        EXECUTE format('CREATE POLICY "Allow public select" ON public.%I FOR SELECT USING (true)', t);
      END IF;
    END IF;
  END LOOP;
END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE INSERT, UPDATE, DELETE, TRUNCATE FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role, postgres;

NOTIFY pgrst, 'reload schema';
