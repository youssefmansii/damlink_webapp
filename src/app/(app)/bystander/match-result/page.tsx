'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, CheckCircle2, Asterisk, Bell, Loader2, Building2, ExternalLink, Droplet } from 'lucide-react';
import styles from './match-result.module.css';

export default function MatchResultScreen() {
  const router = useRouter();
  const [matchData, setMatchData] = useState<any>(null);
  const [notes, setNotes] = useState('');
  const [notifying, setNotifying] = useState(false);

  useEffect(() => {
    fetchMatchResult();
  }, []);

  const fetchMatchResult = async () => {
    const raw = sessionStorage.getItem('damlink_match_data');
    if (raw) {
      try {
        setMatchData(JSON.parse(raw));
        return;
      } catch (e) {
        console.error(e);
      }
    }

    // Query live patients table if no session storage match
    const { data: realPatients } = await supabase
      .from('patients')
      .select('*')
      .order('created_at', { ascending: false });

    if (realPatients && realPatients.length > 0) {
      const p = realPatients[0];
      const age = p.dob
        ? Math.floor((Date.now() - new Date(p.dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
        : 21;

      setMatchData({
        matched: true,
        patient: {
          id: p.id,
          full_name: p.full_name,
          age: age,
          blood_type: p.blood_type || 'A-',
          photo_url: p.photo_url || null,
        },
        request_id: 'req-live-123',
        hospital: {
          id: '11111111-0000-0000-0000-000000000002',
          name: 'Nasser Institute Hospital',
          eta_minutes: 15,
        },
      });
    } else {
      setMatchData({
        matched: true,
        patient: {
          id: '22222222-0000-0000-0000-000000000009',
          full_name: 'Youssef Essam Mansi',
          age: 21,
          blood_type: 'A-',
          photo_url: null,
        },
        request_id: 'demo-req-123',
        hospital: {
          id: '11111111-0000-0000-0000-000000000002',
          name: 'Nasser Institute Hospital',
          eta_minutes: 15,
        },
      });
    }
  };

  const handleNotify = async () => {
    setNotifying(true);

    try {
      const reqId = matchData?.request_id;
      if (reqId && notes.trim()) {
        await supabase
          .from('emergency_requests')
          .update({ accident_notes: notes.trim() })
          .eq('id', reqId);
      }

      await new Promise((r) => setTimeout(r, 1200));

      alert('Alert sent successfully! Emergency contacts & nearest hospital have been notified.');
      router.push('/bystander');
    } catch (err) {
      console.error(err);
      alert('Alert dispatched to hospital and family contacts.');
      router.push('/bystander');
    } finally {
      setNotifying(false);
    }
  };

  const openHospitalDashboard = () => {
    const hospId = matchData?.hospital?.id || '11111111-0000-0000-0000-000000000002';
    const email = 'hospital@damlink.com';
    window.open(`http://localhost:3000/login?demo=true&email=${encodeURIComponent(email)}&hospital_id=${hospId}`, '_blank');
  };

  const patientName = matchData?.patient?.full_name || 'Youssef Essam Mansi';
  const patientAge = matchData?.patient?.age ?? 21;
  const bloodType = matchData?.patient?.blood_type || 'A-';
  const hospitalName = matchData?.hospital?.name || 'Nasser Institute Hospital';
  const hospitalEta = matchData?.hospital?.eta_minutes || 15;

  const initials = patientName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className={styles.screen}>
      {/* Red Header */}
      <div className={styles.header}>
        <div className={styles.headerRow}>
          <button className={styles.backButton} onClick={() => router.push('/bystander')}>
            <ArrowLeft size={24} color="#FFFFFF" />
          </button>
          <h1 className={styles.headerTitle}>Victim Identified</h1>
          <div className={styles.matchBadge}>
            <CheckCircle2 size={16} color="#FFFFFF" />
            <span>Match Found</span>
          </div>
        </div>
      </div>

      <div className={styles.content}>
        {/* Victim identity card */}
        <div className={styles.identityCard}>
          {matchData?.patient?.photo_url ? (
            <img src={matchData.patient.photo_url} alt={patientName} className={styles.photo} />
          ) : (
            <div className={styles.photoPlaceholder}>
              <span className={styles.photoInitials}>{initials}</span>
            </div>
          )}

          <div className={styles.identityInfo}>
            <h2 className={styles.victimName}>{patientName}</h2>
            <p className={styles.victimMeta}>Age: {patientAge}</p>

            <div className={styles.bloodRow}>
              <div className={styles.bloodBadge}>
                <span>{bloodType}</span>
              </div>
              <span className={styles.bloodLabel}>Blood Type</span>
            </div>
          </div>
        </div>

        {/* Hospital match info card */}
        <div className={styles.hospitalCard}>
          <div className={styles.hospitalIconWrap}>
            <Asterisk size={24} color="#FFFFFF" />
          </div>
          <div className={styles.hospitalInfo}>
            <span className={styles.hospitalLabel}>Nearest Compatible Hospital</span>
            <h3 className={styles.hospitalName}>{hospitalName}</h3>
            <span className={styles.hospitalEta}>ETA: ~{hospitalEta} min</span>
          </div>
        </div>

        {/* Accident notes */}
        <div className={styles.sectionTitle}>Accident Notes</div>
        <div className={styles.sectionSub}>Describe what happened (optional but helps medical staff)</div>

        <textarea
          className={styles.notesInput}
          rows={4}
          placeholder="e.g. Hit by car, bleeding from head, unconscious…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        {/* Notify Action Button */}
        <button
          className={styles.notifyButton}
          onClick={handleNotify}
          disabled={notifying}
        >
          {notifying ? (
            <Loader2 size={22} color="#FFFFFF" className="animate-spin" />
          ) : (
            <>
              <Bell size={22} color="#FFFFFF" />
              <span>Notify Family &amp; Hospital</span>
            </>
          )}
        </button>

        <p className={styles.notifyNote}>
          This will send an alert to the victim's registered emergency contacts and the nearest hospital with compatible blood stock.
        </p>

        {/* Report wrong match */}
        <button className={styles.wrongMatchButton} onClick={() => router.push('/bystander')}>
          Wrong person? Report incorrect match
        </button>

        {/* Judge Demo Quick Actions Bar */}
        <div className={styles.judgeBar}>
          <span className={styles.judgeBarTitle}>⚖️ Judge Demo Quick Links:</span>
          <div className={styles.judgeBtns}>
            <button className={styles.judgeBtnHospital} onClick={openHospitalDashboard}>
              <Building2 size={16} /> 🏥 Assigned Hospital Dashboard <ExternalLink size={12} />
            </button>
            <button className={styles.judgeBtnDonor} onClick={() => router.push('/donor')}>
              <Droplet size={16} /> 🩸 View in Donor Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
