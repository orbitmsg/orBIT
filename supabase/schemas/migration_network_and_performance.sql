DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profile_updates') THEN
    CREATE INDEX IF NOT EXISTS idx_profile_updates_chat_updated
    ON public.profile_updates (chat_id, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_profile_updates_username_updated
    ON public.profile_updates (LOWER(username), updated_at DESC);
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'messages') THEN
    CREATE INDEX IF NOT EXISTS idx_messages_chat_id_pk
    ON public.messages (chat_id, id);
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'one_time_pre_keys') THEN
    CREATE INDEX IF NOT EXISTS idx_one_time_pre_keys_user_created
    ON public.one_time_pre_keys (user_code, created_at ASC);
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'group_members') THEN
    CREATE INDEX IF NOT EXISTS idx_group_members_user_group
    ON public.group_members (user_code, group_id);
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'group_messages') THEN
    CREATE INDEX IF NOT EXISTS idx_group_messages_group_id_id
    ON public.group_messages (group_id, id);
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'channel_posts') THEN
    CREATE INDEX IF NOT EXISTS idx_channel_posts_channel_id_id
    ON public.channel_posts (channel_id, id);
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'channel_members') THEN
    CREATE INDEX IF NOT EXISTS idx_channel_members_channel_user
    ON public.channel_members (channel_id, user_id);
  END IF;
END $$;
