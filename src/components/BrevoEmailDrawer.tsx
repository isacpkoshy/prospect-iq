import React, { useState, useEffect } from 'react';
import {
  Mail,
  X,
  Send,
  ShieldCheck,
  Trash2,
  UserPlus,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Eye,
  EyeOff,
  FileText,
  MessageSquare,
} from 'lucide-react';
import { BrevoEmailStatus, ResearchProject } from '../types/prospectiq';
import { apiClient } from '../services/apiClient';

interface BrevoEmailDrawerProps {
  isOpen: boolean;
  onToggle: (open: boolean) => void;
  emailStatus: BrevoEmailStatus;
  onStatusChange: (status: BrevoEmailStatus) => void;
  activeProject: ResearchProject | null;
  onProjectUpdated: (project: ResearchProject) => void;
  prefillSubscriberEmail?: string;
}

export const BrevoEmailDrawer: React.FC<BrevoEmailDrawerProps> = ({
  isOpen,
  onToggle,
  emailStatus,
  onStatusChange,
  activeProject,
  onProjectUpdated,
  prefillSubscriberEmail,
}) => {
  const [subscriberEmail, setSubscriberEmail] = useState('');
  const [subscriberConsent, setSubscriberConsent] = useState(false);
  const [senderEmail, setSenderEmail] = useState(emailStatus.sender_email || '');
  const [brevoKey, setBrevoKey] = useState('');
  const [senderTouched, setSenderTouched] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string>(emailStatus.message || '');
  const [isError, setIsError] = useState(false);
  const [showDigestPreview, setShowDigestPreview] = useState(false);
  const [digestDraftMode, setDigestDraftMode] = useState<'email' | 'concise'>('email');
  const [selectedPreviewProspectId, setSelectedPreviewProspectId] = useState<string>('');
  const [customSendEmail, setCustomSendEmail] = useState<string>('');

  useEffect(() => {
    if (prefillSubscriberEmail) {
      setSubscriberEmail(prefillSubscriberEmail);
      setSubscriberConsent(true);
    }
  }, [prefillSubscriberEmail]);

  useEffect(() => {
    if (emailStatus.sender_email && !senderTouched) {
      setSenderEmail(emailStatus.sender_email);
    }
    if (emailStatus.message) {
      setFeedback(emailStatus.message);
    }
  }, [emailStatus, senderTouched]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setInterval(async () => {
      try {
        const latest = await apiClient.getEmailStatus();
        onStatusChange(latest);
      } catch {
        // ignore polling error
      }
    }, 10000);
    return () => clearInterval(timer);
  }, [isOpen, onStatusChange]);

  const handleAddSubscriber = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyAction('subscribe');
    setIsError(false);
    try {
      const updated = await apiClient.updateSubscriber(subscriberEmail.trim(), 'add', subscriberConsent);
      onStatusChange(updated);
      setFeedback(`${updated.message} · ${updated.subscribers} subscriber(s)`);
      setSubscriberEmail('');
      setSubscriberConsent(false);
    } catch (err) {
      setIsError(true);
      setFeedback(err instanceof Error ? err.message : 'Could not add subscriber');
    } finally {
      setBusyAction(null);
    }
  };

  const handleRemoveSubscriber = async (e: React.MouseEvent, email: string) => {
    e.preventDefault();
    e.stopPropagation();
    setBusyAction(`remove-${email}`);
    setIsError(false);
    try {
      const updated = await apiClient.updateSubscriber(email, 'remove', false);
      onStatusChange(updated);
      setFeedback(`Removed ${email} · ${updated.subscribers} subscriber(s) remaining`);
    } catch (err) {
      setIsError(true);
      setFeedback(err instanceof Error ? err.message : 'Could not remove subscriber');
    } finally {
      setBusyAction(null);
    }
  };

  const handleClearAllSubscribers = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setBusyAction('clear-all-subs');
    setIsError(false);
    try {
      const updated = await apiClient.updateSubscriber('', 'clear_all', false);
      onStatusChange(updated);
      setFeedback('Removed all subscribers.');
    } catch (err) {
      setIsError(true);
      setFeedback(err instanceof Error ? err.message : 'Could not clear subscribers');
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveBrevo = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyAction('save-config');
    setIsError(false);
    setFeedback('Encrypting and saving Brevo settings for this Windows account (DPAPI)…');
    try {
      const updated = await apiClient.saveBrevoConfig(senderEmail.trim(), brevoKey.trim());
      setBrevoKey('');
      onStatusChange(updated);
      setFeedback(
        `Brevo credentials saved securely. ${updated.subscribers} subscriber(s) will receive prospect outreach digests.`
      );
    } catch (err) {
      setBrevoKey('');
      setIsError(true);
      setFeedback(err instanceof Error ? err.message : 'Could not save Brevo settings');
    } finally {
      setBusyAction(null);
    }
  };

  const handleTestBrevo = async () => {
    setBusyAction('test');
    setIsError(false);
    setFeedback('Sending test email via Brevo SMTP API…');
    try {
      const res = await apiClient.sendTestBrevoEmail();
      onStatusChange(res);
      setFeedback(res.message);
    } catch (err) {
      setIsError(true);
      setFeedback(err instanceof Error ? err.message : 'Test email failed');
    } finally {
      setBusyAction(null);
    }
  };

  const handleClearBrevo = async () => {
    if (!window.confirm('Clear the saved Brevo API key and sender address from this Windows account?')) {
      return;
    }
    setBusyAction('clear');
    setIsError(false);
    try {
      const res = await apiClient.clearBrevoConfig();
      setBrevoKey('');
      setSenderEmail('');
      setSenderTouched(false);
      onStatusChange(res);
      setFeedback('Saved Brevo credentials cleared.');
    } catch (err) {
      setIsError(true);
      setFeedback(err instanceof Error ? err.message : 'Could not clear credentials');
    } finally {
      setBusyAction(null);
    }
  };

  const statusHeadline = `${
    emailStatus.ready
      ? emailStatus.saved
        ? 'Brevo ready · credentials saved (DPAPI)'
        : 'Brevo ready · loaded from env'
      : 'Brevo not configured'
  } · ${emailStatus.subscribers} subscriber(s) · ${emailStatus.sent} sent · ${emailStatus.failed} failed`;

  return (
    <>
      {/* Fixed right-edge vertical tab */}
      <button
        type="button"
        onClick={() => onToggle(!isOpen)}
        aria-controls="brevoEmailDrawer"
        aria-expanded={isOpen}
        className="fixed right-0 top-[42%] z-30 flex items-center gap-2 rounded-l-lg border border-r-0 px-2.5 py-3.5 text-xs font-semibold shadow-md transition"
        style={{
          writingMode: 'vertical-rl',
          transform: 'rotate(180deg)',
          background: 'var(--surface)',
          borderColor: 'var(--border-strong)',
          color: 'var(--text)',
        }}
      >
        <span
          className={`h-2 w-2 rounded-full ${
            emailStatus.ready ? 'bg-emerald-500' : 'bg-amber-500'
          }`}
        />
        Email delivery ({emailStatus.subscribers})
      </button>

      {/* Backdrop when open */}
      {isOpen && (
        <div
          className="sheet-backdrop"
          onClick={() => onToggle(false)}
        />
      )}

      {/* Slide-out drawer */}
      <aside
        id="brevoEmailDrawer"
        aria-label="Brevo Email Delivery & Subscriptions"
        aria-hidden={!isOpen}
        onClick={(e) => e.stopPropagation()}
        className={`sheet transition-transform duration-200 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ display: isOpen ? 'flex' : 'none' }}
      >
        {/* Header */}
        <div className="sheet-header">
          <div>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4" style={{ color: 'var(--accent)' }} />
              <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
                Email Delivery &amp; Subscriptions
              </h2>
            </div>
            <p className="text-muted mt-1 text-xs">
              Send personalized 1-to-1 outreach drafts &amp; prospect intelligence via Brevo transactional email.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onToggle(false)}
            className="btn btn-ghost btn-sm btn-icon"
            aria-label="Close email delivery"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="sheet-body">
          {/* Status Banner */}
          <div className="callout text-xs">
            <ShieldCheck className="h-4 w-4" style={{ color: emailStatus.ready ? 'var(--success)' : 'var(--warning)' }} />
            <div className="flex-1">
              <span className="font-medium" style={{ color: 'var(--text)' }}>{statusHeadline}</span>
              {feedback && (
                <div
                  className={`mt-1 flex items-start gap-1.5 text-[11.5px] ${
                    isError ? 'text-danger' : 'text-subtle'
                  }`}
                  aria-live="polite"
                >
                  {isError ? (
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
                  ) : (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: 'var(--success)' }} />
                  )}
                  <span>{feedback}</span>
                </div>
              )}
            </div>
          </div>

          {/* Active Company Digest / 1-to-1 Email Dispatch Card */}
          {activeProject && (
            <div className="card">
              <div className="card-header">
                <div>
                  <h3 className="card-title text-xs uppercase tracking-wider">
                    Dispatch Outreach: {activeProject.company.companyName}
                  </h3>
                  <p className="card-subtitle">
                    Clean 1-to-1 executive email dispatch
                  </p>
                </div>
                <span className="badge badge-accent mono font-medium">
                  {activeProject.prospects.length} prospects
                </span>
              </div>

              <div className="card-body space-y-3.5">
                {/* Format selection */}
                <div className="segmented segmented-block">
                  <button
                    type="button"
                    aria-pressed={digestDraftMode === 'email'}
                    onClick={() => setDigestDraftMode('email')}
                  >
                    <FileText className="inline-block h-3.5 w-3.5 mr-1 align-text-bottom" />
                    Full Personalized Email
                  </button>
                  <button
                    type="button"
                    aria-pressed={digestDraftMode === 'concise'}
                    onClick={() => setDigestDraftMode('concise')}
                  >
                    <MessageSquare className="inline-block h-3.5 w-3.5 mr-1 align-text-bottom" />
                    Concise Note (≤300 chars)
                  </button>
                </div>

                {/* Prospect selector */}
                {activeProject.prospects.length > 0 && (
                  <div className="space-y-3">
                    <div className="field">
                      <label className="label">Select prospect draft to send:</label>
                      <select
                        value={selectedPreviewProspectId || activeProject.prospects[0]?.id || ''}
                        onChange={(e) => setSelectedPreviewProspectId(e.target.value)}
                        className="select"
                      >
                        {activeProject.prospects.map((p, idx) => (
                          <option key={p.id} value={p.id}>
                            {idx + 1}. {p.fullName} — {p.jobTitle} (Score: {p.score.totalScore}/100)
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Direct Recipient Input */}
                    <div className="field">
                      <label className="label">
                        Send directly to email <span className="optional">(optional recipient override)</span>
                      </label>
                      <input
                        type="email"
                        value={customSendEmail}
                        onChange={(e) => setCustomSendEmail(e.target.value)}
                        placeholder="e.g. colleague@company.com or test address…"
                        className="input font-mono-tabular"
                      />
                      <span className="hint">
                        {customSendEmail.trim()
                          ? `Will send directly to ${customSendEmail.trim()}`
                          : emailStatus.emails.length > 0
                          ? `Leave empty to deliver to all ${emailStatus.emails.length} subscriber(s)`
                          : 'Enter a recipient address or add a subscriber below'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Preview Toggle Button */}
                <button
                  type="button"
                  onClick={() => setShowDigestPreview(!showDigestPreview)}
                  className="btn btn-secondary btn-sm btn-block"
                >
                  {showDigestPreview ? (
                    <>
                      <EyeOff className="h-3.5 w-3.5" />
                      Hide email preview
                    </>
                  ) : (
                    <>
                      <Eye className="h-3.5 w-3.5" />
                      Preview 1-to-1 email content
                    </>
                  )}
                </button>

                {/* Live 1-to-1 Email Preview */}
                {showDigestPreview && (() => {
                  const currentProspect =
                    activeProject.prospects.find(
                      (p) => p.id === (selectedPreviewProspectId || activeProject.prospects[0]?.id)
                    ) || activeProject.prospects[0];
                  if (!currentProspect) return null;

                  const activeRecipient =
                    customSendEmail.trim() ||
                    (emailStatus.emails.length > 0
                      ? emailStatus.emails.join(', ')
                      : '(Add recipient or subscriber below)');

                  return (
                    <div className="email-preview">
                      <div className="email-preview-meta">
                        <span className="text-subtle font-medium">From:</span>
                        <span className="mono" style={{ color: 'var(--text)' }}>
                          {emailStatus.sender_email || '(Configure sender email below)'}
                        </span>
                        <span className="text-subtle font-medium">To:</span>
                        <span className="mono font-medium" style={{ color: 'var(--success)' }}>
                          {activeRecipient}
                        </span>
                        <span className="text-subtle font-medium">Subject:</span>
                        <span className="font-medium" style={{ color: 'var(--text)' }}>
                          {currentProspect.emailSubject}
                        </span>
                      </div>
                      <div className="email-preview-body whitespace-pre-line text-xs leading-relaxed">
                        {digestDraftMode === 'concise'
                          ? currentProspect.connectionDraft || currentProspect.emailBody
                          : currentProspect.emailBody || currentProspect.connectionDraft}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="card-footer">
                <button
                  type="button"
                  disabled={busyAction !== null || activeProject.prospects.length === 0}
                  onClick={async () => {
                    const targetId = selectedPreviewProspectId || activeProject.prospects[0]?.id;
                    setBusyAction('digest');
                    setIsError(false);
                    try {
                      const res = await apiClient.sendDigestViaBrevo(
                        activeProject.id,
                        targetId ? [targetId] : undefined,
                        digestDraftMode,
                        customSendEmail.trim() || undefined
                      );
                      onStatusChange(res.emailStatus);
                      onProjectUpdated(res.project);
                      setFeedback(res.message);
                    } catch (err) {
                      setIsError(true);
                      setFeedback(err instanceof Error ? err.message : 'Failed to send outreach');
                    } finally {
                      setBusyAction(null);
                    }
                  }}
                  className="btn btn-primary btn-block"
                >
                  <Send className="h-3.5 w-3.5" />
                  {busyAction === 'digest'
                    ? 'Dispatching via Brevo…'
                    : customSendEmail.trim()
                    ? `Send to ${customSendEmail.trim()} via Brevo`
                    : `Send to ${emailStatus.emails.length} subscriber(s)`}
                </button>
              </div>
            </div>
          )}

          {/* Manage Subscribers */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title text-xs uppercase tracking-wider">
                Manage Subscribers
              </h3>
              <label className="checkbox text-xs">
                <input
                  type="checkbox"
                  checked={emailStatus.auto_alert}
                  onChange={async (e) => {
                    const res = await apiClient.setAutoAlert(e.target.checked);
                    onStatusChange(res);
                  }}
                />
                <span>Auto-send for fit ≥ 80</span>
              </label>
            </div>

            <div className="card-body space-y-3.5">
              <form onSubmit={handleAddSubscriber} className="space-y-3">
                <div className="field">
                  <label htmlFor="subscriberEmail" className="label">
                    Subscriber email
                  </label>
                  <input
                    id="subscriberEmail"
                    type="email"
                    value={subscriberEmail}
                    onChange={(e) => setSubscriberEmail(e.target.value)}
                    placeholder="name@company.com"
                    required
                    className="input font-mono-tabular"
                  />
                </div>

                <label className="checkbox">
                  <input
                    id="subscriberConsent"
                    type="checkbox"
                    checked={subscriberConsent}
                    onChange={(e) => setSubscriberConsent(e.target.checked)}
                    required
                  />
                  <span className="text-xs text-subtle">
                    I have permission from this recipient to receive ProspectIQ research &amp; outreach digests.
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={busyAction !== null}
                  className="btn btn-secondary btn-sm btn-block"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Add subscriber
                </button>
              </form>

              {/* Subscribed List */}
              <div className="pt-2">
                {emailStatus.emails.length === 0 ? (
                  <p className="rounded border border-dashed p-3 text-center text-xs text-subtle" style={{ borderColor: 'var(--border)' }}>
                    No subscribers yet. Add your email above to receive outreach digests.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-subtle font-medium">
                        Active subscribers ({emailStatus.emails.length})
                      </span>
                      {emailStatus.emails.length > 1 && (
                        <button
                          type="button"
                          disabled={busyAction !== null}
                          onClick={handleClearAllSubscribers}
                          className="link link-muted text-xs"
                        >
                          Unsubscribe all
                        </button>
                      )}
                    </div>
                    {emailStatus.emails.map((email) => (
                      <div
                        key={email}
                        className="flex items-center justify-between gap-2 rounded-md border p-2 text-xs"
                        style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
                      >
                        <span className="mono truncate" style={{ color: 'var(--text)' }}>{email}</span>
                        <button
                          type="button"
                          disabled={busyAction !== null}
                          onClick={(e) => handleRemoveSubscriber(e, email)}
                          className="btn btn-ghost btn-sm text-xs"
                          style={{ height: '24px', padding: '0 8px' }}
                        >
                          {busyAction === `remove-${email}` ? 'Removing…' : 'Unsubscribe'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Brevo Delivery Setup */}
          <div className="card">
            <div className="card-header">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" style={{ color: 'var(--accent)' }} />
                <h3 className="card-title text-xs uppercase tracking-wider">
                  Brevo Account Credentials
                </h3>
              </div>
            </div>

            <form onSubmit={handleSaveBrevo} className="card-body space-y-3">
              <p className="text-subtle text-xs">
                Credentials are encrypted for this Windows user account (DPAPI) and restored on startup.
              </p>

              <div className="field">
                <label htmlFor="brevoSender" className="label">
                  Verified sender email
                </label>
                <input
                  id="brevoSender"
                  type="email"
                  value={senderEmail}
                  onChange={(e) => {
                    setSenderTouched(true);
                    setSenderEmail(e.target.value);
                  }}
                  placeholder="alerts@yourdomain.com"
                  required
                  className="input font-mono-tabular"
                />
              </div>

              <div className="field">
                <label htmlFor="brevoKey" className="label">
                  Brevo API key
                </label>
                <input
                  id="brevoKey"
                  type="password"
                  value={brevoKey}
                  onChange={(e) => setBrevoKey(e.target.value)}
                  placeholder={
                    emailStatus.ready
                      ? 'Saved (enter new key to replace)'
                      : 'xkeysib-...'
                  }
                  className="input font-mono-tabular"
                />
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="submit"
                  disabled={busyAction !== null}
                  className="btn btn-primary btn-sm flex-1"
                >
                  Save credentials
                </button>
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={handleTestBrevo}
                  className="btn btn-secondary btn-sm"
                >
                  Test email
                </button>
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={handleClearBrevo}
                  className="btn btn-ghost btn-sm text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear
                </button>
              </div>
            </form>
          </div>
        </div>
      </aside>
    </>
  );
};
