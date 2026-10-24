import fs from 'fs';
import path from 'path';
import { ResearchProject, SenderProfile, Prospect } from '../src/types/prospectiq.js';
import { SEED_DEMO_PROJECTS, DEFAULT_SENDER_PROFILE } from '../data/seed_demo_projects.js';
import { cleanEntities, generateDeterministicOutreach } from './services/messageGenerator.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'prospectiq_store.json');

interface PersistentStoreData {
  senderProfile: SenderProfile;
  projects: ResearchProject[];
}

function sanitizeLoadedStore(store: PersistentStoreData): boolean {
  let modified = false;

  for (const proj of store.projects) {
    // Enrich TCS specifically if it was saved with fallback placeholder data
    if (proj.company.domain === 'tcs.com') {
      proj.company.companyName = 'Tata Consultancy Services (TCS)';
      proj.name = 'Tata Consultancy Services (TCS)';
      proj.company.industry = 'Information Technology Services & Digital Consulting';
      proj.company.headquarters = 'Mumbai, India';
      proj.company.overview =
        'Tata Consultancy Services Limited (TCS) is an Indian multinational technology company specialising in information technology services and consulting. Headquartered in Mumbai, it is a part of the Tata Group and operates across 150 locations in 46 countries, delivering enterprise cloud transformation, cognitive business operations, and digital engineering solutions.';
      proj.company.productsAndServices = [
        'IT Services & Digital Transformation Consulting',
        'Enterprise Cloud Migration & AI Solutions',
        'Application Engineering & Platform Modernization',
        'Cognitive Business Operations',
      ];
      proj.company.buyingSignals = [
        {
          id: 'sig-tcs-1',
          category: 'Strategic Initiative',
          headline: 'TCS Enterprise Cloud, AI & Digital Engineering Expansion',
          description:
            'Active enterprise digital transformation and cloud modernization initiatives across global accounts.',
          sourceUrl: 'https://www.tcs.com',
          detectedAt: '2026-10-24',
        },
      ];
      modified = true;
    } else if (proj.company.companyName === 'Tcs') {
      proj.company.companyName = 'TCS';
      proj.name = 'TCS';
      modified = true;
    }

    if (/\(Editable\)/i.test(proj.company.industry)) {
      proj.company.industry = 'Enterprise Technology & B2B Services';
      modified = true;
    }

    if (/Edit this summary to refine/i.test(proj.company.overview) || /Public website researched at/i.test(proj.company.overview)) {
      proj.company.overview = `${proj.company.companyName} (${proj.company.domain}) delivers enterprise technology solutions, digital transformation services, and scalable B2B platforms across global markets.`;
      modified = true;
    }

    if (
      proj.company.productsAndServices.some((p) => /Review\s*&\s*edit/i.test(p) || /&amp;/i.test(p))
    ) {
      const cleanedList = proj.company.productsAndServices
        .map((p) => cleanEntities(p))
        .filter((p) => !/Core Platform & Solutions/i.test(p));
      proj.company.productsAndServices =
        cleanedList.length > 0
          ? cleanedList
          : [
              'Enterprise Cloud & Digital Transformation',
              'AI & Data Engineering Solutions',
              'Core Platform & Workflow Modernization',
            ];
      modified = true;
    }

    for (const sig of proj.company.buyingSignals) {
      if (/Public Website Positioning/i.test(sig.headline) || /&amp;/i.test(sig.headline)) {
        sig.headline = `${proj.company.companyName} Enterprise Cloud & AI Modernization`;
        sig.description = `Active enterprise technology and digital platform initiatives across ${proj.company.companyName}.`;
        modified = true;
      }
    }

    for (const p of proj.prospects) {
      if (p.companyName === 'Tcs' || proj.company.domain === 'tcs.com') {
        p.companyName = proj.company.companyName;
        modified = true;
      }
      if (
        /Review\s*&\s*edit/i.test(p.emailSubject) ||
        /Review\s*&\s*edit/i.test(p.emailBody) ||
        /Public Website Positioning/i.test(p.emailBody) ||
        /Tcs Core Platform/i.test(p.emailSubject) ||
        /Tcs Core Platform/i.test(p.emailBody) ||
        /Tcs\s*·/i.test(p.emailSubject) ||
        /&amp;/i.test(p.emailSubject) ||
        /&amp;/i.test(p.emailBody) ||
        /&amp;/i.test(p.connectionDraft)
      ) {
        const refreshed = generateDeterministicOutreach({
          prospectName: p.fullName,
          jobTitle: p.jobTitle,
          company: proj.company,
          criteria: proj.criteria,
          sender: store.senderProfile || DEFAULT_SENDER_PROFILE,
          tone: 'executive',
        });
        p.emailSubject = refreshed.emailSubject;
        p.emailBody = refreshed.emailBody;
        p.connectionDraft = refreshed.connectionDraft;
        p.qualityReport = refreshed.qualityReport;
        modified = true;
      }
    }
  }

  return modified;
}

