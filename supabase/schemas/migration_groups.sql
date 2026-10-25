CREATE INDEX IF NOT EXISTS idx_group_members_user_group
ON public.group_members (user_code, group_id);

DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'group_messages') THEN
    CREATE INDEX IF NOT EXISTS idx_group_messages_group_id_id
    ON public.group_messages (group_id, id);
  END IF;
END $$;
