import { Router, Request, Response } from 'express';
import { storage } from '../storage.js';
import { getSafeApiCapabilities, saveServerApiKeys, clearServerApiKey } from '../config.js';
import { brevoEmailService } from '../services/brevoEmail.js';
import { researchCompanyByUrl } from '../services/companyResearch.js';
import { discoverProspectsForProject } from '../services/prospectDiscovery.js';
import { calculateProspectScore, inferBuyingRole, inferSeniorityLevel } from '../services/scoringEngine.js';
import {
  evaluateMessageQuality,
  generateAiOutreachForProspect,
  generateDeterministicOutreach,
} from '../services/messageGenerator.js';
import { DiscoveryCriteria, Prospect, ResearchProject } from '../../src/types/prospectiq.js';

export const apiRouter = Router();

// 1. Health & Safe API Capability Status
apiRouter.get('/config/status', (_req: Request, res: Response) => {
  const emailStatus = brevoEmailService.getStatus();
  const capabilities = getSafeApiCapabilities(emailStatus.ready, emailStatus.subscribers);
  res.json({
    ok: true,
    capabilities,
    emailStatus,
  });
});

// Save Server API Keys from UI
apiRouter.post('/config/keys', (req: Request, res: Response) => {
  try {
    saveServerApiKeys({
      geminiApiKey: req.body?.geminiApiKey,
      hunterApiKey: req.body?.hunterApiKey,
      serperApiKey: req.body?.serperApiKey,
      tavilyApiKey: req.body?.tavilyApiKey,
    });
    const emailStatus = brevoEmailService.getStatus();
    const capabilities = getSafeApiCapabilities(emailStatus.ready, emailStatus.subscribers);
    res.json({ ok: true, capabilities });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Could not save API keys' });
  }
});

apiRouter.post('/config/keys/clear', (req: Request, res: Response) => {
  const keyName = req.body?.keyName;
  if (['gemini', 'hunter', 'serper', 'tavily'].includes(keyName)) {
    clearServerApiKey(keyName);
  }
  const emailStatus = brevoEmailService.getStatus();
  const capabilities = getSafeApiCapabilities(emailStatus.ready, emailStatus.subscribers);
  res.json({ ok: true, capabilities });
});

// 2. Projects & Sender Profile CRUD
apiRouter.get('/projects', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    projects: storage.getAllProjects(),
    senderProfile: storage.getSenderProfile(),
  });
});

apiRouter.post('/projects/reset-demo', (_req: Request, res: Response) => {
  const projects = storage.resetDemoProjects();
  res.json({ ok: true, projects });
});

apiRouter.delete('/projects/:id', (req: Request, res: Response) => {
  storage.deleteProject(String(req.params.id));
  res.json({ ok: true, projects: storage.getAllProjects() });
});

apiRouter.put('/sender-profile', (req: Request, res: Response) => {
  try {
    const updated = storage.updateSenderProfile(req.body);
    res.json({ ok: true, senderProfile: updated });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid sender profile' });
  }
});

// 3. Step 1: Company Research by Website URL
apiRouter.post('/research/company', async (req: Request, res: Response) => {
  try {
    const websiteUrl = String(req.body?.websiteUrl || '').trim();
    const companySummary = await researchCompanyByUrl(websiteUrl);

    const defaultTitles = companySummary.icpSegments.flatMap((s) => s.targetRoles).slice(0, 5);
    const defaultCriteria: DiscoveryCriteria = {
      targetJobTitles:
        defaultTitles.length > 0
          ? defaultTitles
          : ['Vice President of Engineering', 'Chief Technology Officer', 'VP of Product', 'Director of Security'],
      seniorityLevels: ['C-Suite', 'VP', 'Director'],
      targetIndustry: companySummary.industry,
      geography:
        companySummary.headquarters !== 'Unverified' ? companySummary.headquarters : 'United States / Global',
      connectionObjective: storage.getSenderProfile().defaultObjective,
    };

    const newProject: ResearchProject = {
      id: `proj-${Date.now()}`,
      name: companySummary.companyName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDemo: false,
      company: companySummary,
      criteria: defaultCriteria,
      prospects: [],
    };

    storage.saveProject(newProject);
    res.json({ ok: true, project: newProject, projects: storage.getAllProjects() });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Could not research company URL' });
  }
});

// Update / Inline Edit Company Research Summary or Discovery Criteria
apiRouter.put('/projects/:id', (req: Request, res: Response) => {
  const existing = storage.getProjectById(String(req.params.id));
  if (!existing) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  const updated: ResearchProject = {
    ...existing,
    ...req.body,
    id: existing.id,
    updatedAt: new Date().toISOString(),
  };
  storage.saveProject(updated);
  res.json({ ok: true, project: updated });
});

