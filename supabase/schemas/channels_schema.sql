CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_id ON public.profiles (id);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles (username);

CREATE TABLE IF NOT EXISTS public.public_channels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    avatar_url TEXT,
    creator_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    creator_nickname TEXT NOT NULL,
    subscribers_count INT DEFAULT 1,
    is_official BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_public_channels_id ON public.public_channels (id);
CREATE INDEX IF NOT EXISTS idx_public_channels_creator_id ON public.public_channels (creator_id);

CREATE TABLE IF NOT EXISTS public.channel_members (
    channel_id TEXT NOT NULL REFERENCES public.public_channels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_members_user ON public.channel_members (user_id);
CREATE INDEX IF NOT EXISTS idx_channel_members_channel_role ON public.channel_members (channel_id, role);

CREATE TABLE IF NOT EXISTS public.channel_posts (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES public.public_channels(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    sender_nickname TEXT NOT NULL,
    text TEXT,
    media_type TEXT,
    media_url TEXT,
    media_name TEXT,
    mime TEXT,
    duration INT,
    width INT,
    height INT,
    waveform JSONB,
    audio_metadata JSONB,
    link_preview JSONB,
    reactions JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_channel_posts_channel_created ON public.channel_posts (channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_channel_posts_sender_id ON public.channel_posts (sender_id);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select for profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Allow select for public_channels" ON public.public_channels FOR SELECT USING (true);
CREATE POLICY "Allow select for channel_members" ON public.channel_members FOR SELECT USING (true);
CREATE POLICY "Allow select for channel_posts" ON public.channel_posts FOR SELECT USING (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.profiles, public.public_channels, public.channel_members, public.channel_posts FROM anon, authenticated;
GRANT SELECT ON public.profiles, public.public_channels, public.channel_members, public.channel_posts TO anon, authenticated;
GRANT ALL ON public.profiles, public.public_channels, public.channel_members, public.channel_posts TO service_role, postgres;

CREATE TABLE IF NOT EXISTS public.messages (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    recipient_id TEXT NOT NULL,
    ciphertext TEXT NOT NULL,
    message_index INT,
    dh_public_key TEXT,
    prev_chain_count INT,
    delivered BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_recipient_delivered ON public.messages (recipient_id, delivered, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON public.messages (chat_id);

