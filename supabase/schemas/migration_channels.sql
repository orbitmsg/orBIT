CREATE INDEX IF NOT EXISTS idx_channel_posts_channel_id_id
ON public.channel_posts (channel_id, id);

CREATE INDEX IF NOT EXISTS idx_channel_members_channel_user
ON public.channel_members (channel_id, user_id);
