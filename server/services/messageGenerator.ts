import { GoogleGenAI } from '@google/genai';
import {
  CompanySummary,
  DiscoveryCriteria,
  MessageQualityReport,
  Prospect,
  SenderProfile,
} from '../../src/types/prospectiq.js';
import { getServerConfig } from '../config.js';

const SPAM_CLICHES = [
  'hope this finds you well',
  'pick your brain',
  'synergy',
  'touch base',
  'circling back',
  'revolutionary',
  'game-changer',
  'guaranteed roi',
  '10x your',
  'buy now',
  'limited time offer',
  'act fast',
  'just checking in',
];

export function cleanEntities(text: string): string {
  return String(text || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s*\(Review\s*&\s*edit[^)]*\)/gi, '')
    .replace(/\s*\(Editable\)/gi, '')
    .replace(/\s*\(Extracted from[^)]*\)/gi, '')
    .trim();
}

export function cleanTopicForOutreach(rawProduct: string, companyName: string): string {
  const cleaned = cleanEntities(rawProduct);
  if (
    !cleaned ||
    /core platform & solutions/i.test(cleaned) ||
    /public website/i.test(cleaned) ||
    cleaned.length > 55
  ) {
    return 'Enterprise AI & Digital Transformation';
  }
  // Avoid repeating companyName twice if rawProduct already starts with companyName
  if (cleaned.toLowerCase().startsWith(companyName.toLowerCase() + ' ')) {
    const withoutPrefix = cleaned.slice(companyName.length).trim();
    if (withoutPrefix.length > 4) return withoutPrefix;
  }
  return cleaned;
}

export function cleanSignalForOutreach(rawSignal: string, companyName: string): string {
  const cleaned = cleanEntities(rawSignal);
  if (
    !cleaned ||
    /public website positioning/i.test(cleaned) ||
    /official home page/i.test(cleaned) ||
    cleaned.length > 85
  ) {
    return `${companyName}'s enterprise platform and digital transformation initiatives`;
  }
  return cleaned;
}

export function evaluateMessageQuality(
  connectionDraft: string,
  emailBody: string,
  company: CompanySummary
): MessageQualityReport {
  const charCount = connectionDraft.length;
  const isWithinLimit = charCount > 0 && charCount <= 300;
  const combinedLower = `${connectionDraft} ${emailBody}`.toLowerCase();

  const spamWordsFound = SPAM_CLICHES.filter((phrase) => combinedLower.includes(phrase));

  const signalKeywords = company.buyingSignals
    .flatMap((s) => s.headline.toLowerCase().split(/\s+/))
    .filter((w) => w.length > 4);
  const productKeywords = company.productsAndServices
    .flatMap((p) => p.toLowerCase().split(/\s+/))
    .filter((w) => w.length > 4);

  const usesVerifiedSignal = [...signalKeywords, ...productKeywords].some((kw) => combinedLower.includes(kw));

  let qualityScore = 88;
  if (isWithinLimit) qualityScore += 5;
  else qualityScore -= 18;

  if (usesVerifiedSignal) qualityScore += 5;
  qualityScore -= spamWordsFound.length * 12;
  qualityScore = Math.max(20, Math.min(99, qualityScore));

  return {
    charCount,
    isWithinLimit,
    qualityScore,
    spamWordsFound,
    usesVerifiedSignal,
  };
}

