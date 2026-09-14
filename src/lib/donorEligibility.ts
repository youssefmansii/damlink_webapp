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
  const weight = Number(answers.weightKg);

  if (age === null) {
    reasons.push('Date of birth is required for donor activation.');
  } else if (age < 18 || age > 60) {
    reasons.push('Donor age should be between 18 and 60 years.');
  }

  if (!answers.weightKg || Number.isNaN(weight)) {
    reasons.push('Weight is required for donor activation.');
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
    if (days !== null && days >= 0 && days < 56) {
      reasons.push('Whole blood donation should usually be at least 56 days apart.');
    }
  }

  if (reasons.length > 0) {
    return { status: 'deferred', reasons };
  }

  return { status: 'eligible', reasons: ['Eligible for alerts. Final donation screening is still done at the hospital.'] };
};
