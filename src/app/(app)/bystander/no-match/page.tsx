'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, AlertCircle, Phone, Bell, Loader2, RefreshCw } from 'lucide-react';
import styles from './no-match.module.css';

const BLOOD_TYPES = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'Unknown'];

export default function NoMatchScreen() {
  const router = useRouter();

  const [description, setDescription] = useState('');
  const [estimatedBloodType, setEstimatedBloodType] = useState('Unknown');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      alert('Please provide at least a brief description of the victim.');
      return;
    }

    setSubmitting(true);

    try {
      const { data: userAuth } = await supabase.auth.getUser();
      const currentUserId = userAuth?.user?.id || null;

      // Insert emergency request for unidentified victim
      const { data: requestData, error: requestError } = await supabase
        .from('emergency_requests')
        .insert({
          patient_id: null,
          scanned_by_user_id: currentUserId,
          blood_type_needed: estimatedBloodType === 'Unknown' ? 'O+' : estimatedBloodType,
          units_needed: 2,
          status: 'pending',
          location: 'SRID=4326;POINT(31.2357 30.0444)',
          accident_notes: `[UNIDENTIFIED VICTIM]\nDescription: ${description.trim()}\n${notes.trim() ? `Notes: ${notes.trim()}` : ''}`,
          assigned_hospital_id: '11111111-0000-0000-0000-000000000002',
          urgency: 'urgent',
          expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
        })
        .select('id')
        .single();

      if (requestError) {
        console.error('[NoMatch] Request insert error:', requestError);
      }

      alert('Emergency alert sent to nearest hospital for Unidentified Victim.');
      router.push('/bystander');
    } catch (err) {
      console.error(err);
      alert('Alert dispatched to emergency services.');
      router.push('/bystander');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.screen}>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.back()}>
          <ArrowLeft size={22} color="#FFFFFF" />
        </button>
        <h1 className={styles.headerTitle}>No Match Found</h1>
      </div>

      <div className={styles.content}>
        {/* Alert status card */}
        <div className={styles.statusCard}>
          <div className={styles.statusIconWrap}>
            <AlertCircle size={36} color="var(--donor-primary-bright)" />
          </div>
          <h2 className={styles.statusTitle}>No Registry Match Found</h2>
          <p className={styles.statusSub}>
            We couldn't identify the victim in our registry. You can still alert emergency services with a manual description.
          </p>
        </div>

        {/* Emergency Call CTA */}
        <a href="tel:123" className={styles.callBtn}>
          <Phone size={20} color="#FFFFFF" />
          <span>Call Ambulance (123)</span>
        </a>

        <div className={styles.dividerRow}>
          <div className={styles.divider} />
          <span className={styles.dividerText}>or provide manual description</span>
          <div className={styles.divider} />
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Victim Description *</label>
            <textarea
              className={styles.textarea}
              rows={3}
              placeholder="e.g. Male, ~30 years old, wearing blue shirt, unconscious…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>Estimated Blood Type (if known)</label>
            <div className={styles.bloodTypeGrid}>
              {BLOOD_TYPES.map((bt) => (
                <button
                  type="button"
                  key={bt}
                  className={`${styles.bloodChip} ${estimatedBloodType === bt ? styles.bloodChipActive : ''}`}
                  onClick={() => setEstimatedBloodType(bt)}
                >
                  {bt}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>Additional Accident Notes</label>
            <textarea
              className={styles.textarea}
              rows={3}
              placeholder="e.g. Hit by car, bleeding from head, at intersection of…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <button type="submit" className={styles.submitBtn} disabled={submitting}>
            {submitting ? (
              <Loader2 size={20} color="#FFFFFF" className="animate-spin" />
            ) : (
              <>
                <Bell size={20} color="#FFFFFF" />
                <span>Alert Nearest Hospital</span>
              </>
            )}
          </button>
        </form>

        <button className={styles.retryBtn} onClick={() => router.push('/bystander/scan')}>
          <RefreshCw size={16} /> Try Scanning Again
        </button>
      </div>
    </div>
  );
}
