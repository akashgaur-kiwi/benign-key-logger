import crypto from 'crypto';
import { mailEnabled } from './mailer.js';
import { otpEmail } from './emails.js';

// Codes are derived from JWT_SECRET + recipient + a time window, so nothing has to be stored:
// the same code can be regenerated for verification while the window is open.
// Window length is the validity floor; the previous window is also accepted, so a code lives
// between OTP_TTL_MIN and 2x that.
export const OTP_TTL_MIN = Number(process.env.OTP_TTL_MIN || 10);

// Fixed fallbacks: email while mail is disabled, SMS always (no SMS provider yet).
const FIXED = {
  email: () => process.env.OTP_EMAIL_CODE || '000000',
  sms: () => process.env.OTP_SMS_CODE || '111111'
};

const live = channel => channel === 'email' && mailEnabled();

const derive = (channel, to, window) => {
  const mac = crypto.createHmac('sha256', process.env.JWT_SECRET || 'otp-dev-secret')
    .update(`${channel}|${String(to).toLowerCase().trim()}|${window}`).digest();
  return String(mac.readUInt32BE(0) % 1000000).padStart(6, '0');
};

const currentWindow = () => Math.floor(Date.now() / (OTP_TTL_MIN * 60000));

export const generateOtp = (channel, to) => live(channel) ? derive(channel, to, currentWindow()) : FIXED[channel]();

export const verifyOtp = (channel, code, to) => {
  const given = String(code || '').trim();
  if (!live(channel)) return given === FIXED[channel]();
  const w = currentWindow();
  // Accept the previous window too, so a code issued just before a rollover still works.
  return given === derive(channel, to, w) || given === derive(channel, to, w - 1);
};

export async function sendOtp(channel, to) {
  if (!live(channel)) return { channel, to, delivered: false, reason: 'delivery not configured' };
  const { sent, reason } = await otpEmail(to, generateOtp(channel, to), OTP_TTL_MIN);
  return { channel, to, delivered: sent, ...(sent ? {} : { reason }) };
}
