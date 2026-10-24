import React, { useState, useEffect } from 'react';
import {
  X,
  ExternalLink,
  Copy,
  Check,
  Send,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  Award,
  Link2,
  FileText,
  MessageSquare,
} from 'lucide-react';
import { OutreachStatus, Prospect, ResearchProject, SenderProfile } from '../types/prospectiq';

interface ProspectDetailDrawerProps {
  project: ResearchProject;
  prospect: Prospect | null;
  senderProfile: SenderProfile;
  onClose: () => void;
  onSaveProspectEdits: (prospectId: string, updates: Partial<Prospect>) => Promise<void>;
  onRegenerateOutreach: (
    prospectId: string,
    tone: 'executive' | 'consultative' | 'mba'
  ) => Promise<void>;
  onSendViaBrevo: (prospectIds: string[], draftMode: 'email' | 'concise') => Promise<void>;
  isSendingBrevo: boolean;
}

function cleanEntities(text: string): string {
  return String(text || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s*\(Review\s*&\s*edit[^)]*\)/gi, '')
    .replace(/\s*\(Editable\)/gi, '')
    .replace(/\s*\(Extracted from[^)]*\)/gi, '')
    .trim();
}

function cleanTopicForOutreach(rawProduct: string, companyName: string): string {
  const cleaned = cleanEntities(rawProduct);
  if (
    !cleaned ||
    /core platform & solutions/i.test(cleaned) ||
    /public website/i.test(cleaned) ||
    cleaned.length > 55
  ) {
    return 'Enterprise AI & Digital Transformation';
  }
  if (cleaned.toLowerCase().startsWith(companyName.toLowerCase() + ' ')) {
    const withoutPrefix = cleaned.slice(companyName.length).trim();
    if (withoutPrefix.length > 4) return withoutPrefix;
  }
  return cleaned;
}

