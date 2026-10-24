export type DonorEligibilityAnswers = {
  weightKg: string;
  lastDonationDate: string;
  feelingWell: boolean;
  takingAntibiotics: boolean;
  recentTattooOrPiercing: boolean;
  pregnantOrBreastfeeding: boolean;
  highRiskExposure: boolean;
  seriousMedicalCondition: boolean;
};

export type DonorEligibilityResult = {
  status: 'eligible' | 'deferred' | 'needs_review';
  reasons: string[];
};

export const defaultDonorEligibilityAnswers: DonorEligibilityAnswers = {
  weightKg: '',
  lastDonationDate: '',
  feelingWell: true,
  takingAntibiotics: false,
  recentTattooOrPiercing: false,
  pregnantOrBreastfeeding: false,
  highRiskExposure: false,
  seriousMedicalCondition: false,
};

// Minimum gap between whole-blood donations. Keep in sync with the donor pages and the match-donors
// Edge Function (MIN_DAYS_BETWEEN_DONATIONS). Confirm the exact number with the Egyptian blood bank rules.
export const MIN_DAYS_BETWEEN_DONATIONS = 90;

/** Accepts "70", "70.5", "70 kg", "70kg", "70,5". Returns null if it is not a plain weight. */
export const parseWeightKg = (raw: string): number | null => {
  const m = /^\s*(\d{1,3}(?:[.,]\d+)?)\s*(?:kg|kgs|kilos?|كجم)?\s*$/i.exec(raw ?? '');
  return m ? Number(m[1].replace(',', '.')) : null;
};

const daysBetween = (date: string) => {
  const value = new Date(date).getTime();
  if (Number.isNaN(value)) return null;
  return Math.floor((Date.now() - value) / (1000 * 60 * 60 * 24));
};

export const calculateAge = (dob: string) => {
  const value = new Date(dob).getTime();
  if (!dob || Number.isNaN(value)) return null;
  return Math.floor((Date.now() - value) / (1000 * 60 * 60 * 24 * 365.25));
};

export const evaluateDonorEligibility = (
  answers: DonorEligibilityAnswers,
  dob: string,
): DonorEligibilityResult => {
  const reasons: string[] = [];
  const age = calculateAge(dob);
  const weight = parseWeightKg(answers.weightKg);

  if (age === null) {
    reasons.push('Date of birth is required for donor activation.');
  } else if (age < 18 || age > 60) {
    reasons.push('Donor age should be between 18 and 60 years.');
  }

  if (!answers.weightKg || !answers.weightKg.trim()) {
    reasons.push('Weight is required for donor activation.');
  } else if (weight === null) {
    reasons.push('Enter your weight as a number in kg, for example 70.');
  } else if (weight < 50) {
    reasons.push('Weight must be at least 50 kg.');
  }

  if (!answers.feelingWell) {
    reasons.push('Donor should be feeling well today.');
  }

  if (answers.takingAntibiotics) {
    reasons.push('Recent antibiotics or active infection needs deferral.');
  }

  if (answers.recentTattooOrPiercing) {
    reasons.push('Recent tattoo or piercing needs temporary deferral.');
  }

  if (answers.pregnantOrBreastfeeding) {
    reasons.push('Pregnancy or breastfeeding needs medical review before donation.');
  }

  if (answers.highRiskExposure) {
    reasons.push('Recent high-risk exposure needs blood bank review.');
  }

  if (answers.seriousMedicalCondition) {
    reasons.push('Serious medical conditions need hospital review before donation.');
  }

  if (answers.lastDonationDate) {
    const days = daysBetween(answers.lastDonationDate);
    if (days !== null && days < -1) {
      reasons.push('The last donation date is in the future. Please check the date.');
    } else if (days !== null && days >= -1 && days < MIN_DAYS_BETWEEN_DONATIONS) {
      reasons.push(`Whole blood donation should usually be at least ${MIN_DAYS_BETWEEN_DONATIONS} days apart.`);
    }
  }

  if (reasons.length > 0) {
    return { status: 'deferred', reasons };
  }

  return { status: 'eligible', reasons: ['Eligible for alerts. Final donation screening is still done at the hospital.'] };
};
