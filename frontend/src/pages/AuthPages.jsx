import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api, { errMsg } from '../lib/api.js';
import { inputCls, btnCls, showMessage } from '../components/ui.jsx';

export function AuthCard({ heading, children }) {
  return (
    <div className="min-h-screen bg-[#0a192f] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl p-6 w-full max-w-sm space-y-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center font-black text-white text-lg">W</div>
          <div>
            <div className="font-bold text-slate-900 text-sm">WorkNovas</div>
            <div className="text-[10px] text-slate-400 font-mono tracking-wider">RECRUITMENT HUB</div>
          </div>
        </div>
        {heading && <h1 className="text-sm font-bold text-slate-800">{heading}</h1>}
        {children}
      </div>
    </div>
  );
}

const Back = () => <Link to="/login" className="block text-center text-xs text-blue-600 hover:underline">Back to sign in</Link>;

function useForm(init, send) {
  const [f, setF] = useState(init);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [extra, setExtra] = useState({});
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const submit = async e => {
    e.preventDefault();
    if (f.confirm !== undefined && f.password !== f.confirm) return setErr('Passwords do not match');
    setBusy(true);
    setErr('');
    try {
      const { data } = await send(f);
      setMsg(data.message || 'Done.');
      setExtra(data);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return { f, set, submit, err, msg, busy, extra };
}

const otpProps = { inputMode: 'numeric', maxLength: 6, pattern: '\\d{6}', autoComplete: 'one-time-code' };

function SetPassword({ heading, url, cta, type }) {
  const [sp] = useSearchParams();
  const token = sp.get('token');
  const [info, setInfo] = useState({});
  const [otpMsg, setOtpMsg] = useState('');
  const [sending, setSending] = useState(false);
  const needsSms = !!info.needsSmsOtp;
  useEffect(() => {
    if (token) api.get('/auth/check-token', { params: { token, type } }).then(r => setInfo(r.data)).catch(() => {});
  }, [token, type]);
  const sendCode = async () => {
    setSending(true);
    try {
      const { data } = await api.post('/auth/send-otp', { token, type });
      setOtpMsg(data.message);
    } catch (e) {
      setOtpMsg(errMsg(e));
    } finally {
      setSending(false);
    }
  };
  const { f, set, submit, err, msg, busy } = useForm({ password: '', confirm: '', emailOtp: '', smsOtp: '' },
    v => api.post(url, { token, password: v.password, emailOtp: v.emailOtp, smsOtp: v.smsOtp }));
  if (!token) return <AuthCard heading={heading}><p className="text-xs text-rose-600">This link is missing its token.</p><Back /></AuthCard>;
  return (
    <AuthCard heading={heading}>
      {msg ? (
        <>
          <p className="text-xs text-slate-600">{msg}</p>
          <Back />
        </>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <input className={inputCls} type="password" placeholder="New password (8+ chars, letter and number)" value={f.password} onChange={set('password')} required />
          <input className={inputCls} type="password" placeholder="Confirm password" value={f.confirm} onChange={set('confirm')} required />
          <input className={inputCls} {...otpProps} placeholder="Email verification code (6 digits)" value={f.emailOtp} onChange={set('emailOtp')} required />
          {info.canSendOtp && (
            <button type="button" onClick={sendCode} disabled={sending}
              className="text-xs text-blue-600 hover:underline disabled:text-slate-400">
              {sending ? 'Sending…' : `Email me a code${info.email ? ` (${info.email})` : ''}`}
            </button>
          )}
          {otpMsg && <div className="text-xs text-slate-500">{otpMsg}</div>}
          {needsSms && <input className={inputCls} {...otpProps} placeholder="SMS verification code (6 digits)" value={f.smsOtp} onChange={set('smsOtp')} required />}
          {err && <div className="text-xs text-rose-600">{err}</div>}
          <button className={`${btnCls} w-full justify-center py-2`} disabled={busy}>{cta}</button>
        </form>
      )}
    </AuthCard>
  );
}

export const AcceptInvite = () => <SetPassword heading="Accept your invitation" url="/auth/accept-invite" cta="Set password" type="INVITE" />;
export const ResetPassword = () => <SetPassword heading="Choose a new password" url="/auth/reset-password" cta="Update password" type="RESET" />;

function EmailPreview({ email, link }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); } catch { await showMessage('Copy the link', 'Copying is blocked in this browser. Select the link and copy it.', { copyText: link }); return; }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden text-xs">
      <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 text-[10px] text-slate-500 space-y-0.5">
        <div className="font-semibold text-amber-600 uppercase tracking-wide">Email preview (not sent)</div>
        <div>To: {email}</div>
        <div>Subject: Reset your WorkNovas password</div>
      </div>
      <div className="p-3 space-y-2 text-slate-600">
        <p>We received a request to reset your password. Use the link below within 1 hour, then enter your email verification code.</p>
        <div className="font-mono text-[10px] bg-slate-50 border border-slate-200 rounded p-2 break-all">{link}</div>
        <div className="flex gap-2">
          <button type="button" onClick={copy} className={`${btnCls} flex-1 justify-center py-1.5`}>{copied ? 'Copied!' : 'Copy link'}</button>
          <a href={link} target="_blank" rel="noopener noreferrer"
            className="flex-1 text-center py-1.5 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50">Open in new tab</a>
        </div>
        <p className="text-[10px] text-slate-400">If you didn't request this, you can ignore this email.</p>
      </div>
    </div>
  );
}

export function ForgotPassword() {
  const { f, set, submit, err, msg, busy, extra } = useForm({ email: '' }, v => api.post('/auth/forgot-password', v));
  return (
    <AuthCard heading="Reset your password">
      {msg ? (
        <div className="space-y-2">
          <p className="text-xs text-slate-600">{msg}</p>
          {/* Only returned when the email could not be sent: show the link so it can be handed over. */}
          {extra.link && <EmailPreview email={f.email} link={extra.link} />}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <input className={inputCls} type="email" placeholder="Work email" value={f.email} onChange={set('email')} required />
          {err && <div className="text-xs text-rose-600">{err}</div>}
          <button className={`${btnCls} w-full justify-center py-2`} disabled={busy}>Send reset link</button>
        </form>
      )}
      <Back />
    </AuthCard>
  );
}

export function RequestAccess() {
  const { f, set, submit, err, msg, busy } = useForm({ fullName: '', email: '', password: '', confirm: '' }, v => api.post('/auth/register', v));
  return (
    <AuthCard heading="Request access">
      {msg ? <p className="text-xs text-slate-600">{msg}</p> : (
        <form onSubmit={submit} className="space-y-3">
          <input className={inputCls} placeholder="Full name" value={f.fullName} onChange={set('fullName')} required />
          <input className={inputCls} type="email" placeholder="Work email" value={f.email} onChange={set('email')} required />
          <input className={inputCls} type="password" placeholder="Password (8+ chars, letter and number)" value={f.password} onChange={set('password')} required />
          <input className={inputCls} type="password" placeholder="Confirm password" value={f.confirm} onChange={set('confirm')} required />
          {err && <div className="text-xs text-rose-600">{err}</div>}
          <button className={`${btnCls} w-full justify-center py-2`} disabled={busy}>Request access</button>
        </form>
      )}
      <Back />
    </AuthCard>
  );
}
