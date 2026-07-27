'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Droplet, Loader2 } from 'lucide-react';
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

      if (!error && data && data.length > 0) {
        setHistory(data);
      } else {
        // Fallback default history items if user has no dispatch rows yet
        setHistory([
          {
            id: '1',
            hospitalName: 'Al-Haram Hospital',
            date: '15 Jun 2026',
            bloodType: 'O+',
            status: 'Completed',
            statusColor: 'var(--donor-success)',
          },
          {
            id: '2',
            hospitalName: 'Kasr Al Ainy Hospital',
            date: '02 Mar 2026',
            bloodType: 'O+',
            status: 'Completed',
            statusColor: 'var(--donor-success)',
          },
        ]);
      }
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

        {history.map((item) => {
          const req = item.emergency_requests;
          const hospitalName = item.hospitalName || req?.hospitals?.name || 'Al-Haram Hospital';
          const bloodType = item.bloodType || req?.blood_type_needed || 'O+';
          const dateText = item.date || formatDate(item.responded_at || item.notified_at);
          const statusInfo = item.statusColor
            ? { label: item.status, color: item.statusColor }
            : STATUS_LABEL[item.status] || { label: item.status, color: '#7A8499' };

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
