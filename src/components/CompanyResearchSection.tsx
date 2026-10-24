import React, { useState, useEffect } from 'react';
import { ExternalLink, Pencil, Check, X, ArrowRight } from 'lucide-react';
import { CompanySummary, ResearchProject } from '../types/prospectiq';

interface CompanyResearchSectionProps {
  project: ResearchProject;
  onUpdateCompanySummary: (updated: CompanySummary) => Promise<void>;
  onSelectIcpForDiscovery: (icpId: string, roles: string[]) => void;
}

function initials(name: string): string {
  return name
    .replace(/\(.*?\)/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');
}

export const CompanyResearchSection: React.FC<CompanyResearchSectionProps> = ({
  project,
  onUpdateCompanySummary,
  onSelectIcpForDiscovery,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<CompanySummary>(project.company);
  const [productsText, setProductsText] = useState(project.company.productsAndServices.join(', '));

  useEffect(() => {
    setDraft(project.company);
    setProductsText(project.company.productsAndServices.join(', '));
    setIsEditing(false);
  }, [project.id, project.company]);

  const handleSave = async () => {
    await onUpdateCompanySummary({
      ...draft,
      productsAndServices: productsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      lastEditedByUser: true,
    });
    setIsEditing(false);
  };

  const { company, prospects } = project;
  const avgScore =
    prospects.length > 0
      ? Math.round(prospects.reduce((sum, p) => sum + p.score.totalScore, 0) / prospects.length)
      : 0;
  const draftsReady = prospects.filter((p) => p.outreachStatus === 'Draft Ready').length;
  const sent = prospects.filter((p) => p.outreachStatus === 'Sent via Brevo' || p.outreachStatus === 'Accepted').length;

  return (
    <>
      {/* Account header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <div className="avatar avatar-lg" aria-hidden="true">
            {initials(company.companyName)}
          </div>
          <div className="min-w-0">
            {isEditing ? (
              <input
                className="input"
                style={{ fontSize: 18, fontWeight: 600, height: 38 }}
                value={draft.companyName}
                onChange={(e) => setDraft({ ...draft, companyName: e.target.value })}
                aria-label="Company name"
              />
            ) : (
              <h1 className="truncate text-[22px] font-semibold">{company.companyName}</h1>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
              <a className="link link-muted" href={company.websiteUrl} target="_blank" rel="noopener noreferrer">
                {company.domain}
                <ExternalLink />
              </a>
              <span aria-hidden="true" className="text-subtle">·</span>
              <span>{company.industry}</span>
              {company.headquarters && company.headquarters !== 'Unverified' && (
                <>
                  <span aria-hidden="true" className="text-subtle">·</span>
                  <span>{company.headquarters}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setDraft(company);
                  setProductsText(company.productsAndServices.join(', '));
                  setIsEditing(false);
                }}
              >
                <X />
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={handleSave}>
                <Check />
                Save changes
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-secondary" onClick={() => setIsEditing(true)}>
              <Pencil />
              Edit account
            </button>
          )}
        </div>
      </header>

      {/* KPIs */}
      <section className="stats" aria-label="Account metrics">
        <div className="stat">
          <div className="stat-label">Decision-makers</div>
          <div className="stat-value">{prospects.length}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Average fit score</div>
          <div className="stat-value">
            {avgScore}
            <small>/100</small>
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Drafts ready</div>
          <div className="stat-value">{draftsReady}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Contacted</div>
          <div className="stat-value">{sent}</div>
        </div>
      </section>

      {/* Overview + details */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="card" aria-labelledby="overview-title">
          <div className="card-header">
            <h2 id="overview-title" className="card-title">
              Overview
            </h2>
            {company.lastEditedByUser && <span className="badge">Edited</span>}
          </div>
          <div className="card-body flex flex-col gap-5">
            {isEditing ? (
              <div className="field">
                <label className="label" htmlFor="overview-input">
                  Summary
                </label>
                <textarea
                  id="overview-input"
                  className="textarea"
                  rows={4}
                  value={draft.overview}
                  onChange={(e) => setDraft({ ...draft, overview: e.target.value })}
                />
              </div>
            ) : (
              <p className="text-[14px] leading-relaxed">{company.overview}</p>
            )}

            <div>
              <div className="mb-2 text-[12.5px] font-medium text-subtle">Products &amp; services</div>
              {isEditing ? (
                <input
                  className="input"
                  value={productsText}
                  onChange={(e) => setProductsText(e.target.value)}
                  aria-label="Products and services, comma separated"
                />
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {company.productsAndServices.slice(0, 6).map((prod, idx) => (
                    <span key={idx} className="tag">
                      {prod}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {company.icpSegments.length > 0 && (
              <div>
                <div className="mb-2 text-[12.5px] font-medium text-subtle">Ideal customer profiles</div>
                <div className="list">
                  {company.icpSegments.map((seg) => {
                    const active = project.criteria.selectedIcpSegmentId === seg.id;
                    return (
                      <div key={seg.id} className="list-row" style={{ alignItems: 'flex-start', padding: '10px 12px' }}>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 font-medium">
                            {seg.name.replace(/^ICP \d+:\s*/, '')}
                            {active && <span className="badge badge-accent">Targeting</span>}
                          </div>
                          <div className="mt-0.5 text-[12.5px] text-subtle">{seg.targetRoles.join(' · ')}</div>
                        </div>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => onSelectIcpForDiscovery(seg.id, seg.targetRoles)}
                        >
                          Target
                          <ArrowRight />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>

        <aside className="card" aria-labelledby="details-title">
          <div className="card-header">
            <h2 id="details-title" className="card-title">
              Details
            </h2>
          </div>
          <div className="card-body">
            {isEditing ? (
              <div className="flex flex-col gap-3">
                <div className="field">
                  <label className="label" htmlFor="industry-input">
                    Industry
                  </label>
                  <input
                    id="industry-input"
                    className="input"
                    value={draft.industry}
                    onChange={(e) => setDraft({ ...draft, industry: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label className="label" htmlFor="hq-input">
                    Headquarters
                  </label>
                  <input
                    id="hq-input"
                    className="input"
                    value={draft.headquarters}
                    onChange={(e) => setDraft({ ...draft, headquarters: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label className="label" htmlFor="bm-input">
                    Business model
                  </label>
                  <input
                    id="bm-input"
                    className="input"
                    value={draft.businessModel}
                    onChange={(e) => setDraft({ ...draft, businessModel: e.target.value })}
                  />
                </div>
              </div>
            ) : (
              <dl className="kv">
                <dt>Industry</dt>
                <dd>{company.industry}</dd>
                <dt>Headquarters</dt>
                <dd>{company.headquarters || '—'}</dd>
                <dt>Company size</dt>
                <dd>{company.employeeRange || '—'}</dd>
                <dt>Business model</dt>
                <dd>{company.businessModel}</dd>
                <dt>Sources</dt>
                <dd className="flex flex-col gap-1">
                  {company.sources.map((src, idx) => (
                    <a key={idx} className="link" href={src.url} target="_blank" rel="noopener noreferrer">
                      {src.provider}
                      <ExternalLink />
                    </a>
                  ))}
                </dd>
                <dt>Data</dt>
                <dd>
                  {project.isDemo ? (
                    <span className="badge badge-warning">Demo sample</span>
                  ) : (
                    <span className="badge badge-success badge-dot">Live research</span>
                  )}
                </dd>
              </dl>
            )}
          </div>
        </aside>
      </div>
    </>
  );
};
