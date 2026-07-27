'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, CheckCircle2, XCircle, Phone, MapPin, Navigation, Droplet, Clock, Loader2, Heart } from 'lucide-react';
import styles from './request-detail.module.css';

interface RequestDetail {
  id: string;
  blood_type_needed: string;
  units_needed: number;
  urgency: 'critical' | 'urgent' | 'standard';
  status: string;
  accident_notes: string | null;
  created_at: string;
  expires_at: string | null;
  hospital: {
    id: string;
    name: string;
    address: string | null;
    phone: string | null;
  } | null;
}

const URGENCY_COLOR: Record<string, string> = {
  critical: '#DD1F2A',
  urgent:   '#E07B00',
  standard: '#1EA35A',
};

export default function RequestDetailScreen() {
  const router = useRouter();
  const params = useParams();
  const requestId = params.id as string;

  const [request, setRequest] = useState<RequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [responded, setResponded] = useState(false);
  const [responseStatus, setResponseStatus] = useState<'accepted' | 'declined' | 'completed' | null>(null);

  useEffect(() => {
    if (requestId) {
      fetchRequest();
      checkPriorResponse();
    }
  }, [requestId]);

  const fetchRequest = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('emergency_requests')
      .select(`
        id,
        blood_type_needed,
        units_needed,
        urgency,
        status,
        accident_notes,
        created_at,
        expires_at,
        hospital:hospitals (
          id, name, address, phone
        )
      `)
      .eq('id', requestId)
      .maybeSingle();

    if (!error && data) {
      setRequest(data as unknown as RequestDetail);
    } else {
      // Fallback demo request details matching standardized emergency requests
      setRequest({
        id: requestId,
        blood_type_needed: 'A-',
        units_needed: 2,
        urgency: 'critical',
        status: 'donor_matching',
        accident_notes: 'RTA victim, head injury, blood urgently needed for surgery.',
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 12 * 3600000).toISOString(),
        hospital: {
          id: '11111111-0000-0000-0000-000000000002',
          name: 'Nasser Institute Hospital',
          address: 'Corniche El Nile, Shubra, Cairo',
          phone: '+20-2-25731285',
        },
      });
    }
    setLoading(false);
  };

  const checkPriorResponse = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('donor_dispatches')
      .select('status')
      .eq('request_id', requestId)
      .eq('donor_user_id', user.id)
      .maybeSingle();

    if (data) {
      setResponded(true);
      setResponseStatus(
        data.status === 'accepted' || data.status === 'en_route'
          ? 'accepted'
          : data.status === 'completed'
            ? 'completed'
            : 'declined'
      );
    }
  };

  const handleRespond = async (action: 'accepted' | 'declined') => {
    const { data: { user } } = await supabase.auth.getUser();
    setActionLoading(true);

    if (user) {
      const { data: existing } = await supabase
        .from('donor_dispatches')
        .select('id')
        .eq('request_id', requestId)
        .eq('donor_user_id', user.id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('donor_dispatches')
          .update({
            status: action,
            responded_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      } else {
        await supabase.from('donor_dispatches').insert({
          request_id: requestId,
          donor_user_id: user.id,
          status: action,
          responded_at: new Date().toISOString(),
        });
      }
    }

    setResponded(true);
    setResponseStatus(action);
    setActionLoading(false);

    if (action === 'accepted') {
      alert(`🩸 Request Accepted!\n\nPlease head to ${request?.hospital?.name ?? 'the hospital'} as soon as possible.\n${request?.hospital?.address ?? ''}`);
    }
  };

  const handleCompleteDonation = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setActionLoading(true);

    if (user) {
      // 1. Mark dispatch as completed
      await supabase
        .from('donor_dispatches')
        .update({ status: 'completed' })
        .eq('request_id', requestId)
        .eq('donor_user_id', user.id);

      // 2. Increment stats in donor_profiles
      const { data: donorData } = await supabase
        .from('donor_profiles')
        .select('donations_count, lives_saved_estimate')
        .eq('user_id', user.id)
        .maybeSingle();

      if (donorData) {
        await supabase
          .from('donor_profiles')
          .update({
            donations_count: (donorData.donations_count || 0) + 1,
            lives_saved_estimate: (donorData.lives_saved_estimate || 0) + 3,
            last_donation_date: new Date().toISOString().split('T')[0],
          })
          .eq('user_id', user.id);
      }

      // 3. Decrement units needed
      if (request) {
        const newUnitsNeeded = Math.max((request.units_needed || 1) - 1, 0);
        const newStatus = newUnitsNeeded === 0 ? 'resolved' : request.status;

        await supabase
          .from('emergency_requests')
          .update({ units_needed: newUnitsNeeded, status: newStatus })
          .eq('id', requestId);
      }
    }

    setResponseStatus('completed');
    setActionLoading(false);
  };

  const openDirections = () => {
    if (!request?.hospital?.address) return;
    const encoded = encodeURIComponent(request.hospital.address);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`, '_blank');
  };

  if (loading) {
    return (
      <div className={styles.screen} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Loader2 size={36} color="var(--donor-primary-bright)" className="animate-spin" />
      </div>
    );
  }

  const urgencyColor = URGENCY_COLOR[request?.urgency || 'urgent'] ?? '#E07B00';
  const hospitalName = request?.hospital?.name || 'Nasser Institute Hospital';

  return (
    <div className={styles.screen}>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.back()}>
          <ArrowLeft size={20} color="#FFFFFF" />
        </button>
        <h1 className={styles.headerTitle}>Request Details</h1>
        <span className={styles.urgencyBadge} style={{ backgroundColor: urgencyColor }}>
          {(request?.urgency || 'urgent').toUpperCase()}
        </span>
      </div>

      <div className={styles.content}>
        {/* Responded confirmation banner */}
        {responded && responseStatus !== 'completed' && (
          <div className={`${styles.responseBanner} ${responseStatus === 'accepted' ? styles.responseBannerAccepted : styles.responseBannerDeclined}`}>
            {responseStatus === 'accepted' ? (
              <CheckCircle2 size={20} color="#1EA35A" />
            ) : (
              <XCircle size={20} color="#7A8499" />
            )}
            <span className={styles.responseBannerText}>
              {responseStatus === 'accepted'
                ? 'You accepted this request — please proceed to the hospital as soon as possible.'
                : 'You declined this request.'}
            </span>
          </div>
        )}

        {/* Hospital info card */}
        <div className={styles.card}>
          <div className={styles.hospitalHeader}>
            <div className={styles.hospitalAvatar} style={{ backgroundColor: urgencyColor }}>
              <span>{hospitalName.charAt(0)}</span>
            </div>
            <div className={styles.hospitalInfo}>
              <h2 className={styles.hospitalName}>{hospitalName}</h2>
              <p className={styles.address}>{request?.hospital?.address || 'Cairo, Egypt'}</p>
            </div>
          </div>

          {request?.hospital?.phone && (
            <a href={`tel:${request.hospital.phone}`} className={styles.phoneButton}>
              <Phone size={14} color="var(--donor-primary-bright)" />
              <span>{request.hospital.phone}</span>
            </a>
          )}
        </div>

        {/* Details card */}
        <div className={styles.card}>
          <div className={styles.detailRow}>
            <span className={styles.label}>Blood Type Needed</span>
            <span className={styles.valueDanger} style={{ color: urgencyColor }}>
              {request?.blood_type_needed || 'A-'}
            </span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.label}>Units Needed</span>
            <span className={styles.value}>{request?.units_needed || 2} Units</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.label}>Urgency Level</span>
            <span className={styles.valueSuccess} style={{ color: urgencyColor }}>
              {(request?.urgency || 'urgent').toUpperCase()}
            </span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.label}>Time Window</span>
            <span className={styles.value}>Expires in 12 hours</span>
          </div>

          {request?.accident_notes && (
            <div className={styles.notesWrap}>
              <span className={styles.notesLabel}>Situation / Accident Notes</span>
              <p className={styles.notesText}>{request.accident_notes}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        {!responded ? (
          <div className={styles.actionGroup}>
            <button
              className={styles.acceptButton}
              onClick={() => handleRespond('accepted')}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <Loader2 size={20} color="#FFFFFF" className="animate-spin" />
              ) : (
                <>
                  <CheckCircle2 size={22} color="#FFFFFF" />
                  <span>Accept Request</span>
                </>
              )}
            </button>

            <button
              className={styles.declineButton}
              onClick={() => handleRespond('declined')}
              disabled={actionLoading}
            >
              Decline
            </button>
          </div>
        ) : responseStatus === 'accepted' ? (
          <div className={styles.actionGroup}>
            <button className={styles.directionsButton} onClick={openDirections}>
              <Navigation size={20} color="#FFFFFF" />
              <span>Get Directions to Hospital</span>
            </button>
            <button
              className={styles.acceptButton}
              style={{ backgroundColor: '#1EA35A' }}
              onClick={handleCompleteDonation}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <Loader2 size={20} color="#FFFFFF" className="animate-spin" />
              ) : (
                <>
                  <Droplet size={20} color="#FFFFFF" />
                  <span>I Have Donated</span>
                </>
              )}
            </button>
          </div>
        ) : responseStatus === 'completed' ? (
          <div className={styles.completedBanner}>
            <Heart size={24} color="#1EA35A" />
            <span className={styles.completedText}>
              Mission Accomplished! Thank you for saving a life today.
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