function cleanSignalForOutreach(rawSignal: string, companyName: string): string {
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

function buildToneDrafts(
  prospect: Prospect,
  project: ResearchProject,
  sender: SenderProfile,
  tone: 'executive' | 'consultative' | 'mba'
): { emailSubject: string; emailBody: string; connectionDraft: string } {
  const firstName = prospect.fullName.split(/\s+/)[0] || prospect.fullName;
  const companyName = cleanEntities(project.company.companyName);
  const topProduct = cleanTopicForOutreach(
    project.company.productsAndServices[0] || project.company.industry,
    companyName
  );
  const topSignal = cleanSignalForOutreach(
    project.company.buyingSignals[0]?.headline || '',
    companyName
  );
  const objective = cleanEntities(project.criteria.connectionObjective);
  const cleanIndustry = cleanEntities(project.company.industry);

  if (tone === 'mba') {
    const emailSubject = `Executive Research Brief: ${companyName} — ${topProduct}`;
    const emailBody = `Dear ${firstName},\n\nAs part of our B2B strategy and market research on ${companyName}’s focus around ${topProduct} and ${topSignal}, I have been examining how enterprise teams scale adoption across ${cleanIndustry}.\n\nGiven your leadership as ${prospect.jobTitle} at ${companyName}, I would be honored to share our concise research brief and gain your perspective aligned with our objective: ${objective}\n\nWarm regards,\n${sender.senderName}\n${sender.senderTitle} · ${sender.senderCompany}`;
    let connectionDraft = `Hi ${firstName} — conducting strategy research on ${companyName}’s focus on ${topProduct}. Given your role as ${prospect.jobTitle}, I’d value sharing our concise research brief and hearing your perspective.`;
    if (connectionDraft.length > 295) connectionDraft = `${connectionDraft.slice(0, 292)}...`;
    return { emailSubject, emailBody, connectionDraft };
  }

  if (tone === 'consultative') {
    const emailSubject = `Perspective for ${companyName}: Scaling ${topProduct}`;
    const emailBody = `Hi ${firstName},\n\nWith ${companyName} advancing ${topProduct} (${topSignal}), many ${prospect.buyingRole.toLowerCase()}s are evaluating how to accelerate execution without adding operational complexity.\n\nAt ${sender.senderCompany}, we help teams with ${sender.offeringSummary} Given your mandate as ${prospect.jobTitle}, I put together a tailored 3-point framework on how this aligns with ${companyName}.\n\nOpen to a brief exchange?\n\nBest,\n${sender.senderName}\n${sender.senderTitle}, ${sender.senderCompany}`;
    let connectionDraft = `Hi ${firstName} — closely following ${companyName}’s initiatives around ${topProduct}. As ${prospect.jobTitle}, I’d love to share a concise framework on how ${sender.senderCompany} supports ${objective.slice(0, 75)}.`;
    if (connectionDraft.length > 295) connectionDraft = `${connectionDraft.slice(0, 292)}...`;
    return { emailSubject, emailBody, connectionDraft };
  }

  // Default: 'executive'
  const emailSubject = `${companyName} × ${sender.senderCompany} · Strategic alignment (${prospect.jobTitle})`;
  const emailBody = `Hi ${firstName},\n\nI’ve been following ${companyName}’s momentum around ${topProduct} and ${topSignal}.\n\nAt ${sender.senderCompany}, we focus on ${sender.offeringSummary} Given your role as ${prospect.jobTitle}, I’d welcome sharing a brief executive overview aligned with: ${objective}\n\nBest regards,\n${sender.senderName}\n${sender.senderTitle}, ${sender.senderCompany}`;
  let connectionDraft = `Hi ${firstName} — following ${companyName}’s momentum in ${topProduct}. Given your work as ${prospect.jobTitle}, I’d value sharing our executive brief on ${objective.slice(0, 85)}.`;
  if (connectionDraft.length > 295) connectionDraft = `${connectionDraft.slice(0, 292)}...`;
  return { emailSubject, emailBody, connectionDraft };
}

export const ProspectDetailDrawer: React.FC<ProspectDetailDrawerProps> = ({
  project,
  prospect,
  senderProfile,
  onClose,
  onSaveProspectEdits,
  onRegenerateOutreach,
  onSendViaBrevo,
  isSendingBrevo,
}) => {
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [connectionDraft, setConnectionDraft] = useState('');
  const [status, setStatus] = useState<OutreachStatus>('Draft Ready');
  const [tone, setTone] = useState<'executive' | 'consultative' | 'mba'>('executive');
  const [selectedDraftMode, setSelectedDraftMode] = useState<'email' | 'concise'>('email');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (prospect) {
      setEmailSubject(cleanEntities(prospect.emailSubject));
      setEmailBody(cleanEntities(prospect.emailBody));
      setConnectionDraft(cleanEntities(prospect.connectionDraft));
      setStatus(prospect.outreachStatus);
    }
  }, [prospect]);

  if (!prospect) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSaveProspectEdits(prospect.id, {
        emailSubject,
        emailBody,
        connectionDraft,
        outreachStatus: status,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToneSwitch = async (selectedTone: 'executive' | 'consultative' | 'mba') => {
    setTone(selectedTone);
    const instant = buildToneDrafts(prospect, project, senderProfile, selectedTone);
    setEmailSubject(instant.emailSubject);
    setEmailBody(instant.emailBody);
    setConnectionDraft(instant.connectionDraft);

    setIsRegenerating(true);
    try {
      await onSaveProspectEdits(prospect.id, {
        emailSubject: instant.emailSubject,
        emailBody: instant.emailBody,
        connectionDraft: instant.connectionDraft,
      });
      await onRegenerateOutreach(prospect.id, selectedTone);
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleCopySelected = () => {
    const text =
      selectedDraftMode === 'email'
        ? `Subject: ${emailSubject}\n\n${emailBody}`
        : connectionDraft;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const charCount = connectionDraft.length;
  const overLimit = charCount > 300;

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <aside
        aria-label={`Prospect details for ${prospect.fullName}`}
        className="sheet"
      >
        {/* Drawer Header */}
        <div className="sheet-header">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
                {prospect.fullName}
              </h2>
              <span className="badge badge-accent font-medium">
                {prospect.buyingRole}
              </span>
            </div>
            <p className="text-muted mt-1 text-xs">
              {prospect.jobTitle} · <span className="font-medium" style={{ color: 'var(--text)' }}>{prospect.companyName}</span>
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-subtle">{prospect.location}</span>
              {!prospect.locationVerified && (
                <span className="badge badge-warning text-[11px]">
                  <AlertTriangle className="h-3 w-3" />
                  Location Unverified
                </span>
              )}
              {prospect.linkedinUrl && (
                <a
                  href={prospect.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link text-xs"
                >
                  Public profile
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-sm btn-icon"
            aria-label="Close details"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="sheet-body">
          {/* 100-Point Transparent Scoring Breakdown */}
          <div className="card">
            <div className="card-header">
              <div className="flex items-center gap-2">
                <Award className="h-4 w-4" style={{ color: 'var(--accent)' }} />
                <h3 className="card-title text-xs uppercase tracking-wider">
                  Relevance Score Breakdown
                </h3>
              </div>
              <span className="score font-mono-tabular text-sm font-semibold">
                {prospect.score.totalScore} <span className="text-subtle text-xs font-normal">/ 100</span>
              </span>
            </div>

            <div className="card-body space-y-3.5 text-xs">
              <div>
                <div className="flex justify-between font-medium">
                  <span style={{ color: 'var(--text)' }}>1. Title relevance</span>
                  <span className="mono text-subtle">{prospect.score.titleRelevance} / 35 pts</span>
                </div>
                <div className="bar mt-1.5">
                  <span style={{ width: `${(prospect.score.titleRelevance / 35) * 100}%` }} />
                </div>
                <p className="text-subtle mt-1 text-[11.5px]">{prospect.score.reasons.titleReason}</p>
              </div>

              <div>
                <div className="flex justify-between font-medium">
                  <span style={{ color: 'var(--text)' }}>2. Seniority &amp; decision authority</span>
                  <span className="mono text-subtle">{prospect.score.seniorityFit} / 25 pts</span>
                </div>
                <div className="bar mt-1.5">
                  <span
                    style={{
                      width: `${(prospect.score.seniorityFit / 25) * 100}%`,
                      background: 'var(--success)',
                    }}
                  />
                </div>
                <p className="text-subtle mt-1 text-[11.5px]">{prospect.score.reasons.seniorityReason}</p>
              </div>

              <div>
                <div className="flex justify-between font-medium">
                  <span style={{ color: 'var(--text)' }}>3. Industry &amp; company alignment</span>
                  <span className="mono text-subtle">{prospect.score.industryFit} / 20 pts</span>
                </div>
                <div className="bar mt-1.5">
                  <span
                    style={{
                      width: `${(prospect.score.industryFit / 20) * 100}%`,
                      background: 'var(--accent)',
                    }}
                  />
                </div>
                <p className="text-subtle mt-1 text-[11.5px]">{prospect.score.reasons.industryReason}</p>
              </div>

              <div>
                <div className="flex justify-between font-medium">
                  <span style={{ color: 'var(--text)' }}>4. Objective alignment &amp; verification</span>
                  <span className="mono text-subtle">{prospect.score.objectiveAlignment} / 20 pts</span>
                </div>
                <div className="bar mt-1.5">
                  <span
                    style={{
                      width: `${(prospect.score.objectiveAlignment / 20) * 100}%`,
                      background: 'var(--warning)',
                    }}
                  />
                </div>
                <p className="text-subtle mt-1 text-[11.5px]">{prospect.score.reasons.objectiveReason}</p>
              </div>
            </div>
          </div>

          {/* Personalized Outreach Composer */}
          <div className="card">
            <div className="card-header">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" style={{ color: 'var(--accent)' }} />
                <h3 className="card-title text-xs uppercase tracking-wider">
                  Outreach Composer
                </h3>
              </div>
              {/* Tone Switcher */}
              <div className="segmented">
                {(['executive', 'consultative', 'mba'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    disabled={isRegenerating}
                    aria-pressed={tone === t}
                    onClick={() => handleToneSwitch(t)}
                  >
                    {t === 'mba' ? 'MBA / Research' : t === 'consultative' ? 'Consultative' : 'Executive'}
                  </button>
                ))}
              </div>
            </div>

            <div className="card-body space-y-3.5">
              {/* Format Segmented Selector */}
              <div className="segmented segmented-block">
                <button
                  type="button"
                  aria-pressed={selectedDraftMode === 'email'}
                  onClick={() => setSelectedDraftMode('email')}
                >
                  <FileText className="inline-block h-3.5 w-3.5 mr-1.5 align-text-bottom" />
                  Full Email
                </button>
                <button
                  type="button"
                  aria-pressed={selectedDraftMode === 'concise'}
                  onClick={() => setSelectedDraftMode('concise')}
                >
                  <MessageSquare className="inline-block h-3.5 w-3.5 mr-1.5 align-text-bottom" />
                  Concise Note (≤300 chars)
                </button>
              </div>

              {/* Quality Banner */}
              <div className="callout callout-success text-xs">
                <ShieldCheck className="h-4 w-4" />
                <div className="flex-1 flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Quality grade: <strong>{prospect.qualityReport.qualityScore}/100</strong>
                  </span>
                  <span className="text-subtle text-[11.5px]">
                    {prospect.qualityReport.spamWordsFound.length === 0
                      ? 'Zero spam phrases detected'
                      : `Avoid: ${prospect.qualityReport.spamWordsFound.join(', ')}`}
                  </span>
                </div>
              </div>

              {/* Subject */}
              <div className="field">
                <label className="label">Subject line</label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="input font-mono-tabular"
                />
              </div>

              {/* Body */}
              {selectedDraftMode === 'email' ? (
                <div className="field">
                  <div className="flex items-center justify-between">
                    <label className="label">Outreach email body</label>
                    <span className="text-subtle text-[11.5px]">Full personalized draft</span>
                  </div>
                  <textarea
                    rows={6}
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    className="textarea"
                  />
                </div>
              ) : (
                <div className="field">
                  <div className="flex items-center justify-between">
                    <label className="label">Concise direct note</label>
                    <span
                      className={`mono text-[11.5px] font-semibold ${
                        overLimit ? 'text-danger' : 'text-success'
                      }`}
                    >
                      {charCount} / 300 chars
                    </span>
                  </div>
                  <textarea
                    rows={4}
                    value={connectionDraft}
                    onChange={(e) => setConnectionDraft(e.target.value)}
                    className="textarea"
                  />
                </div>
              )}

              {/* Status and Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-2">
                  <label className="text-subtle text-xs">Status:</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as OutreachStatus)}
                    className="select select-sm w-auto"
                  >
                    <option value="Researched">Researched</option>
                    <option value="Draft Ready">Draft Ready</option>
                    <option value="Sent via Brevo">Sent via Brevo</option>
                    <option value="Accepted">Accepted</option>
                    <option value="Follow-up Needed">Follow-up Needed</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopySelected}
                    className="btn btn-secondary btn-sm"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5" style={{ color: 'var(--success)' }} />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Copy text
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleSave}
                    className="btn btn-secondary btn-sm"
                  >
                    {isSaving ? 'Saving…' : 'Save draft'}
                  </button>
                </div>
              </div>
            </div>

            <div className="card-footer">
              <button
                type="button"
                disabled={isSendingBrevo}
                onClick={async () => {
                  await handleSave();
                  await onSendViaBrevo([prospect.id], selectedDraftMode);
                }}
                className="btn btn-primary btn-block"
              >
                <Send className="h-3.5 w-3.5" />
                {isSendingBrevo
                  ? 'Dispatching via Brevo…'
                  : `Send ${selectedDraftMode === 'email' ? 'full email' : 'concise note'} to ${prospect.fullName}`}
              </button>
            </div>
          </div>

          {/* Supporting Sources Audit Trail */}
          <div className="card">
            <div className="card-header">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4" style={{ color: 'var(--text-3)' }} />
                <h3 className="card-title text-xs uppercase tracking-wider">
                  Verification Sources ({prospect.sources.length})
                </h3>
              </div>
            </div>
            <div className="card-body space-y-2">
              {prospect.sources.map((src, idx) => (
                <div
                  key={idx}
                  className="rounded-md border p-2.5 text-xs"
                  style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium" style={{ color: 'var(--accent)' }}>[{src.provider}]</span>
                    <span className="mono text-subtle text-[11px]">
                      {src.verifiedAt}
                    </span>
                  </div>
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link mt-1 text-xs font-medium"
                  >
                    {src.title}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  {src.snippet && <p className="text-subtle mt-1 text-[11.5px]">{src.snippet}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
