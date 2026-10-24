import {
  ApiCapabilitiesStatus,
  BrevoEmailStatus,
  DiscoveryCriteria,
  Prospect,
  ResearchProject,
  SenderProfile,
} from '../types/prospectiq';

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const apiClient = {
  getStatus(): Promise<{
    ok: boolean;
    capabilities: ApiCapabilitiesStatus;
    emailStatus: BrevoEmailStatus;
  }> {
    return requestJson('/api/config/status');
  },

  saveApiKeys(keys: {
    geminiApiKey?: string;
    hunterApiKey?: string;
    serperApiKey?: string;
    tavilyApiKey?: string;
  }): Promise<{ ok: boolean; capabilities: ApiCapabilitiesStatus }> {
    return requestJson('/api/config/keys', {
      method: 'POST',
      body: JSON.stringify(keys),
    });
  },

  clearApiKey(
    keyName: 'gemini' | 'hunter' | 'serper' | 'tavily'
  ): Promise<{ ok: boolean; capabilities: ApiCapabilitiesStatus }> {
    return requestJson('/api/config/keys/clear', {
      method: 'POST',
      body: JSON.stringify({ keyName }),
    });
  },

  getProjects(): Promise<{
    ok: boolean;
    projects: ResearchProject[];
    senderProfile: SenderProfile;
  }> {
    return requestJson('/api/projects');
  },

  resetDemoProjects(): Promise<{ ok: boolean; projects: ResearchProject[] }> {
    return requestJson('/api/projects/reset-demo', { method: 'POST' });
  },

  deleteProject(projectId: string): Promise<{ ok: boolean; projects: ResearchProject[] }> {
    return requestJson(`/api/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE' });
  },

  updateSenderProfile(profile: SenderProfile): Promise<{ ok: boolean; senderProfile: SenderProfile }> {
    return requestJson('/api/sender-profile', {
      method: 'PUT',
      body: JSON.stringify(profile),
    });
  },

  researchCompany(websiteUrl: string): Promise<{
    ok: boolean;
    project: ResearchProject;
    projects: ResearchProject[];
  }> {
    return requestJson('/api/research/company', {
      method: 'POST',
      body: JSON.stringify({ websiteUrl }),
    });
  },

  updateProject(project: ResearchProject): Promise<{ ok: boolean; project: ResearchProject }> {
    return requestJson(`/api/projects/${encodeURIComponent(project.id)}`, {
      method: 'PUT',
      body: JSON.stringify(project),
    });
  },

  discoverProspects(
    projectId: string,
    criteria: DiscoveryCriteria
  ): Promise<{
    ok: boolean;
    project: ResearchProject;
    discoveredCount: number;
    providerUsed: string;
    manualModeRequired: boolean;
    message: string;
  }> {
    return requestJson(`/api/projects/${encodeURIComponent(projectId)}/discover`, {
      method: 'POST',
      body: JSON.stringify({ criteria }),
    });
  },

  addManualProspect(
    projectId: string,
    payload: {
      fullName: string;
      jobTitle: string;
      department?: string;
      buyingRole?: string;
      icpSegmentId?: string;
      location?: string;
      locationVerified?: boolean;
      titleVerified?: boolean;
      email?: string;
      linkedinUrl?: string;
      sourceTitle?: string;
      sourceUrl?: string;
    }
  ): Promise<{ ok: boolean; project: ResearchProject; prospect: Prospect }> {
    return requestJson(`/api/projects/${encodeURIComponent(projectId)}/prospects/manual`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateProspect(
    projectId: string,
    prospectId: string,
    updates: Partial<Prospect>
  ): Promise<{ ok: boolean; project: ResearchProject; prospect: Prospect }> {
    return requestJson(
      `/api/projects/${encodeURIComponent(projectId)}/prospects/${encodeURIComponent(prospectId)}`,
      {
        method: 'PUT',
        body: JSON.stringify(updates),
      }
    );
  },

  regenerateProspectOutreach(
    projectId: string,
    prospectId: string,
    tone: 'executive' | 'consultative' | 'mba'
  ): Promise<{ ok: boolean; project: ResearchProject; prospect: Prospect }> {
    return requestJson(
      `/api/projects/${encodeURIComponent(projectId)}/prospects/${encodeURIComponent(prospectId)}/regenerate`,
      {
        method: 'POST',
        body: JSON.stringify({ tone }),
      }
    );
  },

  deleteProspect(
    projectId: string,
    prospectId: string
  ): Promise<{ ok: boolean; project: ResearchProject }> {
    return requestJson(
      `/api/projects/${encodeURIComponent(projectId)}/prospects/${encodeURIComponent(prospectId)}`,
      { method: 'DELETE' }
    );
  },

  // Brevo Email Subscription APIs (matching Indian-SEPA-Screener)
  getEmailStatus(): Promise<BrevoEmailStatus> {
    return requestJson('/api/email/status');
  },

  saveBrevoConfig(sender_email: string, api_key: string): Promise<BrevoEmailStatus & { ok: boolean }> {
    return requestJson('/api/email/config', {
      method: 'POST',
      body: JSON.stringify({ sender_email, api_key }),
    });
  },

  clearBrevoConfig(): Promise<BrevoEmailStatus & { ok: boolean }> {
    return requestJson('/api/email/clear', { method: 'POST' });
  },

  updateSubscriber(
    email: string,
    action: 'add' | 'remove' | 'clear_all',
    consent = false
  ): Promise<BrevoEmailStatus & { ok: boolean }> {
    return requestJson('/api/email/subscribers', {
      method: 'POST',
      body: JSON.stringify({ email, action, consent }),
    });
  },

  setAutoAlert(enabled: boolean): Promise<BrevoEmailStatus & { ok: boolean }> {
    return requestJson('/api/email/auto-alert', {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    });
  },

  sendTestBrevoEmail(): Promise<BrevoEmailStatus & { ok: boolean; message: string }> {
    return requestJson('/api/email/test', { method: 'POST' });
  },

  sendDigestViaBrevo(
    projectId: string,
    prospectIds?: string[],
    draftMode: 'email' | 'concise' = 'email',
    targetEmail?: string
  ): Promise<{
    ok: boolean;
    message: string;
    sentCount: number;
    project: ResearchProject;
    emailStatus: BrevoEmailStatus;
  }> {
    return requestJson('/api/email/send-digest', {
      method: 'POST',
      body: JSON.stringify({ projectId, prospectIds, draftMode, targetEmail }),
    });
  },
};

function escapeCsvCell(val: unknown): string {
  const str = String(val ?? '').replace(/\r?\n/g, ' ');
  if (/[",]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportProspectsToCsv(project: ResearchProject, mode: 'audit' | 'campaign' = 'audit'): void {
  const rows: string[][] = [];

  if (mode === 'campaign') {
    rows.push([
      'FirstName',
      'LastName',
      'FullName',
      'JobTitle',
      'Company',
      'BuyingRole',
      'Email',
      'LinkedInProfileURL',
      'RelevanceScore',
      'EmailSubject',
      'EmailBody',
      'ShortOutreachNote',
      'OutreachStatus',
    ]);
    for (const p of project.prospects) {
      const parts = p.fullName.trim().split(/\s+/);
      const firstName = parts[0] || '';
      const lastName = parts.slice(1).join(' ') || '';
      rows.push([
        firstName,
        lastName,
        p.fullName,
        p.jobTitle,
        p.companyName,
        p.buyingRole,
        p.email || 'Unverified',
        p.linkedinUrl || 'Unverified',
        String(p.score.totalScore),
        p.emailSubject,
        p.emailBody,
        p.connectionDraft,
        p.outreachStatus,
      ]);
    }
  } else {
    rows.push([
      'Company',
      'Website',
      'Prospect Name',
      'Job Title',
      'Title Verified',
      'Seniority',
      'Buying Committee Role',
      'Location',
      'Location Verified',
      'Email',
      'Public LinkedIn URL',
      'Total Score (/100)',
      'Title Score (/35)',
      'Seniority Score (/25)',
      'Industry Score (/20)',
      'Objective Score (/20)',
      'Score Justification',
      'Email Subject',
      'Personalized Email Body',
      'Concise Note (<=300 chars)',
      'Outreach Status',
      'Research Sources',
      'Data Provenance',
    ]);
    for (const p of project.prospects) {
      const reasons = `${p.score.reasons.titleReason} | ${p.score.reasons.seniorityReason} | ${p.score.reasons.industryReason} | ${p.score.reasons.objectiveReason}`;
      const sourcesList = p.sources.map((s) => `${s.provider}: ${s.url}`).join(' ; ');
      rows.push([
        project.company.companyName,
        project.company.websiteUrl,
        p.fullName,
        p.jobTitle,
        p.titleVerified ? 'Verified' : 'Unverified',
        p.seniority,
        p.buyingRole,
        p.location,
        p.locationVerified ? 'Verified' : 'Unverified',
        p.email || 'Unverified',
        p.linkedinUrl || 'Unverified',
        String(p.score.totalScore),
        String(p.score.titleRelevance),
        String(p.score.seniorityFit),
        String(p.score.industryFit),
        String(p.score.objectiveAlignment),
        reasons,
        p.emailSubject,
        p.emailBody,
        p.connectionDraft,
        p.outreachStatus,
        sourcesList,
        p.provenance,
      ]);
    }
  }

  const csvString = rows.map((r) => r.map(escapeCsvCell).join(',')).join('\r\n');
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const slug = project.company.companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  link.href = url;
  link.download = `prospectiq-${slug}-${mode}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
