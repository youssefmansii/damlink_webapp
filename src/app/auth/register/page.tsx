'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, Droplet, Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import styles from './register.module.css';

const BLOOD_TYPES = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];

export default function DonorRegisterScreen() {
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [bloodType, setBloodType] = useState<string>('A-');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fullName.trim()) return setError('Please enter your full name.');
    if (!email.trim()) return setError('Please enter your email address.');
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    if (!bloodType) return setError('Please select your blood type.');

    setLoading(true);
    setError(null);

    try {
      // 1. Sign up auth user
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            phone: phone.trim(),
            blood_type: bloodType,
          },
        },
      });

      if (signUpError) throw signUpError;

      const user = authData.user;
      if (user) {
        // 2. Insert/Update Profile in Supabase
        await supabase.from('profiles').upsert({
          id: user.id,
          full_name: fullName.trim(),
          phone: phone.trim(),
          blood_type: bloodType,
          is_donor_registered: true,
        });

        // 3. Create donor_profiles row
        await supabase.from('donor_profiles').upsert({
          user_id: user.id,
          is_active: true,
          donations_count: 0,
          lives_saved_estimate: 0,
          points_balance: 100,
        });
      }

      setSuccess(true);
      setTimeout(() => {
        localStorage.setItem('damlink_mode', 'donor');
        router.push('/donor');
      }, 1500);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to create donor account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.screen}>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.back()}>
          <ArrowLeft size={20} color="#FFFFFF" />
        </button>
        <div className={styles.logoWrap}>
          <Droplet size={28} color="#FFFFFF" />
        </div>
        <h1 className={styles.headerTitle}>Create Donor Account</h1>
        <p className={styles.headerSub}>Join the DamLink lifesaving donor network</p>
      </div>

      {/* Form Card */}
      <div className={styles.formCard}>
        {success ? (
          <div className={styles.successBox}>
            <CheckCircle2 size={48} color="#1EA35A" />
            <h2 className={styles.successTitle}>Account Created!</h2>
            <p className={styles.successSub}>
              Welcome to DamLink, <strong>{fullName}</strong>. Redirecting to your Donor Dashboard…
            </p>
          </div>
        ) : (
          <form onSubmit={handleRegister} className={styles.form}>
            {error && (
              <div className={styles.errorBox}>
                <AlertCircle size={18} color="#DD1F2A" />
                <span>{error}</span>
              </div>
            )}

            <div className={styles.field}>
              <label className={styles.label}>Full Name *</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Ahmed Hassan"
                className={styles.input}
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+20 10 0000 0000"
                className={styles.input}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Email Address *</label>
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
              <label className={styles.label}>Password *</label>
              <div className={styles.passwordWrap}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 6 characters"
                  className={styles.passwordInput}
                  required
                />
                <button
                  type="button"
                  className={styles.eyeBtn}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={18} color="#7A8499" /> : <Eye size={18} color="#7A8499" />}
                </button>
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Blood Type *</label>
              <div className={styles.bloodGrid}>
                {BLOOD_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={`${styles.bloodPill} ${bloodType === type ? styles.bloodPillActive : ''}`}
                    onClick={() => setBloodType(type)}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <button type="submit" className={styles.primaryBtn} disabled={loading}>
              {loading ? 'Creating Account…' : 'Create Donor Account'}
            </button>

            <div className={styles.loginRow}>
              <span>Already have an account? </span>
              <a href="/" className={styles.loginLink}>Sign In</a>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
