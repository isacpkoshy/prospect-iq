import React, { useState } from 'react';
import {
  Download,
  ExternalLink,
  Copy,
  Check,
  Send,
  Users,
  Mail,
  ChevronRight,
} from 'lucide-react';
import { OutreachStatus, Prospect, ResearchProject } from '../types/prospectiq';
import { exportProspectsToCsv } from '../services/apiClient';

interface OutreachTrackerProps {
  project: ResearchProject;
  selectedProspect: Prospect | null;
  onSelectProspect: (prospect: Prospect) => void;
  onUpdateProspectStatus: (prospectId: string, status: OutreachStatus) => Promise<void>;
  onDeleteProspect: (prospectId: string) => Promise<void>;
  onSendProspectsViaBrevo: (prospectIds: string[]) => Promise<void>;
  isSendingBrevo: boolean;
}

const STATUS_OPTIONS: OutreachStatus[] = [
  'Researched',
  'Draft Ready',
  'Sent via Brevo',
  'Accepted',
  'Follow-up Needed',
];

function statusBadgeClass(status: OutreachStatus): string {
  switch (status) {
    case 'Draft Ready':
      return 'badge-accent';
    case 'Sent via Brevo':
    case 'Accepted':
      return 'badge-success';
    case 'Follow-up Needed':
      return 'badge-warning';
    default:
      return 'badge-outline';
  }
}

export const OutreachTracker: React.FC<OutreachTrackerProps> = ({
  project,
  selectedProspect,
  onSelectProspect,
  onUpdateProspectStatus,
  onSendProspectsViaBrevo,
  isSendingBrevo,
}) => {
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredProspects = project.prospects.filter((p) => {
    if (statusFilter !== 'ALL' && p.outreachStatus !== statusFilter) return false;
    return true;
  });

  const handleCopy = (e: React.MouseEvent, prospect: Prospect) => {
    e.stopPropagation();
    navigator.clipboard.writeText(prospect.connectionDraft);
    setCopiedId(prospect.id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  return (
    <section className="card" aria-labelledby="tracker-heading">
      <div className="card-header">
        <div className="flex items-center gap-2">
          <h2 id="tracker-heading" className="card-title">
            Decision-makers
          </h2>
          <span className="badge">{filteredProspects.length}</span>
        </div>

        <div className="toolbar-group">
          <label htmlFor="status-filter" className="sr-only">
            Filter by status
          </label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="select select-sm"
            style={{ width: 'auto' }}
          >
            <option value="ALL">All statuses ({project.prospects.length})</option>
            {STATUS_OPTIONS.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>

          <button
            type="button"
            disabled={isSendingBrevo || filteredProspects.length === 0}
            onClick={() => onSendProspectsViaBrevo(filteredProspects.map((p) => p.id))}
            className="btn btn-secondary btn-sm"
          >
            <Send />
            {isSendingBrevo ? 'Sending…' : 'Email all'}
          </button>

          <button
            type="button"
            onClick={() => exportProspectsToCsv(project, 'audit')}
            className="btn btn-secondary btn-sm"
          >
            <Download />
            Export CSV
          </button>
        </div>
      </div>

      <div
        tabIndex={0}
        role="region"
        aria-labelledby="tracker-heading"
        className="table-wrapper"
      >
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col" style={{ width: '34%' }}>Person &amp; role</th>
              <th scope="col" style={{ width: '18%' }}>Fit score</th>
              <th scope="col" style={{ width: '32%' }}>Personalized outreach draft</th>
              <th scope="col" style={{ width: '16%', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredProspects.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <div className="empty">
                    <div className="empty-icon">
                      <Users className="h-5 w-5" />
                    </div>
                    <div className="empty-title">No decision-makers found</div>
                    <p className="empty-text">
                      Click <strong>Find prospects</strong> above to search for leaders matching your targeting criteria, or add them manually.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredProspects.map((prospect) => {
                const isSelected = selectedProspect?.id === prospect.id;
                const score = prospect.score.totalScore;
                const fillClass = score >= 85 ? '' : score >= 70 ? 'mid' : 'low';

                return (
                  <tr
                    key={prospect.id}
                    onClick={() => onSelectProspect(prospect)}
                    aria-selected={isSelected}
                  >
                    <td data-label="Person & role">
                      <div className="flex items-start gap-3">
                        <div className="avatar" aria-hidden="true">
                          {prospect.fullName
                            .split(/\s+/)
                            .slice(0, 2)
                            .map((w) => w[0]?.toUpperCase() || '')
                            .join('')}
                        </div>
                        <div className="min-w-0">
                          <div className="cell-primary flex items-center gap-2">
                            <span className="truncate">{prospect.fullName}</span>
                            <span className={`badge ${statusBadgeClass(prospect.outreachStatus)}`}>
                              {prospect.outreachStatus}
                            </span>
                          </div>
                          <div className="cell-secondary truncate">{prospect.jobTitle}</div>
                          <div
                            className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-subtle"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span>{prospect.companyName}</span>
                            {prospect.email && (
                              <>
                                <span>·</span>
                                <span className="inline-flex items-center gap-1 font-mono-tabular">
                                  <Mail className="h-3 w-3 text-muted" />
                                  {prospect.email}
                                </span>
                              </>
                            )}
                            {prospect.linkedinUrl && (
                              <>
                                <span>·</span>
                                <a
                                  href={prospect.linkedinUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="link link-muted"
                                >
                                  LinkedIn
                                  <ExternalLink />
                                </a>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td data-label="Fit score">
                      <div className="flex flex-col gap-1">
                        <div className="score">
                          <span className="tabular">{score}</span>
                          <span className="text-subtle font-normal">/ 100</span>
                          <div className="score-track" aria-hidden="true">
                            <div
                              className={`score-fill ${fillClass}`}
                              style={{ width: `${Math.min(100, Math.max(8, score))}%` }}
                            />
                          </div>
                        </div>
                        <div className="text-[11.5px] text-subtle">
                          {prospect.buyingRole}
                        </div>
                      </div>
                    </td>

                    <td data-label="Draft">
                      <div className="max-w-md">
                        <div className="truncate text-[12.5px] font-medium text-muted">
                          {prospect.emailSubject}
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-[12.5px] text-subtle leading-relaxed">
                          {prospect.connectionDraft}
                        </p>
                      </div>
                    </td>

                    <td data-label="Actions" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <select
                          value={prospect.outreachStatus}
                          onChange={(e) =>
                            onUpdateProspectStatus(prospect.id, e.target.value as OutreachStatus)
                          }
                          aria-label={`Status for ${prospect.fullName}`}
                          className="select select-sm"
                          style={{ width: 'auto' }}
                        >
                          {STATUS_OPTIONS.map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={(e) => handleCopy(e, prospect)}
                          className="btn btn-secondary btn-sm btn-icon"
                          title="Copy draft"
                          aria-label="Copy draft"
                        >
                          {copiedId === prospect.id ? (
                            <Check className="text-emerald-500" />
                          ) : (
                            <Copy />
                          )}
                        </button>

                        <button
                          type="button"
                          disabled={isSendingBrevo}
                          onClick={() => onSendProspectsViaBrevo([prospect.id])}
                          className="btn btn-secondary btn-sm"
                        >
                          <Send />
                          Email
                        </button>

                        <button
                          type="button"
                          onClick={() => onSelectProspect(prospect)}
                          className="btn btn-ghost btn-sm btn-icon"
                          title="Inspect score breakdown & edit message"
                          aria-label="Inspect prospect details"
                        >
                          <ChevronRight />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};
