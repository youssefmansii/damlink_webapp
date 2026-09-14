'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, AlertCircle, Phone, Bell, Loader2, RefreshCw, CreditCard, Search } from 'lucide-react';
import styles from './no-match.module.css';

const BLOOD_TYPES = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'Unknown'];

export default function NoMatchScreen() {
  const router = useRouter();

  const [description, setDescription] = useState('');
  const [estimatedBloodType, setEstimatedBloodType] = useState('Unknown');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [manualNationalId, setManualNationalId] = useState('');
  const [manualIdError, setManualIdError] = useState('');
  const [manualIdSearching, setManualIdSearching] = useState(false);
  const [formError, setFormError] = useState('');

  const normalizeNationalId = (value: string) => {
    return value
      .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
      .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
      .replace(/\D/g, '');
  };

  const getCoordinates = (): Promise<{ lat: number; lng: number }> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ lat: 30.0444, lng: 31.2357 });
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve({ lat: 30.0444, lng: 31.2357 })
      );
    });
  };

  const handleManualIdLookup = async (e: React.FormEvent) => {
    e.preventDefault();

    const nationalId = normalizeNationalId(manualNationalId);
    if (!/^[23]\d{13}$/.test(nationalId)) {
      setManualIdError('Enter a valid 14-digit Egyptian National ID.');
      return;
    }

    setManualIdError('');
    setManualIdSearching(true);

    try {
      const coords = await getCoordinates();
      const { data, error } = await supabase.functions.invoke('on-victim-scan', {
        body: {
          scan_mode: 'manual',
          manual_national_id: nationalId,
          bystander_lat: coords.lat,
          bystander_lng: coords.lng,
        },
      });

      if (error) throw error;

      if (!data?.matched || !data?.patient) {
        setManualIdError('No patient record found for this National ID.');
        return;
      }

      sessionStorage.setItem(
        'damlink_match_data',
        JSON.stringify({
          matched: true,
          patient: data.patient,
          request_id: data.request_id || `req_${Date.now()}`,
          hospital: data.hospital,
        })
      );
      router.push('/bystander/match-result');
    } catch (err) {
      console.error('[NoMatch] Manual ID lookup error:', err);
      setManualIdError('Could not check this ID right now. Please try again.');
    } finally {
      setManualIdSearching(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setFormError('Please provide at least a brief description of the victim.');
      return;
    }

    setSubmitting(true);
    setFormError('');

    try {
      const coords = await getCoordinates();
      const descriptionText = `[UNIDENTIFIED VICTIM]\nDescription: ${description.trim()}${
        notes.trim() ? `\nNotes: ${notes.trim()}` : ''
      }`;

      const { data, error } = await supabase.functions.invoke('on-victim-scan', {
        body: {
          scan_mode: 'manual',
          unidentified: true,
          description: descriptionText,
          estimated_blood_type: estimatedBloodType,
          bystander_lat: coords.lat,
          bystander_lng: coords.lng,
        },
      });

      if (error) throw error;
      if (!data?.request_id) throw new Error('The emergency request was not created.');

      sessionStorage.removeItem('damlink_scan_image');
      sessionStorage.setItem(
        'damlink_unidentified_request',
        JSON.stringify({
          request_id: data.request_id,
          hospital: data.hospital ?? null,
        })
      );

      alert(
        data.hospital?.name
          ? `Emergency alert sent to ${data.hospital.name}.`
          : 'Emergency alert sent. Hospital assignment is pending.'
      );
      router.push('/bystander');
    } catch (err) {
      console.error('[NoMatch] Unidentified request error:', err);
      setFormError('Could not send this emergency alert right now. Please call ambulance services and try again.');
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
            We could not identify the victim in our registry. You can still alert emergency services with a manual description.
          </p>
        </div>

        <form className={styles.manualLookupCard} onSubmit={handleManualIdLookup}>
          <div className={styles.manualLookupHeader}>
            <div className={styles.manualLookupIcon}>
              <CreditCard size={20} color="#FFFFFF" />
            </div>
            <div>
              <h3 className={styles.manualLookupTitle}>Enter National ID</h3>
              <p className={styles.manualLookupSub}>Use the 14-digit number if it is readable.</p>
            </div>
          </div>

          <label className={styles.fieldLabel} htmlFor="manual-national-id">
            Egyptian National ID
          </label>
          <div className={styles.manualIdRow}>
            <input
              id="manual-national-id"
              className={`${styles.textInput} ${manualIdError ? styles.inputError : ''}`}
              inputMode="numeric"
              autoComplete="off"
              maxLength={20}
              placeholder="30408042101277"
              value={manualNationalId}
              onChange={(e) => {
                setManualNationalId(e.target.value);
                if (manualIdError) setManualIdError('');
              }}
              aria-invalid={manualIdError ? 'true' : 'false'}
              aria-describedby={manualIdError ? 'manual-national-id-error' : undefined}
            />
            <button
              type="submit"
              className={styles.lookupBtn}
              disabled={manualIdSearching}
              aria-label="Find patient by National ID"
            >
              {manualIdSearching ? (
                <Loader2 size={18} color="#FFFFFF" className="animate-spin" />
              ) : (
                <Search size={18} color="#FFFFFF" />
              )}
              <span>Find</span>
            </button>
          </div>
          {manualIdError && (
            <p id="manual-national-id-error" className={styles.fieldError} role="alert">
              {manualIdError}
            </p>
          )}
        </form>

        {/* Emergency Call CTA */}
        <a href="tel:123" className={styles.callBtn}>
          <Phone size={20} color="#FFFFFF" />
          <span>Call Ambulance (123)</span>
        </a>

        <div className={styles.dividerRow}>
          <div className={styles.divider} />
          <span className={styles.dividerText}>or continue as unidentified</span>
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

          {formError && (
            <p className={styles.formError} role="alert">
              {formError}
            </p>
          )}

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
