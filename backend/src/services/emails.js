import { appUrl, button, codeBlock, esc, layout, muted, p, sendMail } from './mailer.js';

// One function per transactional email. Each returns the sendMail result, never throws.

export const inviteEmail = (user, link, hours) => sendMail({
  to: user.email,
  subject: 'Your WorkNovas invitation',
  html: layout(`Welcome aboard, ${esc(user.fullName?.split(' ')[0] || 'there')}`,
    p(`You've been invited to join <strong>WorkNovas</strong> as ${esc(user.designation || user.role)}.`) +
    p('Set your password to activate your account. You will be asked for a verification code, which arrives in a separate email.') +
    button('Accept invitation', link) +
    muted(`This invitation expires in ${hours} hours.`))
});

export const resetEmail = (user, link, hours = 1) => sendMail({
  to: user.email,
  subject: 'Reset your WorkNovas password',
  html: layout('Password reset requested',
    p('We received a request to reset the password for your WorkNovas account.') +
    p('Choose a new password using the link below, then enter the verification code sent separately.') +
    button('Reset password', link) +
    muted(`This link expires in ${hours} hour${hours === 1 ? '' : 's'}. If you didn't request it, no action is needed.`))
});

export const otpEmail = (to, code, minutes) => sendMail({
  to,
  subject: `${code} is your WorkNovas verification code`,
  html: layout('Your verification code',
    p('Enter this code to confirm your email address:') +
    codeBlock(code) +
    muted(`The code expires in about ${minutes} minutes. Never share it with anyone.`))
});

export const approvedEmail = user => sendMail({
  to: user.email,
  subject: 'Your WorkNovas access is approved',
  html: layout('Your access is approved',
    p(`Hi ${esc(user.fullName?.split(' ')[0] || 'there')}, your WorkNovas account has been approved.`) +
    p('You can sign in now with your email and the password you set.') +
    button('Sign in', `${appUrl()}/login`))
});

export const passwordChangedEmail = user => sendMail({
  to: user.email,
  subject: 'Your WorkNovas password was changed',
  html: layout('Password changed',
    p('The password for your WorkNovas account was just changed, and all other sessions were signed out.') +
    muted("If this wasn't you, contact your administrator immediately."))
});
