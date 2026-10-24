import {
  CompanySummary,
  DiscoveryCriteria,
  ScoreBreakdown,
  SeniorityLevel,
  BuyingRole,
} from '../../src/types/prospectiq.js';

export function inferSeniorityLevel(jobTitle: string): SeniorityLevel {
  const t = jobTitle.toLowerCase();
  if (
    /\b(chief|ceo|cto|cfo|ciso|coo|cro|cmo|cpo|president|founder|co-founder|cvp|evp|managing director|partner)\b/.test(
      t
    )
  ) {
    return 'C-Suite';
  }
  if (/\b(vp|vice president|head of|general manager|gm|senior security executive)\b/.test(t)) {
    return 'VP';
  }
  if (/\b(director|principal|distinguished)\b/.test(t)) {
    return 'Director';
  }
  if (/\b(manager|lead|supervisor)\b/.test(t)) {
    return 'Manager';
  }
  return 'Individual Contributor';
}

export function inferBuyingRole(jobTitle: string, seniority: SeniorityLevel): BuyingRole {
  const t = jobTitle.toLowerCase();
  if (seniority === 'C-Suite') {
    return /security|ciso|partner|product/.test(t) ? 'Executive Sponsor' : 'Decision Maker';
  }
  if (seniority === 'VP') {
    return /engineering|technology|architect|data|ai/.test(t) ? 'Decision Maker' : 'Executive Sponsor';
  }
  if (seniority === 'Director') {
    return /engineering|cloud|platform|security|product/.test(t)
      ? 'Technical Champion'
      : 'Operational Champion';
  }
  return 'Evaluator';
}

export function calculateProspectScore(params: {
  jobTitle: string;
  seniority: SeniorityLevel;
  company: CompanySummary;
  criteria: DiscoveryCriteria;
  hasVerifiedLinkedin: boolean;
  hasVerifiedEmail: boolean;
  sourcesCount: number;
}): ScoreBreakdown {
  const { jobTitle, seniority, company, criteria, hasVerifiedLinkedin, hasVerifiedEmail, sourcesCount } = params;
  const titleLower = jobTitle.toLowerCase();

  // 1. Job-Title Relevance (0 - 35 points)
  let titleRelevance = 18;
  let matchedTarget = '';
  for (const target of criteria.targetJobTitles) {
    const cleanTarget = target.toLowerCase().trim();
    if (!cleanTarget) continue;
    if (titleLower === cleanTarget || titleLower.includes(cleanTarget) || cleanTarget.includes(titleLower)) {
      titleRelevance = 35;
      matchedTarget = target;
      break;
    }
    const targetWords = cleanTarget.split(/\s+/).filter((w) => w.length > 2 && !['and', 'the', 'for'].includes(w));
    const hits = targetWords.filter((w) => titleLower.includes(w));
    if (hits.length >= 2 && titleRelevance < 32) {
      titleRelevance = 32;
      matchedTarget = target;
    } else if (hits.length === 1 && titleRelevance < 26) {
      titleRelevance = 26;
      matchedTarget = target;
    }
  }

  const titleReason = matchedTarget
    ? `Strong alignment with target role "${matchedTarget}" (${titleRelevance}/35).`
    : `Functional leadership role "${jobTitle}" adjacent to target titles (${titleRelevance}/35).`;

  // 2. Seniority Fit (0 - 25 points)
  let seniorityFit = 15;
  if (criteria.seniorityLevels.includes(seniority)) {
    seniorityFit = seniority === 'C-Suite' ? 25 : seniority === 'VP' ? 24 : seniority === 'Director' ? 22 : 20;
  } else if (seniority === 'C-Suite' || seniority === 'VP') {
    seniorityFit = 21;
  }
  const seniorityReason = criteria.seniorityLevels.includes(seniority)
    ? `${seniority} tier matches requested decision-maker seniority (${seniorityFit}/25).`
    : `${seniority} tier provides departmental influence (${seniorityFit}/25).`;

  // 3. Industry & Company Fit (0 - 20 points)
  const indLower = company.industry.toLowerCase();
  const targetIndLower = (criteria.targetIndustry || '').toLowerCase();
  let industryFit = 16;
  if (!targetIndLower || indLower.includes(targetIndLower) || targetIndLower.includes(indLower)) {
    industryFit = 19;
  } else {
    const indTokens = targetIndLower.split(/[\s,&]+/).filter((w) => w.length > 2);
    const matchedTokens = indTokens.filter((w) => indLower.includes(w));
    if (matchedTokens.length > 0) industryFit = 18;
  }
  const industryReason = `${company.companyName} operates in ${company.industry}, matching target sector criteria (${industryFit}/20).`;

  // 4. Objective Alignment & Source Verification (0 - 20 points)
  let objectiveAlignment = 11;
  if (hasVerifiedLinkedin) objectiveAlignment += 4;
  if (hasVerifiedEmail) objectiveAlignment += 3;
  if (sourcesCount >= 2) objectiveAlignment += 2;
  objectiveAlignment = Math.min(20, objectiveAlignment);

  const verificationParts: string[] = [];
  if (hasVerifiedLinkedin) verificationParts.push('public LinkedIn URL verified');
  if (hasVerifiedEmail) verificationParts.push('work email verified');
  if (verificationParts.length === 0) verificationParts.push('partial public source verification');

  const objectiveReason = `Aligned with objective "${criteria.connectionObjective.slice(0, 65)}..." (${verificationParts.join(
    ', '
  )}) (${objectiveAlignment}/20).`;

  const totalScore = Math.min(100, titleRelevance + seniorityFit + industryFit + objectiveAlignment);

  return {
    totalScore,
    titleRelevance,
    seniorityFit,
    industryFit,
    objectiveAlignment,
    reasons: {
      titleReason,
      seniorityReason,
      industryReason,
      objectiveReason,
    },
  };
}
