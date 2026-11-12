export interface OfflineMessageRecord {
  id: string;
  chat_id: string;
  sender_id: string;
  recipient_id: string;
  ciphertext: string;
  message_index: number;
  dh_public_key: string;
  prev_chain_count?: number | null;
  created_at: string;
  expires_at: string;
  delivered: boolean;
}

export interface OfflineHandshakeRecord {
  id: string;
  chat_id: string;
  recipient_code: string;
  sender_code: string | null;
  sender_nickname: string;
  sender_public_key: string;
  sender_avatar_url: string | null;
  sender_username?: string | null;
  sender_birthday?: string | null;
  created_at: string;
  consumed: boolean;
}

export interface ProfileUpdateRecord {
  id: string;
  chat_id: string;
  user_id?: string | null;
  sender_id?: string | null;
  nickname: string | null;
  avatar_url: string | null;
  banner_url?: string | null;
  sender_code?: string | null;
  numeric_id?: string | null;
  hide_profile_id?: boolean | null;
  bio?: string | null;
  username?: string | null;
  birthday?: string | null;
  updated_at: string;
}

export interface UserDirectoryRecord {
  user_code: string;
  numeric_id?: string | null;
  nickname: string;
  avatar_url: string | null;
  banner_url?: string | null;
  username?: string | null;
  bio?: string | null;
  birthday?: string | null;
  public_key?: string | null;
  updated_at?: string;
}

export interface UserPublicKeysRecord {
  user_code: string;
  identity_key: string;
  signed_pre_key: string;
  pre_key_signature: string;
  identity_signing_key?: string | null;
  updated_at: string;
}

export interface OneTimePreKeyRecord {
  id: string;
  user_code: string;
  key_id: number;
  public_key: string;
  created_at: string;
}

export interface PreKeyBundle {
  identityKey: string;
  signedPreKey: string;
  preKeySignature: string;
  identitySigningKey?: string;
  oneTimePreKey?: {
    id: string;
    keyId: number;
    publicKey: string;
  };
}
