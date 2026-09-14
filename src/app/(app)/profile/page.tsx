'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  LogOut,
  Phone,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  UserRound,
} from 'lucide-react';
import {
  defaultDonorEligibilityAnswers,
  evaluateDonorEligibility,
  type DonorEligibilityAnswers,
} from '@/lib/donorEligibility';
import styles from './profile.module.css';

const BLOOD_TYPES = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];

type Contact = {
  id?: string;
  name: string;
  relation: string;
  phone: string;
  is_enabled?: boolean;
};

type SavingTarget = 'donor' | 'patient' | 'contact' | null;

const emptyContact: Contact = {
  name: '',
  relation: '',
  phone: '',
  is_enabled: true,
};

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<SavingTarget>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState('');
  const [profile, setProfile] = useState<any>(null);
  const [donorProfile, setDonorProfile] = useState<any>(null);
  const [patientProfile, setPatientProfile] = useState<any>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactDraft, setContactDraft] = useState<Contact>(emptyContact);

  const [donorForm, setDonorForm] = useState({
    full_name: '',
    phone: '',
    blood_type: 'A-',
    is_active: true,
  });
  const [eligibilityAnswers, setEligibilityAnswers] = useState<DonorEligibilityAnswers>(defaultDonorEligibilityAnswers);

  const [patientForm, setPatientForm] = useState({
    full_name: '',
    national_id_hash: '',
    dob: '',
    blood_type: 'A-',
    medical_conditions: '',
  });

  useEffect(() => {
    fetchProfileData();
  }, []);

  const eligibility = evaluateDonorEligibility(eligibilityAnswers, patientForm.dob);
  const canActivateDonor = eligibility.status === 'eligible';

  const updateEligibility = <K extends keyof DonorEligibilityAnswers>(
    key: K,
    value: DonorEligibilityAnswers[K],
  ) => {
    setEligibilityAnswers((current) => ({ ...current, [key]: value }));
  };

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2600);
  };

  const fetchProfileData = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;

      if (!user) {
        router.replace('/');
        return;
      }

      setUserId(user.id);
      setEmail(user.email || '');

      let { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (!profileData) {
        const defaultProfile = {
          id: user.id,
          full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Registered Donor',
          phone: user.user_metadata?.phone || '',
          blood_type: user.user_metadata?.blood_type || 'A-',
          is_donor_registered: true,
        };

        const { data: createdProfile } = await supabase
          .from('profiles')
          .insert(defaultProfile)
          .select('*')
          .single();

        profileData = createdProfile || defaultProfile;
      }

      let { data: donorData } = await supabase
        .from('donor_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!donorData) {
        const defaultDonor = {
          user_id: user.id,
          is_active: true,
          donations_count: 0,
          lives_saved_estimate: 0,
          reliability_rating: 5.0,
          points_balance: 100,
        };

        const { data: createdDonor } = await supabase
          .from('donor_profiles')
          .insert(defaultDonor)
          .select('*')
          .single();

        donorData = createdDonor || defaultDonor;
      }

      const { data: patientData, error: patientErr } = await supabase
        .from('patients')
        .select('*')
        .eq('profile_id', user.id)
        .maybeSingle();

      if (patientErr) {
        console.warn('[Profile] Patient profile lookup skipped:', patientErr.message);
      }

      const { data: contactData, error: contactsErr } = await supabase
        .from('emergency_contacts')
        .select('*')
        .eq('profile_id', user.id)
        .order('name', { ascending: true });

      if (contactsErr) {
        console.warn('[Profile] Emergency contacts lookup skipped:', contactsErr.message);
      }

      setProfile(profileData);
      setDonorProfile(donorData);
      setPatientProfile(patientData || null);
      setContacts(contactData || []);

      setDonorForm({
        full_name: profileData?.full_name || '',
        phone: profileData?.phone || '',
        blood_type: profileData?.blood_type || 'A-',
        is_active: donorData?.is_active ?? false,
      });

      setEligibilityAnswers({
        ...defaultDonorEligibilityAnswers,
        ...(donorData?.donor_health_answers || {}),
        weightKg: donorData?.donor_weight_kg ? String(donorData.donor_weight_kg) : donorData?.donor_health_answers?.weightKg || '',
        lastDonationDate: donorData?.donor_last_donation_date || donorData?.donor_health_answers?.lastDonationDate || '',
      });

      setPatientForm({
        full_name: patientData?.full_name || profileData?.full_name || '',
        national_id_hash: patientData?.national_id_hash || '',
        dob: patientData?.dob || '',
        blood_type: patientData?.blood_type || profileData?.blood_type || 'A-',
        medical_conditions: Array.isArray(patientData?.medical_conditions)
          ? patientData.medical_conditions.join(', ')
          : '',
      });
    } catch (err: any) {
      console.error('[Profile] Fetch error:', err);
      setError(err.message || 'Could not load your profile.');
    } finally {
      setLoading(false);
    }
  };

  const saveDonor = async () => {
    if (!userId) return;
    if (!donorForm.full_name.trim()) {
      setError('Full name is required.');
      return;
    }

    setSaving('donor');
    setError(null);

    try {
      const donorIsActive = donorForm.is_active && canActivateDonor;

      const { data: savedProfile, error: profileErr } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          full_name: donorForm.full_name.trim(),
          phone: donorForm.phone.trim(),
          blood_type: donorForm.blood_type,
          is_donor_registered: true,
        })
        .select('*')
        .single();

      if (profileErr) throw profileErr;

      const { data: savedDonor, error: donorErr } = await supabase
        .from('donor_profiles')
        .upsert({
          user_id: userId,
          is_active: donorIsActive,
          donor_weight_kg: eligibilityAnswers.weightKg ? Number(eligibilityAnswers.weightKg) : null,
          donor_last_donation_date: eligibilityAnswers.lastDonationDate || null,
          donor_health_answers: eligibilityAnswers,
          donor_eligibility_status: eligibility.status,
          donor_eligibility_reasons: eligibility.reasons,
          donor_eligibility_checked_at: new Date().toISOString(),
          donations_count: donorProfile?.donations_count ?? 0,
          lives_saved_estimate: donorProfile?.lives_saved_estimate ?? 0,
          reliability_rating: donorProfile?.reliability_rating ?? 5.0,
          points_balance: donorProfile?.points_balance ?? 100,
        })
        .select('*')
        .single();

      if (donorErr) throw donorErr;

      setProfile(savedProfile);
      setDonorProfile(savedDonor);
      setDonorForm((current) => ({ ...current, is_active: donorIsActive }));
      showNotice(donorIsActive ? 'Donor profile updated and active.' : 'Donor profile updated. Alerts are paused.');
    } catch (err: any) {
      if (err.message?.toLowerCase().includes('donor_eligibility')) {
        setError('Run supabase/donor_eligibility_migration.sql first, then try saving donor data again.');
      } else {
        setError(err.message || 'Could not save donor profile.');
      }
    } finally {
      setSaving(null);
    }
  };

  const savePatient = async () => {
    if (!userId) return;
    if (!patientForm.full_name.trim()) {
      setError('Patient full name is required.');
      return;
    }

    setSaving('patient');
    setError(null);

    const medicalConditions = patientForm.medical_conditions
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    const payload = {
      profile_id: userId,
      full_name: patientForm.full_name.trim(),
      national_id_hash: patientForm.national_id_hash.trim() || null,
      dob: patientForm.dob || null,
      blood_type: patientForm.blood_type,
      medical_conditions: medicalConditions,
      photo_url: patientProfile?.photo_url || profile?.photo_url || null,
    };

    try {
      const query = patientProfile?.id
        ? supabase.from('patients').update(payload).eq('id', patientProfile.id)
        : supabase.from('patients').insert(payload);

      const { data, error: patientErr } = await query.select('*').single();

      if (patientErr) {
        if (patientErr.message?.toLowerCase().includes('profile_id')) {
          throw new Error('Run supabase/patient_profile_migration.sql first, then try saving patient data again.');
        }
        throw patientErr;
      }

      setPatientProfile(data);
      await supabase
        .from('emergency_contacts')
        .update({ patient_id: data.id })
        .eq('profile_id', userId)
        .is('patient_id', null);
      showNotice('Patient data updated.');
    } catch (err: any) {
      setError(err.message || 'Could not save patient data.');
    } finally {
      setSaving(null);
    }
  };

  const addContact = async () => {
    if (!userId) return;
    if (!contactDraft.name.trim() || !contactDraft.phone.trim()) {
      setError('Emergency contact name and phone are required.');
      return;
    }

    setSaving('contact');
    setError(null);

    try {
      const { data, error: contactErr } = await supabase
        .from('emergency_contacts')
        .insert({
          profile_id: userId,
          patient_id: patientProfile?.id || null,
          name: contactDraft.name.trim(),
          relation: contactDraft.relation.trim() || null,
          phone: contactDraft.phone.trim(),
          is_enabled: true,
        })
        .select('*')
        .single();

      if (contactErr) throw contactErr;

      setContacts((current) => [...current, data]);
      setContactDraft(emptyContact);
      showNotice('Emergency contact added.');
    } catch (err: any) {
      setError(err.message || 'Could not add emergency contact.');
    } finally {
      setSaving(null);
    }
  };

  const updateContact = async (index: number, next: Contact) => {
    setContacts((current) => current.map((contact, i) => (i === index ? next : contact)));

    if (!next.id) return;

    setSaving('contact');
    setError(null);

    const { error: contactErr } = await supabase
      .from('emergency_contacts')
      .update({
        name: next.name.trim(),
        relation: next.relation?.trim() || null,
        phone: next.phone.trim(),
        is_enabled: next.is_enabled ?? true,
      })
      .eq('id', next.id)
      .eq('profile_id', userId);

    if (contactErr) {
      setError(contactErr.message || 'Could not update emergency contact.');
      await fetchProfileData();
    } else {
      showNotice('Emergency contact updated.');
    }

    setSaving(null);
  };

  const removeContact = async (contact: Contact) => {
    if (!contact.id) {
      setContacts((current) => current.filter((item) => item !== contact));
      return;
    }

    setSaving('contact');
    setError(null);

    const { error: deleteErr } = await supabase
      .from('emergency_contacts')
      .delete()
      .eq('id', contact.id)
      .eq('profile_id', userId);

    if (deleteErr) {
      setError(deleteErr.message || 'Could not remove emergency contact.');
    } else {
      setContacts((current) => current.filter((item) => item.id !== contact.id));
      showNotice('Emergency contact removed.');
    }

    setSaving(null);
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.replace('/');
  };

  if (loading) {
    return (
      <div className={styles.screenCenter}>
        <Loader2 size={36} color="var(--donor-primary-bright)" className="animate-spin" />
      </div>
    );
  }

  const initials = donorForm.full_name
    ? donorForm.full_name.split(' ').map((name) => name[0]).join('').slice(0, 2).toUpperCase()
    : 'DL';

  return (
    <div className={styles.screen}>
      <div className={styles.headerBand}>
        <div className={styles.avatarInitials}>{initials}</div>
        <div className={styles.headerCopy}>
          <h1 className={styles.title}>Profile Settings</h1>
          <p className={styles.subtitle}>{email || 'Manage your DamLink account'}</p>
        </div>
      </div>

      <main className={styles.content}>
        {notice && (
          <div className={styles.noticeBox}>
            <CheckCircle2 size={18} />
            <span>{notice}</span>
          </div>
        )}

        {error && (
          <div className={styles.errorBox}>
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <UserRound size={20} />
            <div>
              <h2>Donor Data</h2>
              <p>Edit the data used for donor matching and urgent alerts.</p>
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="donor-name">Full name</label>
            <input
              id="donor-name"
              className={styles.input}
              value={donorForm.full_name}
              onChange={(e) => setDonorForm((current) => ({ ...current, full_name: e.target.value }))}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="donor-phone">Phone number</label>
            <input
              id="donor-phone"
              className={styles.input}
              type="tel"
              value={donorForm.phone}
              onChange={(e) => setDonorForm((current) => ({ ...current, phone: e.target.value }))}
            />
          </div>

          <div className={styles.field}>
            <label>Blood type</label>
            <div className={styles.bloodGrid}>
              {BLOOD_TYPES.map((bloodType) => (
                <button
                  key={bloodType}
                  type="button"
                  className={`${styles.bloodPill} ${donorForm.blood_type === bloodType ? styles.bloodPillActive : ''}`}
                  onClick={() => setDonorForm((current) => ({ ...current, blood_type: bloodType }))}
                >
                  {bloodType}
                </button>
              ))}
            </div>
          </div>

          <div className={`${styles.eligibilityPanel} ${canActivateDonor ? styles.eligibilityOk : styles.eligibilityBlocked}`}>
            <ShieldCheck size={20} />
            <div>
              <strong>{canActivateDonor ? 'Eligible to receive donor alerts' : 'Donor alerts paused until eligible'}</strong>
              <span>{eligibility.reasons[0]}</span>
            </div>
          </div>

          <div className={styles.formRow}>
            <div className={styles.field}>
              <label htmlFor="donor-weight">Weight (kg)</label>
              <input
                id="donor-weight"
                className={styles.input}
                type="number"
                min="1"
                value={eligibilityAnswers.weightKg}
                onChange={(e) => updateEligibility('weightKg', e.target.value)}
                placeholder="70"
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="donor-last-donation">Last donation</label>
              <input
                id="donor-last-donation"
                className={styles.input}
                type="date"
                value={eligibilityAnswers.lastDonationDate}
                onChange={(e) => updateEligibility('lastDonationDate', e.target.value)}
              />
            </div>
          </div>

          <div className={styles.checkGrid}>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={eligibilityAnswers.feelingWell}
                onChange={(e) => updateEligibility('feelingWell', e.target.checked)}
              />
              <span>I feel well today</span>
            </label>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={eligibilityAnswers.takingAntibiotics}
                onChange={(e) => updateEligibility('takingAntibiotics', e.target.checked)}
              />
              <span>Taking antibiotics or have infection</span>
            </label>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={eligibilityAnswers.recentTattooOrPiercing}
                onChange={(e) => updateEligibility('recentTattooOrPiercing', e.target.checked)}
              />
              <span>Recent tattoo or piercing</span>
            </label>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={eligibilityAnswers.pregnantOrBreastfeeding}
                onChange={(e) => updateEligibility('pregnantOrBreastfeeding', e.target.checked)}
              />
              <span>Pregnant or breastfeeding</span>
            </label>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={eligibilityAnswers.highRiskExposure}
                onChange={(e) => updateEligibility('highRiskExposure', e.target.checked)}
              />
              <span>Recent high-risk exposure</span>
            </label>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={eligibilityAnswers.seriousMedicalCondition}
                onChange={(e) => updateEligibility('seriousMedicalCondition', e.target.checked)}
              />
              <span>Serious chronic medical condition</span>
            </label>
          </div>

          <div className={styles.toggleRow}>
            <div>
              <strong>Active donor</strong>
              <span>{canActivateDonor ? 'Receive nearby compatible requests' : 'Complete the safety check first'}</span>
            </div>
            <button
              type="button"
              className={`${styles.toggle} ${donorForm.is_active ? styles.toggleOn : ''}`}
              onClick={() => setDonorForm((current) => ({ ...current, is_active: canActivateDonor ? !current.is_active : false }))}
              aria-pressed={donorForm.is_active}
              disabled={!canActivateDonor}
            >
              <span />
            </button>
          </div>

          <button className={styles.primaryButton} onClick={saveDonor} disabled={saving === 'donor'}>
            {saving === 'donor' ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            Save donor data
          </button>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <ShieldCheck size={20} />
            <div>
              <h2>Patient Data</h2>
              <p>Edit the medical record used when this person is scanned in an emergency.</p>
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="patient-name">Patient full name</label>
            <input
              id="patient-name"
              className={styles.input}
              value={patientForm.full_name}
              onChange={(e) => setPatientForm((current) => ({ ...current, full_name: e.target.value }))}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="patient-national-id">National ID number</label>
            <input
              id="patient-national-id"
              className={styles.input}
              inputMode="numeric"
              value={patientForm.national_id_hash}
              onChange={(e) => setPatientForm((current) => ({ ...current, national_id_hash: e.target.value }))}
              placeholder="14 digits"
            />
          </div>

          <div className={styles.formRow}>
            <div className={styles.field}>
              <label htmlFor="patient-dob">Date of birth</label>
              <input
                id="patient-dob"
                className={styles.input}
                type="date"
                value={patientForm.dob}
                onChange={(e) => setPatientForm((current) => ({ ...current, dob: e.target.value }))}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="patient-blood-type">Blood type</label>
              <select
                id="patient-blood-type"
                className={styles.input}
                value={patientForm.blood_type}
                onChange={(e) => setPatientForm((current) => ({ ...current, blood_type: e.target.value }))}
              >
                {BLOOD_TYPES.map((bloodType) => (
                  <option key={bloodType} value={bloodType}>{bloodType}</option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="patient-medical">Medical conditions</label>
            <textarea
              id="patient-medical"
              className={styles.textarea}
              value={patientForm.medical_conditions}
              onChange={(e) => setPatientForm((current) => ({ ...current, medical_conditions: e.target.value }))}
              placeholder="Diabetes, allergy, medication notes"
            />
          </div>

          <button className={styles.primaryButton} onClick={savePatient} disabled={saving === 'patient'}>
            {saving === 'patient' ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            Save patient data
          </button>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <Phone size={20} />
            <div>
              <h2>Emergency Contacts</h2>
              <p>Add family or trusted contacts who can be notified during emergencies.</p>
            </div>
          </div>

          <div className={styles.contactEditor}>
            <input
              className={styles.input}
              value={contactDraft.name}
              onChange={(e) => setContactDraft((current) => ({ ...current, name: e.target.value }))}
              placeholder="Contact name"
            />
            <input
              className={styles.input}
              value={contactDraft.relation}
              onChange={(e) => setContactDraft((current) => ({ ...current, relation: e.target.value }))}
              placeholder="Relation"
            />
            <input
              className={styles.input}
              type="tel"
              value={contactDraft.phone}
              onChange={(e) => setContactDraft((current) => ({ ...current, phone: e.target.value }))}
              placeholder="+20 10 0000 0000"
            />
            <button className={styles.secondaryButton} type="button" onClick={addContact} disabled={saving === 'contact'}>
              <Plus size={18} />
              Add contact
            </button>
          </div>

          <div className={styles.contactList}>
            {contacts.length === 0 ? (
              <div className={styles.emptyState}>No emergency contacts added yet.</div>
            ) : contacts.map((contact, index) => (
              <div className={styles.contactItem} key={contact.id || index}>
                <div className={styles.field}>
                  <label>Name</label>
                  <input
                    className={styles.input}
                    value={contact.name || ''}
                    onChange={(e) => setContacts((current) => current.map((item, i) => (
                      i === index ? { ...item, name: e.target.value } : item
                    )))}
                    onBlur={() => updateContact(index, contacts[index])}
                  />
                </div>
                <div className={styles.formRow}>
                  <div className={styles.field}>
                    <label>Relation</label>
                    <input
                      className={styles.input}
                      value={contact.relation || ''}
                      onChange={(e) => setContacts((current) => current.map((item, i) => (
                        i === index ? { ...item, relation: e.target.value } : item
                      )))}
                      onBlur={() => updateContact(index, contacts[index])}
                    />
                  </div>
                  <div className={styles.field}>
                    <label>Phone</label>
                    <input
                      className={styles.input}
                      type="tel"
                      value={contact.phone || ''}
                      onChange={(e) => setContacts((current) => current.map((item, i) => (
                        i === index ? { ...item, phone: e.target.value } : item
                      )))}
                      onBlur={() => updateContact(index, contacts[index])}
                    />
                  </div>
                </div>
                <div className={styles.contactActions}>
                  <button
                    type="button"
                    className={`${styles.statusButton} ${contact.is_enabled !== false ? styles.statusButtonOn : ''}`}
                    onClick={() => updateContact(index, { ...contact, is_enabled: !(contact.is_enabled !== false) })}
                  >
                    {contact.is_enabled !== false ? 'Enabled' : 'Disabled'}
                  </button>
                  <button type="button" className={styles.dangerButton} onClick={() => removeContact(contact)}>
                    <Trash2 size={16} />
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.statsStrip}>
          <div>
            <strong>{donorProfile?.donations_count ?? 0}</strong>
            <span>Donations</span>
          </div>
          <div>
            <strong>{donorProfile?.lives_saved_estimate ?? 0}</strong>
            <span>Lives saved</span>
          </div>
          <div>
            <strong>{donorProfile?.reliability_rating ? Number(donorProfile.reliability_rating).toFixed(1) : '5.0'}</strong>
            <span>Rating</span>
          </div>
        </section>

        <button className={styles.signOutButton} onClick={handleSignOut} disabled={signingOut}>
          <LogOut size={20} />
          <span>{signingOut ? 'Signing out...' : 'Sign out'}</span>
        </button>
      </main>
    </div>
  );
}
