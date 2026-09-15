'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CheckCircle2, Droplet, Loader2 } from 'lucide-react';
import styles from './history.module.css';

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  completed: { label: 'Completed', color: 'var(--donor-success)' },
  en_route: { label: 'En Route', color: '#E07B00' },
  accepted: { label: 'Accepted', color: 'var(--donor-primary-bright)' },
  declined: { label: 'Declined', color: '#7A8499' },
  no_show: { label: 'No-Show', color: '#DD1F2A' },
  notified: { label: 'Notified', color: '#7A8499' },
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-EG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function HistoryScreen() {
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    fetchHistoryData();
  }, []);

  const fetchHistoryData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('donor_dispatches')
        .select(`
          id,
          request_id,
          status,
          responded_at,
          notified_at,
          emergency_requests (
            blood_type_needed,
            urgency,
            hospitals (
              name
            )
          )
        `)
        .eq('donor_user_id', user.id)
        .order('notified_at', { ascending: false });

      setHistory(!error && data ? data : []);
    } catch (err) {
      console.error('[History] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.screen} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Loader2 size={36} color="var(--donor-primary-bright)" className="animate-spin" />
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <div className={styles.content}>
        <h1 className={styles.title}>Donation History</h1>
        <p className={styles.subtitle}>Your completed and active donor missions</p>

        {history.length === 0 ? (
          <div className={styles.emptyBox}>
            <CheckCircle2 size={32} color="var(--donor-success)" />
            <strong>No donation history yet</strong>
            <span>Accepted and hospital-confirmed donor missions will appear here.</span>
          </div>
        ) : history.map((item) => {
          const req = item.emergency_requests;
          const hospitalName = req?.hospitals?.name || 'Hospital';
          const bloodType = req?.blood_type_needed || 'Unknown';
          const dateText = formatDate(item.responded_at || item.notified_at);
          const statusInfo = STATUS_LABEL[item.status] || { label: item.status, color: '#7A8499' };

          return (
            <div key={item.id} className={styles.card}>
              <div className={styles.iconWrap}>
                <Droplet size={18} color="#FFFFFF" />
              </div>
              <div className={styles.info}>
                <div className={styles.hospital}>{hospitalName}</div>
                <div className={styles.meta}>
                  {dateText} • Blood Type {bloodType}
                </div>
              </div>
              <div className={styles.status} style={{ color: statusInfo.color }}>
                {statusInfo.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