// 4. Step 2: Automated Waterfall Prospect Discovery
apiRouter.post('/projects/:id/discover', async (req: Request, res: Response) => {
  try {
    const project = storage.getProjectById(String(req.params.id));
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    if (req.body?.criteria) {
      project.criteria = req.body.criteria;
    }

    const sender = storage.getSenderProfile();
    const result = await discoverProspectsForProject({
      projectId: project.id,
      company: project.company,
      criteria: project.criteria,
      sender,
    });

    if (result.prospects.length > 0) {
      // Merge avoiding duplicate names
      for (const np of result.prospects) {
        if (!project.prospects.some((ep) => ep.fullName.toLowerCase() === np.fullName.toLowerCase())) {
          project.prospects.push(np);
        }
      }
      project.prospects.sort((a, b) => b.score.totalScore - a.score.totalScore);
      storage.saveProject(project);
      brevoEmailService.queueHighFitProspectsAlert(project, result.prospects);
    } else {
      storage.saveProject(project);
    }

    res.json({
      ok: true,
      project,
      discoveredCount: result.prospects.length,
      providerUsed: result.providerUsed,
      manualModeRequired: result.manualModeRequired,
      message: result.message,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Discovery failed' });
  }
});

// 5. Manual Prospect Addition (with Automatic 100-Pt Scoring & Personalized Outreach Draft)
apiRouter.post('/projects/:id/prospects/manual', (req: Request, res: Response) => {
  try {
    const project = storage.getProjectById(String(req.params.id));
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const fullName = String(req.body?.fullName || '').trim();
    const jobTitle = String(req.body?.jobTitle || '').trim();
    if (!fullName || !jobTitle) {
      res.status(400).json({ error: 'Prospect name and job title are required' });
      return;
    }

    const rawLinkedin = String(req.body?.linkedinUrl || '').trim();
    const validLinkedin =
      rawLinkedin && /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\//i.test(rawLinkedin) ? rawLinkedin : null;
    const rawEmail = String(req.body?.email || '').trim();
    const validEmail = rawEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) ? rawEmail : null;
    const rawSourceUrl = String(req.body?.sourceUrl || '').trim() || validLinkedin || project.company.websiteUrl;
    const location = String(req.body?.location || '').trim() || 'Unverified';
    const locationVerified = Boolean(req.body?.locationVerified && location !== 'Unverified');

    const seniority = inferSeniorityLevel(jobTitle);
    const buyingRole = req.body?.buyingRole || inferBuyingRole(jobTitle, seniority);
    const icpSegmentId = req.body?.icpSegmentId || project.company.icpSegments[0]?.id || 'icp-1';

    const score = calculateProspectScore({
      jobTitle,
      seniority,
      company: project.company,
      criteria: project.criteria,
      hasVerifiedLinkedin: Boolean(validLinkedin),
      hasVerifiedEmail: Boolean(validEmail),
      sourcesCount: 1,
    });

    const sender = storage.getSenderProfile();
    const outreach = generateDeterministicOutreach({
      prospectName: fullName,
      jobTitle,
      company: project.company,
      criteria: project.criteria,
      sender,
    });

    const newProspect: Prospect = {
      id: `pros-manual-${Date.now()}`,
      projectId: project.id,
      fullName,
      jobTitle,
      seniority,
      department: String(req.body?.department || 'Leadership'),
      icpSegmentId,
      buyingRole,
      companyName: project.company.companyName,
      location,
      locationVerified,
      titleVerified: Boolean(req.body?.titleVerified ?? true),
      email: validEmail,
      emailVerified: Boolean(validEmail),
      linkedinUrl: validLinkedin,
      linkedinVerified: Boolean(validLinkedin),
      sources: [
        {
          title: String(req.body?.sourceTitle || `Manual Verified Research — ${fullName}`),
          url: rawSourceUrl,
          provider: 'Manual Verified',
          snippet: `${fullName}, ${jobTitle} at ${project.company.companyName}`,
          verifiedAt: new Date().toISOString().slice(0, 10),
        },
      ],
      score,
      selectedSignalId: project.company.buyingSignals[0]?.id,
      emailSubject: outreach.emailSubject,
      emailBody: outreach.emailBody,
      connectionDraft: outreach.connectionDraft,
      qualityReport: outreach.qualityReport,
      outreachStatus: 'Draft Ready',
      provenance: 'MANUAL_ENTRY',
      updatedAt: new Date().toISOString(),
    };

    project.prospects.unshift(newProspect);
    project.prospects.sort((a, b) => b.score.totalScore - a.score.totalScore);
    storage.saveProject(project);
    brevoEmailService.queueHighFitProspectsAlert(project, [newProspect]);

    res.json({ ok: true, project, prospect: newProspect });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to add manual prospect' });
  }
});

// 6. Update Prospect (Status, Draft Edit, Re-Score, or Regenerate Draft)
apiRouter.put('/projects/:id/prospects/:prospectId', (req: Request, res: Response) => {
  const project = storage.getProjectById(String(req.params.id));
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  const existing = project.prospects.find((p) => p.id === String(req.params.prospectId));
  if (!existing) {
    res.status(404).json({ error: 'Prospect not found' });
    return;
  }

  const updated: Prospect = {
    ...existing,
    ...req.body,
    id: existing.id,
    projectId: project.id,
    updatedAt: new Date().toISOString(),
  };

  updated.qualityReport = evaluateMessageQuality(updated.connectionDraft, updated.emailBody, project.company);
  const updatedProject = storage.updateProspectInProject(project.id, updated);
  res.json({ ok: true, project: updatedProject, prospect: updated });
});

apiRouter.post('/projects/:id/prospects/:prospectId/regenerate', async (req: Request, res: Response) => {
  try {
    const project = storage.getProjectById(String(req.params.id));
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    const prospect = project.prospects.find((p) => p.id === String(req.params.prospectId));
    if (!prospect) {
      res.status(404).json({ error: 'Prospect not found' });
      return;
    }

    const tone = req.body?.tone || 'executive';
    const sender = storage.getSenderProfile();
    const generated = await generateAiOutreachForProspect({
      prospect,
      company: project.company,
      criteria: project.criteria,
      sender,
      tone,
    });

    prospect.emailSubject = generated.emailSubject;
    prospect.emailBody = generated.emailBody;
    prospect.connectionDraft = generated.connectionDraft;
    prospect.qualityReport = generated.qualityReport;
    prospect.updatedAt = new Date().toISOString();

    const updatedProject = storage.updateProspectInProject(project.id, prospect);
    res.json({ ok: true, project: updatedProject, prospect });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to regenerate outreach' });
  }
});

apiRouter.delete('/projects/:id/prospects/:prospectId', (req: Request, res: Response) => {
  const updatedProject = storage.deleteProspect(String(req.params.id), String(req.params.prospectId));
  if (!updatedProject) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.json({ ok: true, project: updatedProject });
});

// ============================================================================
// 7. Brevo Email Subscription & Transactional Dispatch Routes
//    (Matching Indian-SEPA-Screener /api/email/* contract + digest dispatch)
// ============================================================================

apiRouter.get('/email/status', (_req: Request, res: Response) => {
  res.json(brevoEmailService.getStatus());
});

apiRouter.post('/email/config', (req: Request, res: Response) => {
  try {
    const senderEmail = String(req.body?.sender_email || '');
    const apiKey = String(req.body?.api_key || '');
    const status = brevoEmailService.saveConfig(senderEmail, apiKey);
    res.json({ ok: true, ...status });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Could not save Brevo settings' });
  }
});

apiRouter.post('/email/clear', (_req: Request, res: Response) => {
  try {
    const status = brevoEmailService.clearConfig();
    res.json({ ok: true, ...status });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Could not clear credentials' });
  }
});

apiRouter.post('/email/subscribers', (req: Request, res: Response) => {
  try {
    const email = String(req.body?.email || '');
    const rawAction = req.body?.action;
    const action = rawAction === 'remove' ? 'remove' : rawAction === 'clear_all' ? 'clear_all' : 'add';
    const consent = Boolean(req.body?.consent);
    const status = brevoEmailService.updateSubscriber(email, action, consent);
    res.json({ ok: true, ...status });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Could not update subscriber' });
  }
});

apiRouter.post('/email/auto-alert', (req: Request, res: Response) => {
  const status = brevoEmailService.setAutoAlert(Boolean(req.body?.enabled));
  res.json({ ok: true, ...status });
});

apiRouter.post('/email/test', async (_req: Request, res: Response) => {
  try {
    const result = await brevoEmailService.sendTestEmail();
    res.json({ ok: true, ...result.status, message: result.message });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Test email failed' });
  }
});

apiRouter.post('/email/send-digest', async (req: Request, res: Response) => {
  try {
    const projectId = String(req.body?.projectId || '');
    const prospectIds = Array.isArray(req.body?.prospectIds) ? req.body.prospectIds.map(String) : undefined;
    const draftMode = req.body?.draftMode === 'concise' ? 'concise' : 'email';
    const targetEmail = req.body?.targetEmail ? String(req.body.targetEmail).trim() : undefined;
    const project = storage.getProjectById(projectId);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    // Only auto-subscribe a prospect's email when sending to a single individual prospect (not full company digest)
    if (prospectIds && prospectIds.length === 1) {
      const singleProspect = project.prospects.find((p) => p.id === prospectIds[0]);
      if (singleProspect?.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(singleProspect.email)) {
        try {
          brevoEmailService.updateSubscriber(singleProspect.email, 'add', true);
        } catch {
          // ignore if invalid
        }
      }
    }

    const result = await brevoEmailService.sendDigestToSubscribers(
      project,
      prospectIds,
      draftMode,
      targetEmail
    );

    // Mark dispatched prospects as 'Sent via Brevo'
    const nowIso = new Date().toISOString();
    for (const p of project.prospects) {
      if (!prospectIds || prospectIds.length === 0 || prospectIds.includes(p.id)) {
        p.outreachStatus = 'Sent via Brevo';
        p.lastEmailedAt = nowIso;
      }
    }
    storage.saveProject(project);

    res.json({
      ok: true,
      message: result.message,
      sentCount: result.sentCount,
      project,
      emailStatus: result.status,
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to dispatch Brevo digest' });
  }
});
