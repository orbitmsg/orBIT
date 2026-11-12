CREATE INDEX IF NOT EXISTS idx_channel_posts_channel_id_id
ON public.channel_posts (channel_id, id);

CREATE INDEX IF NOT EXISTS idx_channel_members_channel_user
ON public.channel_members (channel_id, user_id);

ALTER TABLE public.public_channels ADD COLUMN IF NOT EXISTS username TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_public_channels_username_lower
ON public.public_channels (LOWER(username))
WHERE username IS NOT NULL AND username <> '';
