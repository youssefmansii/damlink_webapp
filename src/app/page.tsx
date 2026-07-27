'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Droplet, Eye, EyeOff, AlertCircle, UserPlus } from 'lucide-react';
import styles from './page.module.css';

export default function Home() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError && signInError.message.includes('Invalid login credentials')) {
        // Auto sign-up for demo accounts
        const { error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: 'Demo Donor', phone: '+201000000000' } }
        });
        if (signUpError) throw signUpError;
      } else if (signInError) {
        throw signInError;
      }

      // Default to donor mode on login
      localStorage.setItem('damlink_mode', 'donor');
      router.replace('/donor');
    } catch (err: any) {
      setError(err.message || 'Failed to sign in. Please try again.');
      setLoading(false);
    }
  };

  const autofillDemo = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('password123');
    setError(null);
  };

  return (
    <div className={styles.screen}>
      {/* Header Gradient */}
      <div className={styles.header}>
        <div className={styles.logoWrap}>
          <Droplet size={36} color="#FFFFFF" />
        </div>
        <h1 className={styles.appName}>DamLink</h1>
        <p className={styles.tagline}>Linking Data. Saving Lives.</p>
      </div>

      {/* Form Card */}
      <div className={styles.formCard}>
        <h2 className={styles.title}>Welcome Back</h2>
        <p className={styles.subtitle}>Sign in to your donor account</p>

        {error && (
          <div className={styles.errorBox}>
            <AlertCircle size={16} color="#DD1F2A" />
            <span className={styles.errorText}>{error}</span>
          </div>
        )}

        <form onSubmit={handleSignIn} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={styles.input}
              required
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Password</label>
            <div className={styles.passwordWrap}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={styles.passwordInput}
                required
              />
              <button
                type="button"
                className={styles.eyeButton}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={20} color="#7A8499" /> : <Eye size={20} color="#7A8499" />}
              </button>
            </div>
          </div>

          <button type="submit" className={styles.primaryButton} disabled={loading}>
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        {/* Account Registration Links Row */}
        <div className={styles.secondaryButton}>
          <span>Don't have an account? <a href="/auth/register" className={styles.linkText}>Register</a></span>
          <span className={styles.dotDivider}>•</span>
          <button
            type="button"
            className={styles.patientRegisterLink}
            onClick={() => router.push('/patient/register')}
          >
            <UserPlus size={14} color="var(--donor-primary-bright)" />
            Register Patient
          </button>
        </div>

        {/* Quick Access / Demo Action Bar */}
        <div className={styles.demoSection}>
          <p className={styles.demoTitle}>⚡ Quick Demo Sign In & Actions:</p>
          <div className={styles.demoPills}>
            <button className={styles.demoPill} onClick={() => autofillDemo('donor@damlink.com')}>
              🩸 Donor Demo
            </button>
            <button className={styles.demoPill} onClick={() => autofillDemo('bystander@damlink.com')}>
              🚨 Bystander Demo
            </button>
            <button className={styles.patientPill} onClick={() => router.push('/patient/register')}>
              🏥 Register Patient
            </button>
            <button className={styles.demoPill} onClick={() => window.open('http://localhost:3000/login?demo=true', '_blank')}>
              🏥 Hospital Dashboard ↗
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
