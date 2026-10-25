CREATE INDEX IF NOT EXISTS idx_profile_updates_chat_updated
ON public.profile_updates (chat_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_profile_updates_username_updated
ON public.profile_updates (LOWER(username), updated_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'one_time_pre_keys') THEN
    CREATE INDEX IF NOT EXISTS idx_one_time_pre_keys_user_created
    ON public.one_time_pre_keys (user_code, created_at ASC);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_messages_chat_id_pk
ON public.messages (chat_id, id);

DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'group_members') THEN
    CREATE INDEX IF NOT EXISTS idx_group_members_user_group
    ON public.group_members (user_code, group_id);
  END IF;
END $$;
