ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS check_message_ciphertext_length,
  ADD CONSTRAINT check_message_ciphertext_length CHECK (length(ciphertext) <= 65536);

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS check_message_chat_id_length,
  ADD CONSTRAINT check_message_chat_id_length CHECK (length(chat_id) <= 128);

ALTER TABLE public.handshakes
  DROP CONSTRAINT IF EXISTS check_handshake_pubkey_length,
  ADD CONSTRAINT check_handshake_pubkey_length CHECK (length(sender_public_key) <= 256);

CREATE INDEX IF NOT EXISTS idx_messages_recipient_undelivered_fast
ON public.messages (recipient_id, created_at ASC)
WHERE delivered = false;

CREATE INDEX IF NOT EXISTS idx_handshakes_recipient_unconsumed_fast
ON public.handshakes (recipient_code, created_at ASC)
WHERE consumed = false;

CREATE INDEX IF NOT EXISTS idx_messages_chat_created
ON public.messages (chat_id, created_at ASC);

DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'group_messages') THEN
    ALTER TABLE public.group_messages
      DROP CONSTRAINT IF EXISTS check_group_message_ciphertext_length,
      ADD CONSTRAINT check_group_message_ciphertext_length CHECK (length(ciphertext) <= 65536);
      
    CREATE INDEX IF NOT EXISTS idx_group_messages_group_created
    ON public.group_messages (group_id, created_at ASC);
  END IF;
END $$;
