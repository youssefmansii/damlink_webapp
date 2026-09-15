'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, CheckCircle2, XCircle, Phone, MapPin, Navigation, Clock, Loader2, Heart } from 'lucide-react';
import { formatDistance, getBrowserLocation, haversineKm, parseGeoPoint, type GeoPoint } from '@/lib/geo';
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
    location?: unknown;
  } | null;
}

const URGENCY_COLOR: Record<string, string> = {
  critical: '#DD1F2A',
  urgent:   '#E07B00',
  standard: '#1EA35A',
};
const DONATION_COOLDOWN_DAYS = 90;

function getDonationCooldownUntil(donorProfile: any): Date | null {
  const lastDonationDate = donorProfile?.last_donation_date || donorProfile?.donor_last_donation_date;
  if (!lastDonationDate) return null;

  const cooldownUntil = new Date(lastDonationDate);
  cooldownUntil.setDate(cooldownUntil.getDate() + DONATION_COOLDOWN_DAYS);

  return cooldownUntil > new Date() ? cooldownUntil : null;
}

export default function RequestDetailScreen() {
  const router = useRouter();
  const params = useParams();
  const requestId = params.id as string;

  const [request, setRequest] = useState<RequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [responded, setResponded] = useState(false);
  const [responseStatus, setResponseStatus] = useState<'accepted' | 'declined' | 'completed' | null>(null);
  const [donorLocation, setDonorLocation] = useState<GeoPoint | null>(null);

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
          id, name, address, phone, location
        )
      `)
      .eq('id', requestId)
      .maybeSingle();

    if (!error && data) {
      setRequest(data as unknown as RequestDetail);
    }
    setLoading(false);
  };

  const checkPriorResponse = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setDonorLocation(await getBrowserLocation());
      return;
    }

    const { data: donor } = await supabase
      .from('donor_profiles')
      .select('location')
      .eq('user_id', user.id)
      .maybeSingle();

    setDonorLocation(parseGeoPoint(donor?.location) ?? await getBrowserLocation());

    const { data } = await supabase
      .from('donor_dispatches')
      .select('status')
      .eq('request_id', requestId)
      .eq('donor_user_id', user.id)
      .maybeSingle();

    if (data?.status === 'accepted' || data?.status === 'en_route') {
      setResponded(true);
      setResponseStatus('accepted');
    } else if (data?.status === 'completed') {
      setResponded(true);
      setResponseStatus('completed');
    } else if (data?.status === 'declined') {
      setResponded(true);
      setResponseStatus('declined');
    } else {
      setResponded(false);
      setResponseStatus(null);
    }
  };

  const handleRespond = async (action: 'accepted' | 'declined') => {
    const { data: { user } } = await supabase.auth.getUser();
    setActionLoading(true);

    if (user) {
      const { data: donorProfile } = await supabase
        .from('donor_profiles')
        .select('is_active, donor_eligibility_status, last_donation_date, donor_last_donation_date')
        .eq('user_id', user.id)
        .maybeSingle();

      if (action === 'accepted' && donorProfile?.is_active === false) {
        alert('Your donor profile is inactive. Turn on Active Donor before accepting requests.');
        setActionLoading(false);
        return;
      }

      if (action === 'accepted' && donorProfile?.donor_eligibility_status && donorProfile.donor_eligibility_status !== 'eligible') {
        alert('Your donor profile is not currently eligible to donate.');
        setActionLoading(false);
        return;
      }

      const cooldownUntil = getDonationCooldownUntil(donorProfile);
      if (action === 'accepted' && cooldownUntil) {
        alert(`You can donate again after ${cooldownUntil.toLocaleDateString('en-EG')}.`);
        setActionLoading(false);
        return;
      }

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

  const openDirections = () => {
    const hospitalPoint = parseGeoPoint(request?.hospital?.location);
    if (hospitalPoint) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${hospitalPoint.lat},${hospitalPoint.lng}`, '_blank');
      return;
    }

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
  const hospitalName = request?.hospital?.name || 'Hospital';
  const hospitalPoint = parseGeoPoint(request?.hospital?.location);
  const distanceKm = donorLocation && hospitalPoint ? haversineKm(donorLocation, hospitalPoint) : null;

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
          <div className={styles.detailRow}>
            <span className={styles.label}>Distance to Hospital</span>
            <span className={styles.value}>{formatDistance(distanceKm)}</span>
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
            <div className={styles.pendingConfirmation}>
              <CheckCircle2 size={20} color="#1EA35A" />
              <span>Waiting for hospital staff to confirm the donation.</span>
            </div>
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
