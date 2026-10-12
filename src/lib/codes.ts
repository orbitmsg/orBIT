export const generateRandomCode = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const array = new Uint8Array(36);
  crypto.getRandomValues(array);
  let code = '';
  for (let i = 0; i < 36; i++) {
    code += chars[array[i] % chars.length];
  }
  return code;
};

export const generateChannelId = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const array = new Uint8Array(36);
  crypto.getRandomValues(array);
  let code = '';
  for (let i = 0; i < 36; i++) {
    code += chars[array[i] % chars.length];
  }
  return code;
};

export const generateGroupId = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const array = new Uint8Array(36);
  crypto.getRandomValues(array);
  let code = '';
  for (let i = 0; i < 36; i++) {
    code += chars[array[i] % chars.length];
  }
  return code;
};

export const generateGroupInviteCode = (): string => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  let code = '';
  for (let i = 0; i < 32; i++) {
    code += chars[array[i] % chars.length];
  }
  return code;
};