import React, { useRef, useEffect, useState } from 'react';
import { X, Key, CheckCircle2, AlertCircle, UserCheck, Shield, Trash2 } from 'lucide-react';
import { ApiCapabilitiesStatus, SenderProfile } from '../types/prospectiq';
import { apiClient } from '../services/apiClient';

interface ApiConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  capabilities: ApiCapabilitiesStatus | null;
  onCapabilitiesUpdated: (caps: ApiCapabilitiesStatus) => void;
  senderProfile: SenderProfile;
  onSaveSenderProfile: (profile: SenderProfile) => Promise<void>;
}

export const ApiConfigModal: React.FC<ApiConfigModalProps> = ({
  isOpen,
  onClose,
  capabilities,
  onCapabilitiesUpdated,
  senderProfile,
  onSaveSenderProfile,
}) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [draftSender, setDraftSender] = useState<SenderProfile>(senderProfile);
  const [savedMsg, setSavedMsg] = useState('');

  // Server API Key input fields
  const [geminiKey, setGeminiKey] = useState('');
  const [hunterKey, setHunterKey] = useState('');
  const [serperKey, setSerperKey] = useState('');
  const [tavilyKey, setTavilyKey] = useState('');
  const [keysStatusMsg, setKeysStatusMsg] = useState('');
  const [savingKeys, setSavingKeys] = useState(false);

  useEffect(() => {
    setDraftSender(senderProfile);
  }, [senderProfile]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // Apply mandatory fallback for <dialog closedby="any"> per modern-web-guidance (light-dismiss-a-dialog)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => onClose();
    dialog.addEventListener('close', handleClose);

    if (!('closedBy' in HTMLDialogElement.prototype)) {
      const handleBackdropClick = (event: MouseEvent) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (isDialogContent) return;
        dialog.close();
      };
      dialog.addEventListener('click', handleBackdropClick);
      return () => {
        dialog.removeEventListener('close', handleClose);
        dialog.removeEventListener('click', handleBackdropClick);
      };
    }
    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  const handleSaveSender = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSaveSenderProfile(draftSender);
    setSavedMsg('Sender profile saved');
    setTimeout(() => setSavedMsg(''), 2500);
  };

  const handleSaveKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingKeys(true);
    setKeysStatusMsg('');
    try {
      const res = await apiClient.saveApiKeys({
        geminiApiKey: geminiKey.trim() || undefined,
        hunterApiKey: hunterKey.trim() || undefined,
        serperApiKey: serperKey.trim() || undefined,
        tavilyApiKey: tavilyKey.trim() || undefined,
      });
      onCapabilitiesUpdated(res.capabilities);
      setGeminiKey('');
      setHunterKey('');
      setSerperKey('');
      setTavilyKey('');
      setKeysStatusMsg('Saved to server .env');
      setTimeout(() => setKeysStatusMsg(''), 3500);
    } catch (err) {
      setKeysStatusMsg(err instanceof Error ? err.message : 'Failed to save API keys');
    } finally {
      setSavingKeys(false);
    }
  };

  const handleClearKey = async (keyName: 'gemini' | 'hunter' | 'serper' | 'tavily') => {
    const res = await apiClient.clearApiKey(keyName);
    onCapabilitiesUpdated(res.capabilities);
    setKeysStatusMsg(`Cleared ${keyName.toUpperCase()}`);
  };

  return (
    <dialog
      ref={dialogRef}
      {...({ closedby: 'any' } as React.DialogHTMLAttributes<HTMLDialogElement>)}
      aria-labelledby="api-config-modal-title"
      className="modal modal-lg"
    >
      <div className="modal-header">
        <div>
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4" style={{ color: 'var(--accent)' }} />
            <h2 id="api-config-modal-title" className="modal-title">
              Workspace Settings &amp; API Keys
            </h2>
          </div>
          <p className="text-muted mt-1 text-xs">
            Keys are stored securely on the backend server (`.env`) and never exposed in browser bundles.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="btn btn-ghost btn-sm btn-icon"
          aria-label="Close settings"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="modal-body">
        {/* Section 1: Server API Keys Form */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4" style={{ color: 'var(--success)' }} />
              <h3 className="card-title text-xs uppercase tracking-wider">
                Research &amp; Intelligence API Keys
              </h3>
            </div>
            {keysStatusMsg && (
              <span className="badge badge-success mono text-xs">{keysStatusMsg}</span>
            )}
          </div>

          <form onSubmit={handleSaveKeys} className="card-body space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* 1. Gemini API Key */}
              <div
                className="rounded-lg border p-3.5 space-y-2"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
              >
                <div className="flex items-center justify-between text-xs font-medium">
                  <span style={{ color: 'var(--text)' }}>Google Gemini</span>
                  <div className="flex items-center gap-1.5">
                    {capabilities?.hasGeminiKey ? (
                      <>
                        <span className="badge badge-success text-[11px]">Saved</span>
                        <button
                          type="button"
                          onClick={() => handleClearKey('gemini')}
                          title="Clear Gemini key"
                          className="btn btn-ghost btn-sm btn-icon"
                          style={{ width: '22px', height: '22px' }}
                        >
                          <Trash2 className="h-3 w-3 text-subtle hover:text-danger" />
                        </button>
                      </>
                    ) : (
                      <span className="badge badge-warning text-[11px]">Optional</span>
                    )}
                  </div>
                </div>
                <p className="text-subtle text-[11.5px]">
                  Extracts company summaries, verifies intelligence, and drafts personalized outreach.
                </p>
                <input
                  type="password"
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  placeholder={capabilities?.hasGeminiKey ? 'Saved (enter to replace)' : 'AIza...'}
                  className="input input-sm font-mono-tabular"
                />
              </div>

              {/* 2. Hunter.io API Key */}
              <div
                className="rounded-lg border p-3.5 space-y-2"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
              >
                <div className="flex items-center justify-between text-xs font-medium">
                  <span style={{ color: 'var(--text)' }}>Hunter.io</span>
                  <div className="flex items-center gap-1.5">
                    {capabilities?.hasHunterKey ? (
                      <>
                        <span className="badge badge-success text-[11px]">Saved</span>
                        <button
                          type="button"
                          onClick={() => handleClearKey('hunter')}
                          title="Clear Hunter.io key"
                          className="btn btn-ghost btn-sm btn-icon"
                          style={{ width: '22px', height: '22px' }}
                        >
                          <Trash2 className="h-3 w-3 text-subtle hover:text-danger" />
                        </button>
                      </>
                    ) : (
                      <span className="badge badge-warning text-[11px]">Optional</span>
                    )}
                  </div>
                </div>
                <p className="text-subtle text-[11.5px]">
                  Discovers decision-maker work emails, verified roles, and LinkedIn URLs.
                </p>
                <input
                  type="password"
                  value={hunterKey}
                  onChange={(e) => setHunterKey(e.target.value)}
                  placeholder={capabilities?.hasHunterKey ? 'Saved (enter to replace)' : 'Hunter API key'}
                  className="input input-sm font-mono-tabular"
                />
              </div>

              {/* 3. Serper.dev API Key */}
              <div
                className="rounded-lg border p-3.5 space-y-2"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
              >
                <div className="flex items-center justify-between text-xs font-medium">
                  <span style={{ color: 'var(--text)' }}>Serper.dev</span>
                  <div className="flex items-center gap-1.5">
                    {capabilities?.hasSerperKey ? (
                      <>
                        <span className="badge badge-success text-[11px]">Saved</span>
                        <button
                          type="button"
                          onClick={() => handleClearKey('serper')}
                          title="Clear Serper key"
                          className="btn btn-ghost btn-sm btn-icon"
                          style={{ width: '22px', height: '22px' }}
                        >
                          <Trash2 className="h-3 w-3 text-subtle hover:text-danger" />
                        </button>
                      </>
                    ) : (
                      <span className="badge badge-outline text-[11px]">Optional</span>
                    )}
                  </div>
                </div>
                <p className="text-subtle text-[11.5px]">
                  Google Search grounding for live executive profiles and verified sources.
                </p>
                <input
                  type="password"
                  value={serperKey}
                  onChange={(e) => setSerperKey(e.target.value)}
                  placeholder={capabilities?.hasSerperKey ? 'Saved (enter to replace)' : 'Serper key'}
                  className="input input-sm font-mono-tabular"
                />
              </div>

              {/* 4. Tavily Search API Key */}
              <div
                className="rounded-lg border p-3.5 space-y-2"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
              >
                <div className="flex items-center justify-between text-xs font-medium">
                  <span style={{ color: 'var(--text)' }}>Tavily AI Search</span>
                  <div className="flex items-center gap-1.5">
                    {capabilities?.hasTavilyKey ? (
                      <>
                        <span className="badge badge-success text-[11px]">Saved</span>
                        <button
                          type="button"
                          onClick={() => handleClearKey('tavily')}
                          title="Clear Tavily key"
                          className="btn btn-ghost btn-sm btn-icon"
                          style={{ width: '22px', height: '22px' }}
                        >
                          <Trash2 className="h-3 w-3 text-subtle hover:text-danger" />
                        </button>
                      </>
                    ) : (
                      <span className="badge badge-outline text-[11px]">Optional</span>
                    )}
                  </div>
                </div>
                <p className="text-subtle text-[11.5px]">
                  Autonomous web search engine for company dossiers and executive discovery.
                </p>
                <input
                  type="password"
                  value={tavilyKey}
                  onChange={(e) => setTavilyKey(e.target.value)}
                  placeholder={capabilities?.hasTavilyKey ? 'Saved (enter to replace)' : 'tvly-...'}
                  className="input input-sm font-mono-tabular"
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={savingKeys || (!geminiKey.trim() && !hunterKey.trim() && !serperKey.trim() && !tavilyKey.trim())}
                className="btn btn-primary btn-sm"
              >
                {savingKeys ? 'Saving…' : 'Save API keys'}
              </button>
            </div>
          </form>
        </div>

        {/* Section 2: Sender Value Proposition Context */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4" style={{ color: 'var(--accent)' }} />
              <h3 className="card-title text-xs uppercase tracking-wider">
                Sender Profile &amp; Value Proposition
              </h3>
            </div>
            {savedMsg && (
              <span className="badge badge-success text-xs">{savedMsg}</span>
            )}
          </div>

          <form onSubmit={handleSaveSender} className="card-body space-y-3.5">
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
              <div className="field">
                <label className="label">Your name</label>
                <input
                  type="text"
                  value={draftSender.senderName}
                  onChange={(e) => setDraftSender({ ...draftSender, senderName: e.target.value })}
                  className="input input-sm"
                />
              </div>
              <div className="field">
                <label className="label">Your title / cohort</label>
                <input
                  type="text"
                  value={draftSender.senderTitle}
                  onChange={(e) => setDraftSender({ ...draftSender, senderTitle: e.target.value })}
                  className="input input-sm"
                />
              </div>
              <div className="field">
                <label className="label">Your organization</label>
                <input
                  type="text"
                  value={draftSender.senderCompany}
                  onChange={(e) => setDraftSender({ ...draftSender, senderCompany: e.target.value })}
                  className="input input-sm"
                />
              </div>
            </div>

            <div className="field">
              <label className="label">Value proposition &amp; offering summary</label>
              <input
                type="text"
                value={draftSender.offeringSummary}
                onChange={(e) => setDraftSender({ ...draftSender, offeringSummary: e.target.value })}
                className="input input-sm"
              />
              <span className="hint">
                Injected into AI outreach drafts to articulate why you are reaching out to the decision-maker.
              </span>
            </div>

            <div className="flex justify-end pt-1">
              <button type="submit" className="btn btn-secondary btn-sm">
                Save sender profile
              </button>
            </div>
          </form>
        </div>
      </div>
    </dialog>
  );
};