export function generateDeterministicOutreach(params: {
  prospectName: string;
  jobTitle: string;
  company: CompanySummary;
  criteria: DiscoveryCriteria;
  sender: SenderProfile;
  tone?: 'executive' | 'consultative' | 'mba';
}): { emailSubject: string; emailBody: string; connectionDraft: string; qualityReport: MessageQualityReport } {
  const { prospectName, jobTitle, company, criteria, sender, tone = 'executive' } = params;
  const firstName = prospectName.split(/\s+/)[0] || prospectName;
  const companyName = cleanEntities(company.companyName);
  const topProduct = cleanTopicForOutreach(
    company.productsAndServices[0] || company.industry,
    companyName
  );
  const topSignal = cleanSignalForOutreach(
    company.buyingSignals[0]?.headline || '',
    companyName
  );
  const objective = cleanEntities(criteria.connectionObjective);

  let emailSubject = '';
  let emailBody = '';
  let connectionDraft = '';

  if (tone === 'mba') {
    emailSubject = `Executive Research Brief: ${companyName} — ${topProduct}`;
    emailBody = `Dear ${firstName},\n\nAs part of our B2B strategy and market research on ${companyName}’s focus around ${topProduct} and ${topSignal}, I have been examining how enterprise teams scale adoption across ${cleanEntities(company.industry)}.\n\nGiven your leadership as ${jobTitle} at ${companyName}, I would be honored to share our concise research brief and gain your perspective aligned with our objective: ${objective}\n\nWarm regards,\n${sender.senderName}\n${sender.senderTitle} · ${sender.senderCompany}`;
    connectionDraft = `Hi ${firstName} — conducting strategy research on ${companyName}’s focus on ${topProduct}. Given your role as ${jobTitle}, I’d value sharing our concise research brief and hearing your perspective.`;
  } else if (tone === 'consultative') {
    emailSubject = `Perspective for ${companyName}: Scaling ${topProduct}`;
    emailBody = `Hi ${firstName},\n\nWith ${companyName} advancing ${topProduct} (${topSignal}), many leaders in ${cleanEntities(company.industry)} are evaluating how to accelerate execution without adding operational complexity.\n\nAt ${sender.senderCompany}, we help teams with ${sender.offeringSummary} Given your mandate as ${jobTitle}, I put together a tailored 3-point framework on how this aligns with ${companyName}.\n\nOpen to a brief exchange?\n\nBest,\n${sender.senderName}\n${sender.senderTitle}, ${sender.senderCompany}`;
    connectionDraft = `Hi ${firstName} — closely following ${companyName}’s initiatives around ${topProduct}. As ${jobTitle}, I’d love to share a concise framework on how ${sender.senderCompany} supports ${objective.slice(0, 75)}.`;
  } else {
    emailSubject = `${companyName} × ${sender.senderCompany} · Strategic alignment (${jobTitle})`;
    emailBody = `Hi ${firstName},\n\nI’ve been following ${companyName}’s momentum around ${topProduct} and ${topSignal}.\n\nAt ${sender.senderCompany}, we focus on ${sender.offeringSummary} Given your role as ${jobTitle}, I’d welcome sharing a brief executive overview aligned with: ${objective}\n\nBest regards,\n${sender.senderName}\n${sender.senderTitle}, ${sender.senderCompany}`;
    connectionDraft = `Hi ${firstName} — following ${companyName}’s momentum in ${topProduct}. Given your work as ${jobTitle}, I’d value sharing our executive brief on ${objective.slice(0, 85)}.`;
  }

  if (connectionDraft.length > 295) {
    connectionDraft = `${connectionDraft.slice(0, 292)}...`;
  }

  const qualityReport = evaluateMessageQuality(connectionDraft, emailBody, company);
  return { emailSubject, emailBody, connectionDraft, qualityReport };
}

export async function generateAiOutreachForProspect(params: {
  prospect: Prospect;
  company: CompanySummary;
  criteria: DiscoveryCriteria;
  sender: SenderProfile;
  tone?: 'executive' | 'consultative' | 'mba';
}): Promise<{ emailSubject: string; emailBody: string; connectionDraft: string; qualityReport: MessageQualityReport }> {
  const cfg = getServerConfig();
  const fallback = generateDeterministicOutreach({
    prospectName: params.prospect.fullName,
    jobTitle: params.prospect.jobTitle,
    company: params.company,
    criteria: params.criteria,
    sender: params.sender,
    tone: params.tone,
  });

  if (!cfg.geminiApiKey) {
    return fallback;
  }

  try {
    const ai = new GoogleGenAI({ apiKey: cfg.geminiApiKey });
    const prompt = `You are an elite B2B executive outreach strategist. Generate a personalized email and a concise <=280 character intro note for the following verified prospect.
STRICT RULES:
- Use ONLY verified facts below. Never invent shared hobbies, fake posts read, or unverified claims.
- Avoid clichés like "hope this finds you well", "pick your brain", "synergy", "touch base".
- connectionDraft MUST be under 285 characters.

PROSPECT:
- Name: ${params.prospect.fullName}
- Title: ${params.prospect.jobTitle} (${params.prospect.buyingRole})
- Company: ${params.company.companyName} (${params.company.industry})
- Verified Products: ${params.company.productsAndServices.join(', ')}
- Verified Buying Signals: ${params.company.buyingSignals.map((s) => s.headline).join(' | ')}

SENDER & OBJECTIVE:
- Sender: ${params.sender.senderName}, ${params.sender.senderTitle} at ${params.sender.senderCompany}
- Sender Offering: ${params.sender.offeringSummary}
- Stated Objective: ${params.criteria.connectionObjective}
- Requested Tone: ${params.tone || 'executive'}

Return ONLY valid JSON with keys:
{
  "emailSubject": "concise executive subject line",
  "emailBody": "3-short-paragraph professional outreach email",
  "connectionDraft": "concise <=280 char note"
}`;

    const interaction = await ai.interactions.create({
      model: 'gemini-3.8-flash',
      input: prompt,
    });

    const text = interaction.output_text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return fallback;
    const parsed = JSON.parse(jsonMatch[0]);
    const emailSubject = String(parsed.emailSubject || fallback.emailSubject).trim();
    const emailBody = String(parsed.emailBody || fallback.emailBody).trim();
    let connectionDraft = String(parsed.connectionDraft || fallback.connectionDraft).trim();
    if (connectionDraft.length > 298) {
      connectionDraft = `${connectionDraft.slice(0, 295)}...`;
    }
    const qualityReport = evaluateMessageQuality(connectionDraft, emailBody, params.company);
    return { emailSubject, emailBody, connectionDraft, qualityReport };
  } catch {
    return fallback;
  }
}
