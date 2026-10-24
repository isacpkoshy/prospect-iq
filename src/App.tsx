import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Mail,
  Settings2,
  Globe,
} from 'lucide-react';
import {
  ApiCapabilitiesStatus,
  BrevoEmailStatus,
  BuyingRole,
  CompanySummary,
  DiscoveryCriteria,
  OutreachStatus,
  Prospect,
  ResearchProject,
  SenderProfile,
} from './types/prospectiq';
import { apiClient } from './services/apiClient';
import { CompanyResearchSection } from './components/CompanyResearchSection';
import { ProspectDiscoveryBar } from './components/ProspectDiscoveryBar';
import { OutreachTracker } from './components/OutreachTracker';
import { ProspectDetailDrawer } from './components/ProspectDetailDrawer';
import { BrevoEmailDrawer } from './components/BrevoEmailDrawer';
import { ApiConfigModal } from './components/ApiConfigModal';

export const App: React.FC = () => {
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [urlInput, setUrlInput] = useState('');
  const [senderProfile, setSenderProfile] = useState<SenderProfile>({
    senderName: 'Isac P Koshy',
    senderTitle: 'Growth & Strategic Partnerships Lead',
    senderCompany: 'NexusAI Enterprise',
    offeringSummary: 'Enterprise AI workflow automation and cloud developer velocity tooling.',
    defaultObjective: 'Explore enterprise AI workflow partnerships and executive insights exchange.',
  });
  const [capabilities, setCapabilities] = useState<ApiCapabilitiesStatus | null>(null);
  const [emailStatus, setEmailStatus] = useState<BrevoEmailStatus>({
    ready: false,
    saved: false,
    subscribers: 0,
    sent: 0,
    failed: 0,
    message: 'Loading email settings…',
    sender_email: '',
    emails: [],
    auto_alert: true,
  });

  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [isBrevoDrawerOpen, setIsBrevoDrawerOpen] = useState(false);
  const [prefillBrevoEmail, setPrefillBrevoEmail] = useState<string>('');
  const [isApiModalOpen, setIsApiModalOpen] = useState(false);
  const [isResearching, setIsResearching] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isSendingBrevo, setIsSendingBrevo] = useState(false);
  const [discoveryFeedback, setDiscoveryFeedback] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const loadInitialData = useCallback(async () => {
    try {
      const [statusRes, projRes] = await Promise.all([
        apiClient.getStatus(),
        apiClient.getProjects(),
      ]);
      setCapabilities(statusRes.capabilities);
      setEmailStatus(statusRes.emailStatus);
      setProjects(projRes.projects);
      setSenderProfile(projRes.senderProfile);
      if (projRes.projects.length > 0 && !activeProjectId) {
        setActiveProjectId(projRes.projects[0].id);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to connect to server');
    }
  }, [activeProjectId]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const activeProject = projects.find((p) => p.id === activeProjectId) || projects[0] || null;

  const updateProjectInState = (updated: ResearchProject) => {
    setProjects((prev) => {
      const exists = prev.some((p) => p.id === updated.id);
      if (exists) {
        return prev.map((p) => (p.id === updated.id ? updated : p));
      }
      return [updated, ...prev];
    });
    if (selectedProspect) {
      const refreshedProspect = updated.prospects.find((pr) => pr.id === selectedProspect.id);
      if (refreshedProspect) setSelectedProspect(refreshedProspect);
    }
  };

  const handleResearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;
    setIsResearching(true);
    setDiscoveryFeedback(null);
    try {
      const res = await apiClient.researchCompany(urlInput.trim());
      setProjects(res.projects);
      setActiveProjectId(res.project.id);
      setSelectedProspect(null);
      setUrlInput('');
      showToast(`Researched ${res.project.company.companyName}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Company research failed');
    } finally {
      setIsResearching(false);
    }
  };

  const handleUpdateCompanySummary = async (updatedSummary: CompanySummary) => {
    if (!activeProject) return;
    const res = await apiClient.updateProject({
      ...activeProject,
      name: updatedSummary.companyName,
      company: updatedSummary,
    });
    updateProjectInState(res.project);
    showToast('Summary saved');
  };

  const handleUpdateCriteria = async (criteria: DiscoveryCriteria) => {
    if (!activeProject) return;
    const updated = { ...activeProject, criteria };
    updateProjectInState(updated);
    await apiClient.updateProject(updated);
  };

  const handleSelectIcpForDiscovery = async (icpId: string, roles: string[]) => {
    if (!activeProject) return;
    const updatedCriteria: DiscoveryCriteria = {
      ...activeProject.criteria,
      selectedIcpSegmentId: icpId,
      targetJobTitles: roles,
    };
    await handleUpdateCriteria(updatedCriteria);
    showToast(`Updated target roles to ${roles.join(', ')}`);
  };

  const handleRunDiscovery = async (criteria: DiscoveryCriteria) => {
    if (!activeProject) return;
    setIsDiscovering(true);
    setDiscoveryFeedback(null);
    try {
      const res = await apiClient.discoverProspects(activeProject.id, criteria);
      updateProjectInState(res.project);
      setDiscoveryFeedback(res.message);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Discovery failed');
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleAddManualProspect = async (payload: {
    fullName: string;
    jobTitle: string;
    buyingRole: BuyingRole;
    icpSegmentId: string;
    location: string;
    locationVerified: boolean;
    titleVerified: boolean;
    email: string;
    linkedinUrl: string;
    sourceTitle: string;
    sourceUrl: string;
  }) => {
    if (!activeProject) return;
    const res = await apiClient.addManualProspect(activeProject.id, payload);
    updateProjectInState(res.project);
    setSelectedProspect(res.prospect);
    showToast(`Added ${res.prospect.fullName} (Score: ${res.prospect.score.totalScore}/100)`);
  };

  const handleUpdateProspectStatus = async (prospectId: string, outreachStatus: OutreachStatus) => {
    if (!activeProject) return;
    const res = await apiClient.updateProspect(activeProject.id, prospectId, { outreachStatus });
    updateProjectInState(res.project);
  };

  const handleSaveProspectEdits = async (prospectId: string, updates: Partial<Prospect>) => {
    if (!activeProject) return;
    const res = await apiClient.updateProspect(activeProject.id, prospectId, updates);
    updateProjectInState(res.project);
    showToast('Saved changes');
  };

  const handleRegenerateOutreach = async (
    prospectId: string,
    tone: 'executive' | 'consultative' | 'mba'
  ) => {
    if (!activeProject) return;
    const res = await apiClient.regenerateProspectOutreach(activeProject.id, prospectId, tone);
    updateProjectInState(res.project);
    showToast('Draft regenerated');
  };

  const handleDeleteProspect = async (prospectId: string) => {
    if (!activeProject) return;
    const res = await apiClient.deleteProspect(activeProject.id, prospectId);
    updateProjectInState(res.project);
    if (selectedProspect?.id === prospectId) setSelectedProspect(null);
  };

  const handleSendProspectsViaBrevo = async (
    prospectIds: string[],
    draftMode: 'email' | 'concise' = 'email'
  ) => {
    if (!activeProject) return;
    setIsSendingBrevo(true);

    // Only auto-add & pre-fill the prospect's email when clicking Email on a single individual person
    const singleProspect =
      prospectIds.length === 1
        ? activeProject.prospects.find((p) => p.id === prospectIds[0])
        : undefined;
    if (singleProspect?.email) {
      setPrefillBrevoEmail(singleProspect.email);
      try {
        const subStatus = await apiClient.updateSubscriber(singleProspect.email, 'add', true);
        setEmailStatus(subStatus);
      } catch {
        // continue
      }
    }

    try {
      const res = await apiClient.sendDigestViaBrevo(activeProject.id, prospectIds, draftMode);
      updateProjectInState(res.project);
      setEmailStatus(res.emailStatus);
      showToast(res.message);
    } catch (err) {
      try {
        const latestStatus = await apiClient.getEmailStatus();
        setEmailStatus(latestStatus);
      } catch {
        // ignore
      }
      setIsBrevoDrawerOpen(true);
      showToast(
        singleProspect?.email
          ? `Added ${singleProspect.email} to subscribers! Configure your Brevo API key to send.`
          : err instanceof Error
          ? err.message
          : 'Configure Brevo in Email Alerts first'
      );
    } finally {
      setIsSendingBrevo(false);
    }
  };

  const switchProject = (id: string) => {
    setActiveProjectId(id);
    setSelectedProspect(null);
    setDiscoveryFeedback(null);
  };

  const initials = (name: string) =>
    name
      .replace(/\(.*?\)/g, '')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() || '')
      .join('');

  return (
    <div className="app">
      {/* ---------- Sidebar ---------- */}
      <aside className="sidebar" aria-label="Workspace navigation">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">P</span>
          ProspectIQ
        </div>

        <div className="nav-section-label">Accounts</div>
        <nav aria-label="Researched accounts" className="flex flex-col gap-0.5 overflow-y-auto">
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              className="nav-item"
              aria-current={activeProject?.id === p.id ? 'page' : undefined}
              onClick={() => switchProject(p.id)}
            >
              <span className="nav-avatar" aria-hidden="true">
                {initials(p.company.companyName)}
              </span>
              <span className="nav-label">{p.company.companyName}</span>
              {p.isDemo && <span className="badge badge-outline" style={{ height: 18, fontSize: 10.5, padding: '0 6px' }}>Demo</span>}
              <span className="nav-count">{p.prospects.length}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button type="button" className="nav-item" onClick={() => setIsBrevoDrawerOpen(true)}>
            <Mail className="h-4 w-4" />
            <span className="nav-label">Email delivery</span>
            <span className={`status-dot ${emailStatus.ready ? 'on' : 'warn'}`} style={{ marginLeft: 'auto' }} />
          </button>
          <button type="button" className="nav-item" onClick={() => setIsApiModalOpen(true)}>
            <Settings2 className="h-4 w-4" />
            <span className="nav-label">Settings</span>
            <span
              className={`status-dot ${capabilities?.hasAnySearchProvider ? 'on' : 'warn'}`}
              style={{ marginLeft: 'auto' }}
            />
          </button>
        </div>
      </aside>

      {/* ---------- Main ---------- */}
      <div className="main">
        <header className="topbar">
          <div className="breadcrumb">
            <span className="hidden sm:inline">Accounts</span>
            <span className="hidden sm:inline" aria-hidden="true">/</span>
            <select
              className="select select-sm min-[900px]:hidden"
              style={{ width: 'auto' }}
              value={activeProject?.id || ''}
              onChange={(e) => switchProject(e.target.value)}
              aria-label="Switch account"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.company.companyName}
                </option>
              ))}
            </select>
            <strong className="hidden min-[900px]:inline">{activeProject?.company.companyName || '—'}</strong>
            {activeProject?.isDemo && <span className="badge badge-warning">Demo data</span>}
          </div>

          <form onSubmit={handleResearchSubmit} className="ml-auto flex w-full max-w-sm items-center gap-2">
            <label htmlFor="research-url" className="sr-only">
              Company website
            </label>
            <div className="input-group flex-1">
              <Globe />
              <input
                id="research-url"
                type="text"
                className="input"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Research a company, e.g. stripe.com"
              />
            </div>
            <button type="submit" className="btn btn-dark" disabled={isResearching || !urlInput.trim()}>
              {isResearching ? <span className="spinner" /> : <Search />}
              {isResearching ? 'Researching' : 'Research'}
            </button>
          </form>

          <div className="flex items-center gap-1 min-[900px]:hidden">
            <button type="button" className="btn btn-ghost btn-icon" aria-label="Email delivery" onClick={() => setIsBrevoDrawerOpen(true)}>
              <Mail />
            </button>
            <button type="button" className="btn btn-ghost btn-icon" aria-label="Settings" onClick={() => setIsApiModalOpen(true)}>
              <Settings2 />
            </button>
          </div>
        </header>

        <main className="page">
          {activeProject ? (
            <>
              <CompanyResearchSection
                project={activeProject}
                onUpdateCompanySummary={handleUpdateCompanySummary}
                onSelectIcpForDiscovery={handleSelectIcpForDiscovery}
              />

              <ProspectDiscoveryBar
                project={activeProject}
                capabilities={capabilities}
                isDiscovering={isDiscovering}
                discoveryFeedback={discoveryFeedback}
                onUpdateCriteria={handleUpdateCriteria}
                onRunDiscovery={handleRunDiscovery}
                onAddManualProspect={handleAddManualProspect}
              />

              <OutreachTracker
                project={activeProject}
                selectedProspect={selectedProspect}
                onSelectProspect={(p) => setSelectedProspect(p)}
                onUpdateProspectStatus={handleUpdateProspectStatus}
                onDeleteProspect={handleDeleteProspect}
                onSendProspectsViaBrevo={handleSendProspectsViaBrevo}
                isSendingBrevo={isSendingBrevo}
              />
            </>
          ) : (
            <div className="card empty">
              <div className="empty-icon">
                <Globe className="h-5 w-5" />
              </div>
              <div className="empty-title">Research your first account</div>
              <p className="empty-text">
                Enter a company website above to generate an account summary, find decision-makers and draft outreach.
              </p>
            </div>
          )}
        </main>
      </div>

      {toastMessage && (
        <div className="toast" role="status" aria-live="polite">
          {toastMessage}
        </div>
      )}

      {activeProject && (
        <ProspectDetailDrawer
          project={activeProject}
          prospect={selectedProspect}
          senderProfile={senderProfile}
          onClose={() => setSelectedProspect(null)}
          onSaveProspectEdits={handleSaveProspectEdits}
          onRegenerateOutreach={handleRegenerateOutreach}
          onSendViaBrevo={handleSendProspectsViaBrevo}
          isSendingBrevo={isSendingBrevo}
        />
      )}

      <BrevoEmailDrawer
        isOpen={isBrevoDrawerOpen}
        onToggle={setIsBrevoDrawerOpen}
        emailStatus={emailStatus}
        onStatusChange={setEmailStatus}
        activeProject={activeProject}
        onProjectUpdated={updateProjectInState}
        prefillSubscriberEmail={prefillBrevoEmail}
      />

      <ApiConfigModal
        isOpen={isApiModalOpen}
        onClose={() => setIsApiModalOpen(false)}
        capabilities={capabilities}
        onCapabilitiesUpdated={setCapabilities}
        senderProfile={senderProfile}
        onSaveSenderProfile={async (profile) => {
          const res = await apiClient.updateSenderProfile(profile);
          setSenderProfile(res.senderProfile);
        }}
      />
    </div>
  );
};
