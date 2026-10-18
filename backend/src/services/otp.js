// OTP verification. Email/SMS delivery is not wired up yet, so codes are fixed
// (override via OTP_EMAIL_CODE / OTP_SMS_CODE). Swap this module out once a provider is added.
const CODES = {
  email: () => process.env.OTP_EMAIL_CODE || '000000',
  sms: () => process.env.OTP_SMS_CODE || '111111'
};

export const verifyOtp = (channel, code) => String(code || '').trim() === CODES[channel]();

// Placeholder for sending; nothing is delivered while codes are fixed.
export async function sendOtp(channel, to) {
  return { channel, to, delivered: false };
}