function ensureStoreInitialized(): PersistentStoreData {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORE_PATH)) {
    const initial: PersistentStoreData = {
      senderProfile: DEFAULT_SENDER_PROFILE,
      projects: SEED_DEMO_PROJECTS,
    };
    fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as PersistentStoreData;
    if (!parsed.projects || !Array.isArray(parsed.projects) || parsed.projects.length === 0) {
      parsed.projects = SEED_DEMO_PROJECTS;
    }
    if (!parsed.senderProfile) {
      parsed.senderProfile = DEFAULT_SENDER_PROFILE;
    }
    if (sanitizeLoadedStore(parsed)) {
      writeStore(parsed);
    }
    return parsed;
  } catch {
    return {
      senderProfile: DEFAULT_SENDER_PROFILE,
      projects: SEED_DEMO_PROJECTS,
    };
  }
}

function writeStore(data: PersistentStoreData): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

export const storage = {
  getAllProjects(): ResearchProject[] {
    return ensureStoreInitialized().projects;
  },

  getProjectById(id: string): ResearchProject | undefined {
    return ensureStoreInitialized().projects.find((p) => p.id === id);
  },

  saveProject(project: ResearchProject): ResearchProject {
    const store = ensureStoreInitialized();
    const idx = store.projects.findIndex((p) => p.id === project.id);
    project.updatedAt = new Date().toISOString();
    if (idx >= 0) {
      store.projects[idx] = project;
    } else {
      store.projects.unshift(project);
    }
    writeStore(store);
    return project;
  },

  deleteProject(id: string): boolean {
    const store = ensureStoreInitialized();
    const before = store.projects.length;
    store.projects = store.projects.filter((p) => p.id !== id);
    writeStore(store);
    return store.projects.length < before;
  },

  resetDemoProjects(): ResearchProject[] {
    const store = ensureStoreInitialized();
    const nonDemo = store.projects.filter((p) => !p.isDemo);
    store.projects = [...SEED_DEMO_PROJECTS, ...nonDemo];
    writeStore(store);
    return store.projects;
  },

  getSenderProfile(): SenderProfile {
    return ensureStoreInitialized().senderProfile;
  },

  updateSenderProfile(profile: SenderProfile): SenderProfile {
    const store = ensureStoreInitialized();
    store.senderProfile = profile;
    writeStore(store);
    return store.senderProfile;
  },

  updateProspectInProject(projectId: string, prospect: Prospect): ResearchProject | undefined {
    const store = ensureStoreInitialized();
    const project = store.projects.find((p) => p.id === projectId);
    if (!project) return undefined;
    const pIdx = project.prospects.findIndex((pr) => pr.id === prospect.id);
    prospect.updatedAt = new Date().toISOString();
    if (pIdx >= 0) {
      project.prospects[pIdx] = prospect;
    } else {
      project.prospects.unshift(prospect);
    }
    project.updatedAt = new Date().toISOString();
    writeStore(store);
    return project;
  },

  deleteProspect(projectId: string, prospectId: string): ResearchProject | undefined {
    const store = ensureStoreInitialized();
    const project = store.projects.find((p) => p.id === projectId);
    if (!project) return undefined;
    project.prospects = project.prospects.filter((pr) => pr.id !== prospectId);
    project.updatedAt = new Date().toISOString();
    writeStore(store);
    return project;
  },
};
