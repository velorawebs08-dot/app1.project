import React, { useEffect, useState } from 'react';
import { ArrowRight, KeyRound, Mail, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';
import { BrandLogo } from './BrandLogo';
import { useToast } from './ToastProvider';
import { supabase } from '../lib/supabase';
import {
  linkAccountAndResolveSession,
  parseWhatsAppInvokeResult,
  ResolvedUserRole,
} from '../lib/dataService';
import { siteData } from '../siteData';

interface LoginScreenProps {
  onAuthenticated: (session: ResolvedUserRole) => void;
}

function extractCooldownSeconds(message: string): number | null {
  const match = message.match(/after\s+(\d+)\s+second/i);
  if (match?.[1]) {
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onAuthenticated,
}) => {
  const { showToast } = useToast();
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setCooldownSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownSeconds]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || cooldownSeconds > 0) return;

    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
      });

      if (error) {
        const waitSeconds = extractCooldownSeconds(error.message);
        if (waitSeconds !== null || error.status === 429) {
          const seconds = waitSeconds ?? 60;
          setCooldownSeconds(seconds);
          setErrorMsg(error.message);
          showToast(error.message, 'info');
          return;
        }
        console.error('Supabase signInWithOtp error:', error);
        setErrorMsg(error.message);
        showToast(error.message, 'error');
        return;
      }

      setCooldownSeconds(60);
      showToast(`Verification code sent to ${trimmed}`, 'success');
      setStep('otp');
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to send verification code';
      const waitSeconds = extractCooldownSeconds(msg);
      if (waitSeconds !== null) {
        setCooldownSeconds(waitSeconds);
        setErrorMsg(msg);
        showToast(msg, 'info');
      } else {
        console.error('Send OTP error:', err);
        setErrorMsg(msg);
        showToast(msg, 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedOtp = otp.trim();
    if (!trimmedOtp) {
      setErrorMsg('Please enter the verification code from your email.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: trimmedEmail,
        token: trimmedOtp,
        type: 'email',
      });

      if (verifyError) {
        console.error('Supabase verifyOtp error:', verifyError);
        setErrorMsg(verifyError.message);
        showToast(verifyError.message, 'error');
        return;
      }

      // ALWAYS call supabase.rpc('link_my_account') and wait for it to finish before opening the dashboard
      const resolved = await linkAccountAndResolveSession();
      if (resolved.role === 'parent') {
        void supabase.functions
          .invoke('send-whatsapp', { body: { type: 'welcome' } })
          .then(async ({ data, error: waError }) => {
            const res = await parseWhatsAppInvokeResult(data, waError);
            if (!res.ok) {
              console.error(
                'WhatsApp welcome error:',
                res.errorMessage,
                { data, error: waError }
              );
            } else if (res.lastError) {
              console.error(
                'WhatsApp welcome failed:',
                res.lastError,
                { data, error: waError }
              );
            }
          })
          .catch((waErr) => {
            console.error('WhatsApp welcome error:', waErr);
          });
      }
      showToast('Signed in successfully', 'success');
      onAuthenticated(resolved);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Verification failed';
      console.error('Verify OTP / link_my_account error:', err);
      setErrorMsg(msg);
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <BrandLogo variant="dark" size="md" showSubtitle />
          <span className="text-xs font-medium text-slate-500">
            Standard {siteData.standard} · {siteData.academicYear}
          </span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8"
        >
          <div className="mb-6">
            <div className="h-11 w-11 rounded-xl bg-[#0F2A4A] text-[#F5A623] flex items-center justify-center mb-4">
              {step === 'email' ? (
                <Mail className="w-5 h-5" />
              ) : (
                <KeyRound className="w-5 h-5" />
              )}
            </div>
            <h1 className="font-display text-2xl font-bold text-[#0F2A4A] tracking-tight">
              {step === 'email' ? 'Sign In with Email OTP' : 'Enter Verification Code'}
            </h1>
            <p className="mt-1.5 text-sm text-slate-600">
              {step === 'email'
                ? 'Enter your registered teacher or parent email address to receive a one-time code.'
                : `Enter the verification code sent to ${email.trim().toLowerCase()}.`}
            </p>
          </div>

          {step === 'email' ? (
            <form onSubmit={handleSendOtp} className="space-y-4" noValidate>
              <div>
                <label
                  htmlFor="login-email"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Email Address
                </label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errorMsg) setErrorMsg('');
                  }}
                  placeholder="teacher@patilclasses.com"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-[#0F2A4A] focus:outline-none focus:ring-2 focus:ring-[#F5A623] min-h-[44px]"
                />
              </div>

              {errorMsg && (
                <p
                  role="alert"
                  className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5"
                >
                  {errorMsg}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || cooldownSeconds > 0}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#0F2A4A] hover:bg-[#193D68] disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors min-h-[46px] cursor-pointer"
              >
                <span>
                  {submitting
                    ? 'Sending Code...'
                    : cooldownSeconds > 0
                      ? `Please wait ${cooldownSeconds}s`
                      : 'Send OTP'}
                </span>
                <ArrowRight className="w-4 h-4 text-[#F5A623]" />
              </button>

              {/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && (
                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMsg('');
                      setStep('otp');
                    }}
                    className="text-xs font-semibold text-[#0F2A4A] hover:underline cursor-pointer"
                  >
                    Already have a code? Enter OTP
                  </button>
                </div>
              )}
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4" noValidate>
              <div>
                <label
                  htmlFor="login-otp"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Verification Code (OTP)
                </label>
                <input
                  id="login-otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={otp}
                  onChange={(e) => {
                    setOtp(e.target.value);
                    if (errorMsg) setErrorMsg('');
                  }}
                  placeholder="Enter 6-digit code"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base font-mono tracking-widest text-[#0F2A4A] focus:outline-none focus:ring-2 focus:ring-[#F5A623] min-h-[46px]"
                />
              </div>

              {errorMsg && (
                <p
                  role="alert"
                  className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5"
                >
                  {errorMsg}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#0F2A4A] hover:bg-[#193D68] disabled:opacity-60 text-white text-sm font-semibold transition-colors min-h-[46px] cursor-pointer"
              >
                <span>{submitting ? 'Verifying...' : 'Verify & Continue'}</span>
                <ArrowRight className="w-4 h-4 text-[#F5A623]" />
              </button>

              <div className="flex items-center justify-between pt-2 text-xs">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setStep('email');
                    setOtp('');
                    setErrorMsg('');
                  }}
                  className="font-semibold text-slate-600 hover:text-[#0F2A4A] cursor-pointer"
                >
                  Change email
                </button>
                <button
                  type="button"
                  disabled={submitting || cooldownSeconds > 0}
                  onClick={handleSendOtp}
                  className="inline-flex items-center gap-1 font-semibold text-[#0F2A4A] hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>
                    {cooldownSeconds > 0
                      ? `Resend in ${cooldownSeconds}s`
                      : 'Resend code'}
                  </span>
                </button>
              </div>
            </form>
          )}
        </motion.div>
      </main>
    </div>
  );
};
