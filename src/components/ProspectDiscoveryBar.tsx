import React, { useState, useRef, useEffect } from 'react';
import { Search, UserPlus, ExternalLink, X, SlidersHorizontal, ChevronDown, Info, AlertTriangle } from 'lucide-react';
import {
  ApiCapabilitiesStatus,
  BuyingRole,
  DiscoveryCriteria,
  ResearchProject,
  SeniorityLevel,
} from '../types/prospectiq';

interface ProspectDiscoveryBarProps {
  project: ResearchProject;
  capabilities: ApiCapabilitiesStatus | null;
  isDiscovering: boolean;
  discoveryFeedback: string | null;
  onUpdateCriteria: (criteria: DiscoveryCriteria) => void;
  onRunDiscovery: (criteria: DiscoveryCriteria) => Promise<void>;
  onAddManualProspect: (payload: {
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
  }) => Promise<void>;
}

const SENIORITY_OPTIONS: SeniorityLevel[] = ['C-Suite', 'VP', 'Director', 'Manager'];

export const ProspectDiscoveryBar: React.FC<ProspectDiscoveryBarProps> = ({
  project,
  capabilities,
  isDiscovering,
  discoveryFeedback,
  onUpdateCriteria,
  onRunDiscovery,
  onAddManualProspect,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [titlesText, setTitlesText] = useState(project.criteria.targetJobTitles.join(', '));
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  const [fullName, setFullName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [buyingRole] = useState<BuyingRole>('Decision Maker');
  const [location, setLocation] = useState('');
  const [email, setEmail] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [manualSubmitting, setManualSubmitting] = useState(false);

  useEffect(() => {
    setTitlesText(project.criteria.targetJobTitles.join(', '));
  }, [project.id, project.criteria.targetJobTitles]);

  // Light-dismiss fallback for browsers without <dialog closedby="any"> (modern-web-guidance: light-dismiss-a-dialog)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
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
      return () => dialog.removeEventListener('click', handleBackdropClick);
    }
  }, []);

  const { criteria, company } = project;

  const handleToggleSeniority = (level: SeniorityLevel) => {
    const exists = criteria.seniorityLevels.includes(level);
    const updated = exists
      ? criteria.seniorityLevels.filter((s) => s !== level)
      : [...criteria.seniorityLevels, level];
    onUpdateCriteria({
      ...criteria,
      seniorityLevels: updated.length > 0 ? updated : [level],
    });
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !jobTitle.trim()) return;
    setManualSubmitting(true);
    try {
      await onAddManualProspect({
        fullName: fullName.trim(),
        jobTitle: jobTitle.trim(),
        buyingRole,
        icpSegmentId: company.icpSegments[0]?.id || 'icp-1',
        location: location.trim() || 'Unverified',
        locationVerified: Boolean(location.trim()),
        titleVerified: true,
        email: email.trim(),
        linkedinUrl: linkedinUrl.trim(),
        sourceTitle: `${company.companyName} Public Profile`,
        sourceUrl: sourceUrl.trim() || linkedinUrl.trim() || company.websiteUrl,
      });
      setFullName('');
      setJobTitle('');
      setEmail('');
      setLinkedinUrl('');
      setLocation('');
      setSourceUrl('');
      dialogRef.current?.close();
    } finally {
      setManualSubmitting(false);
    }
  };

  const booleanQuery = `site:linkedin.com/in/ "${company.companyName}" (${criteria.targetJobTitles
    .slice(0, 3)
    .map((t) => `"${t}"`)
    .join(' OR ')})`;
  const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(booleanQuery)}`;

  return (
    <section className="card" aria-labelledby="discovery-title">
      <div className="card-header" style={{ borderBottom: isExpanded ? undefined : 0 }}>
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-expanded={isExpanded}
            aria-controls="discovery-panel"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <SlidersHorizontal />
            <span id="discovery-title">Targeting</span>
            <ChevronDown style={{ transform: isExpanded ? 'rotate(180deg)' : undefined, transition: 'transform 150ms' }} />
          </button>
          <div className="hidden min-w-0 flex-wrap items-center gap-1.5 md:flex">
            {criteria.targetJobTitles.slice(0, 3).map((t) => (
              <span key={t} className="tag">
                {t}
              </span>
            ))}
            {criteria.targetJobTitles.length > 3 && (
              <span className="text-[12.5px] text-subtle">+{criteria.targetJobTitles.length - 3}</span>
            )}
            <span className="text-[12.5px] text-subtle">· {criteria.geography}</span>
          </div>
        </div>

        <div className="toolbar-group">
          <button type="button" className="btn btn-secondary" onClick={() => dialogRef.current?.showModal()}>
            <UserPlus />
            Add manually
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={isDiscovering}
            onClick={() => onRunDiscovery(criteria)}
          >
            {isDiscovering ? <span className="spinner" /> : <Search />}
            {isDiscovering ? 'Searching' : 'Find prospects'}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div id="discovery-panel" className="card-body grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="field">
            <label className="label" htmlFor="titles-input">
              Job titles
            </label>
            <input
              id="titles-input"
              className="input"
              value={titlesText}
              onChange={(e) => setTitlesText(e.target.value)}
              onBlur={() => {
                const parsed = titlesText
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean);
                if (parsed.length > 0) onUpdateCriteria({ ...criteria, targetJobTitles: parsed });
              }}
            />
            <span className="hint">Separate multiple titles with commas.</span>
          </div>

          <div className="field">
            <label className="label" htmlFor="geo-input">
              Geography
            </label>
            <input
              id="geo-input"
              className="input"
              value={criteria.geography}
              onChange={(e) => onUpdateCriteria({ ...criteria, geography: e.target.value })}
              placeholder="e.g. United States"
            />
          </div>

          <div className="field">
            <span className="label" id="seniority-label">
              Seniority
            </span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="seniority-label">
              {SENIORITY_OPTIONS.map((level) => (
                <button
                  key={level}
                  type="button"
                  className="chip"
                  aria-pressed={criteria.seniorityLevels.includes(level)}
                  onClick={() => handleToggleSeniority(level)}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label className="label" htmlFor="objective-input">
              Outreach objective
            </label>
            <input
              id="objective-input"
              className="input"
              value={criteria.connectionObjective}
              onChange={(e) => onUpdateCriteria({ ...criteria, connectionObjective: e.target.value })}
            />
          </div>

          {!capabilities?.hasAnySearchProvider && (
            <div className="callout callout-warning md:col-span-2">
              <AlertTriangle />
              <div className="flex flex-1 flex-wrap items-center justify-between gap-2">
                <span>No search API is configured, so discovery runs in manual mode.</span>
                <a className="link" href={googleSearchUrl} target="_blank" rel="noopener noreferrer">
                  Search Google for {company.companyName} profiles
                  <ExternalLink />
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {discoveryFeedback && (
        <div className="px-[18px] pb-4">
          <div className="callout">
            <Info />
            <span>{discoveryFeedback}</span>
          </div>
        </div>
      )}

      <dialog
        ref={dialogRef}
        {...({ closedby: 'any' } as React.DialogHTMLAttributes<HTMLDialogElement>)}
        aria-labelledby="manual-prospect-dialog-title"
        className="modal"
      >
        <form onSubmit={handleManualSubmit} className="contents">
          <div className="modal-header">
            <div>
              <h3 id="manual-prospect-dialog-title" className="modal-title">
                Add prospect
              </h3>
              <p className="mt-0.5 text-[13px] text-subtle">
                Add a verified contact at {company.companyName}. They’ll be scored automatically.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm"
              aria-label="Close"
              onClick={() => dialogRef.current?.close()}
            >
              <X />
            </button>
          </div>

          <div className="modal-body">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="field">
                <label className="label" htmlFor="mp-name">
                  Full name
                </label>
                <input id="mp-name" className="input" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Cooper" />
              </div>
              <div className="field">
                <label className="label" htmlFor="mp-title">
                  Job title
                </label>
                <input id="mp-title" className="input" required value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="VP of Engineering" />
              </div>
              <div className="field">
                <label className="label" htmlFor="mp-email">
                  Work email <span className="optional">(optional)</span>
                </label>
                <input id="mp-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@company.com" />
              </div>
              <div className="field">
                <label className="label" htmlFor="mp-li">
                  LinkedIn URL <span className="optional">(optional)</span>
                </label>
                <input id="mp-li" type="url" className="input" value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/in/…" />
              </div>
              <div className="field">
                <label className="label" htmlFor="mp-loc">
                  Location <span className="optional">(optional)</span>
                </label>
                <input id="mp-loc" className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="London, UK" />
              </div>
              <div className="field">
                <label className="label" htmlFor="mp-src">
                  Source URL <span className="optional">(optional)</span>
                </label>
                <input id="mp-src" type="url" className="input" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://…" />
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={() => dialogRef.current?.close()}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={manualSubmitting}>
              {manualSubmitting ? 'Adding…' : 'Add prospect'}
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
};
