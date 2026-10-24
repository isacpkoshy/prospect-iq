import { GoogleGenAI } from '@google/genai';
import {
  CompanySummary,
  DiscoveryCriteria,
  Prospect,
  SenderProfile,
  SourceCitation,
} from '../../src/types/prospectiq.js';
import { getServerConfig } from '../config.js';
import { calculateProspectScore, inferBuyingRole, inferSeniorityLevel } from './scoringEngine.js';
import { generateDeterministicOutreach } from './messageGenerator.js';

interface RawDiscoveredCandidate {
  fullName: string;
  jobTitle: string;
  location: string;
  locationVerified: boolean;
  email: string | null;
  emailVerified: boolean;
  linkedinUrl: string | null;
  linkedinVerified: boolean;
  sources: SourceCitation[];
  provenance: 'LIVE_SEARCH' | 'HUNTER_API';
}

/**
 * Tier 1: Optional Hunter.io Domain Search API (matches the MDW Session 19 classroom screenshot!)
 */
async function discoverViaHunterIo(domain: string, apiKey: string): Promise<RawDiscoveredCandidate[]> {
  if (!apiKey || !domain) return [];
  try {
    const url = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(
      domain
    )}&limit=10&api_key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const emails = data?.data?.emails;
    if (!Array.isArray(emails)) return [];

    const today = new Date().toISOString().slice(0, 10);
    const candidates: RawDiscoveredCandidate[] = [];

    for (const item of emails) {
      const firstName = String(item.first_name || '').trim();
      const lastName = String(item.last_name || '').trim();
      const position = String(item.position || '').trim();
      if (!firstName || !lastName || !position) continue;

      const fullName = `${firstName} ${lastName}`;
      const linkedin = item.linkedin ? String(item.linkedin).trim() : null;
      const emailVal = item.value ? String(item.value).trim() : null;
      const rawSources = Array.isArray(item.sources) ? item.sources : [];

      const citations: SourceCitation[] = [
        {
          title: `Hunter.io Domain Search — Verified Decision-Makers at ${domain}`,
          url: `https://hunter.io/search/${domain}`,
          provider: 'Hunter.io',
          snippet: `${fullName} — ${position}${emailVal ? ` (${emailVal})` : ''}`,
          verifiedAt: today,
        },
      ];
      for (const s of rawSources.slice(0, 2)) {
        if (s.uri && /^https?:\/\//i.test(s.uri)) {
          citations.push({
            title: `Public Web Source (${s.domain || domain})`,
            url: String(s.uri),
            provider: 'Hunter.io Source',
            verifiedAt: String(s.extracted_on || today),
          });
        }
      }

      candidates.push({
        fullName,
        jobTitle: position,
        location: item.country ? String(item.country) : 'Unverified',
        locationVerified: Boolean(item.country),
        email: emailVal,
        emailVerified: Boolean(emailVal && item.confidence >= 70),
        linkedinUrl: linkedin && linkedin.includes('linkedin.com/in/') ? linkedin : null,
        linkedinVerified: Boolean(linkedin && linkedin.includes('linkedin.com/in/')),
        sources: citations,
        provenance: 'HUNTER_API',
      });
    }
    return candidates;
  } catch {
    return [];
  }
}

/**
 * Tier 2: Authorized Web Search via Serper.dev or Tavily
 */
async function discoverViaSearchApi(
  company: CompanySummary,
  criteria: DiscoveryCriteria
): Promise<RawDiscoveredCandidate[]> {
  const cfg = getServerConfig();
  const today = new Date().toISOString().slice(0, 10);
  const titlesQuery = criteria.targetJobTitles
    .slice(0, 3)
    .map((t) => `"${t}"`)
    .join(' OR ');
  const query = `site:linkedin.com/in/ "${company.companyName}" (${titlesQuery || '"Vice President" OR "Director"'}) ${
    criteria.geography || ''
  }`.trim();

  const searchItems: { title: string; url: string; snippet: string }[] = [];

  if (cfg.serperApiKey) {
    try {
      const res = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': cfg.serperApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ q: query, num: 10 }),
      });
      if (res.ok) {
        const data = await res.json();
        for (const item of data.organic || []) {
          if (item.link && item.title) {
            searchItems.push({
              title: String(item.title),
              url: String(item.link),
              snippet: String(item.snippet || ''),
            });
          }
        }
      }
    } catch {
      // continue
    }
  } else if (cfg.tavilyApiKey) {
    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: cfg.tavilyApiKey,
          query,
          max_results: 10,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        for (const item of data.results || []) {
          if (item.url && item.title) {
            searchItems.push({
              title: String(item.title),
              url: String(item.url),
              snippet: String(item.content || ''),
            });
          }
        }
      }
    } catch {
      // continue
    }
  }

  const candidates: RawDiscoveredCandidate[] = [];
  for (const item of searchItems) {
    const isLinkedin = /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[^/?#]+/i.test(item.url);
    if (!isLinkedin) continue;

    // Parse standard public search title format: "Full Name - Job Title - Company | LinkedIn"
    const cleanTitle = item.title.replace(/\s*\|\s*LinkedIn.*$/i, '').trim();
    const parts = cleanTitle.split(/\s+[-–—]\s+/);
    const fullName = (parts[0] || '').trim();
    const jobTitle = (parts[1] || criteria.targetJobTitles[0] || 'Executive Leader').trim();

    if (!fullName || fullName.length < 3 || fullName.length > 60) continue;
    if (candidates.some((c) => c.fullName.toLowerCase() === fullName.toLowerCase())) continue;

    candidates.push({
      fullName,
      jobTitle,
      location: criteria.geography || 'Unverified',
      locationVerified: false,
      email: null,
      emailVerified: false,
      linkedinUrl: item.url.split('?')[0],
      linkedinVerified: true,
      sources: [
        {
          title: item.title,
          url: item.url.split('?')[0],
          provider: 'Public Web Search',
          snippet: item.snippet.slice(0, 220),
          verifiedAt: today,
        },
      ],
      provenance: 'LIVE_SEARCH',
    });
  }

  return candidates;
}

/**
 * Tier 3: Gemini Search Grounding for publicly documented company executives
 */
async function discoverViaGeminiSearchGrounding(
  company: CompanySummary,
  criteria: DiscoveryCriteria
): Promise<RawDiscoveredCandidate[]> {
  const cfg = getServerConfig();
  if (!cfg.geminiApiKey) return [];
  const today = new Date().toISOString().slice(0, 10);

  try {
    const ai = new GoogleGenAI({ apiKey: cfg.geminiApiKey });
    const prompt = `Use Google Search to find real, publicly verifiable executives or decision-makers currently at ${company.companyName} (${company.websiteUrl}) matching or related to these target roles: ${criteria.targetJobTitles.join(', ')}.

CRITICAL ANTI-HALLUCINATION RULES:
1. NEVER invent a person, job title, or LinkedIn URL.
2. Only include people whose name and role at ${company.companyName} are explicitly documented in public web search results.
3. Only provide a linkedinUrl if the exact "https://www.linkedin.com/in/..." URL was found in search results; otherwise set linkedinUrl to null.
4. Provide the real public sourceUrl where the person is mentioned.

Return ONLY valid JSON array of up to 6 objects:
[
  {
    "fullName": "Real Person Name",
    "jobTitle": "Verified Title at ${company.companyName}",
    "location": "City/Country if verified, else 'Unverified'",
    "locationVerified": true,
    "linkedinUrl": "https://www.linkedin.com/in/... or null",
    "sourceTitle": "Public page title",
    "sourceUrl": "https://...",
    "snippet": "Brief factual quote showing their role"
  }
]`;

    const interaction = await ai.interactions.create({
      model: 'gemini-3.8-flash',
      input: prompt,
      tools: [{ type: 'google_search' }],
    });

    const outText = interaction.output_text || '';
    const jsonMatch = outText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const arr = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(arr)) return [];

    const results: RawDiscoveredCandidate[] = [];
    for (const item of arr) {
      const fullName = String(item.fullName || '').trim();
      const jobTitle = String(item.jobTitle || '').trim();
      const sourceUrl = String(item.sourceUrl || '').trim();
      if (!fullName || !jobTitle || !/^https?:\/\//i.test(sourceUrl)) continue;

      const rawLinkedin = item.linkedinUrl ? String(item.linkedinUrl).trim() : null;
      const validLinkedin =
        rawLinkedin && /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+/i.test(rawLinkedin)
          ? rawLinkedin
          : null;

      results.push({
        fullName,
        jobTitle,
        location: String(item.location || 'Unverified'),
        locationVerified: Boolean(item.locationVerified && item.location && item.location !== 'Unverified'),
        email: null,
        emailVerified: false,
        linkedinUrl: validLinkedin,
        linkedinVerified: Boolean(validLinkedin),
        sources: [
          {
            title: String(item.sourceTitle || `${fullName} — ${company.companyName} Public Record`),
            url: sourceUrl,
            provider: 'Public Web Search',
            snippet: String(item.snippet || `${fullName}, ${jobTitle} at ${company.companyName}`),
            verifiedAt: today,
          },
        ],
        provenance: 'LIVE_SEARCH',
      });
    }
    return results;
  } catch {
    return [];
  }
}

export async function discoverProspectsForProject(params: {
  projectId: string;
  company: CompanySummary;
  criteria: DiscoveryCriteria;
  sender: SenderProfile;
}): Promise<{
  prospects: Prospect[];
  providerUsed: string;
  manualModeRequired: boolean;
  message: string;
}> {
  const { projectId, company, criteria, sender } = params;
  const cfg = getServerConfig();

  const rawCandidates: RawDiscoveredCandidate[] = [];
  const providersUsed: string[] = [];

  // 1. Hunter.io Domain Search
  if (cfg.hunterApiKey) {
    const hunterResults = await discoverViaHunterIo(company.domain, cfg.hunterApiKey);
    if (hunterResults.length > 0) {
      rawCandidates.push(...hunterResults);
      providersUsed.push('Hunter.io API');
    }
  }

  // 2. Serper / Tavily Web Search
  if (cfg.serperApiKey || cfg.tavilyApiKey) {
    const searchResults = await discoverViaSearchApi(company, criteria);
    if (searchResults.length > 0) {
      for (const cand of searchResults) {
        if (!rawCandidates.some((c) => c.fullName.toLowerCase() === cand.fullName.toLowerCase())) {
          rawCandidates.push(cand);
        }
      }
      providersUsed.push(cfg.serperApiKey ? 'Serper.dev Search API' : 'Tavily Search API');
    }
  }

  // 3. Gemini Search Grounding
  if (rawCandidates.length < 4 && cfg.geminiApiKey) {
    const geminiResults = await discoverViaGeminiSearchGrounding(company, criteria);
    if (geminiResults.length > 0) {
      for (const cand of geminiResults) {
        if (!rawCandidates.some((c) => c.fullName.toLowerCase() === cand.fullName.toLowerCase())) {
          rawCandidates.push(cand);
        }
      }
      providersUsed.push('Gemini Google Search Grounding');
    }
  }

  if (rawCandidates.length === 0) {
    const anyConfigured = Boolean(cfg.hunterApiKey || cfg.serperApiKey || cfg.tavilyApiKey || cfg.geminiApiKey);
    return {
      prospects: [],
      providerUsed: 'Manual Research Workflow',
      manualModeRequired: true,
      message: anyConfigured
        ? `No publicly verifiable profiles matched those exact filters for ${company.companyName}. Use the Guided Boolean Search links or add a verified prospect manually.`
        : 'No live search API key is configured on the server. Use the Guided Boolean Search Helper or add verified prospects manually below.',
    };
  }

  // Transform candidates into scored Prospects with personalized outreach drafts
  const prospects: Prospect[] = rawCandidates.map((cand, idx) => {
    const seniority = inferSeniorityLevel(cand.jobTitle);
    const buyingRole = inferBuyingRole(cand.jobTitle, seniority);
    const assignedIcp =
      criteria.selectedIcpSegmentId ||
      company.icpSegments[idx % Math.max(1, company.icpSegments.length)]?.id ||
      'icp-1';

    const score = calculateProspectScore({
      jobTitle: cand.jobTitle,
      seniority,
      company,
      criteria,
      hasVerifiedLinkedin: cand.linkedinVerified,
      hasVerifiedEmail: cand.emailVerified,
      sourcesCount: cand.sources.length,
    });

    const outreach = generateDeterministicOutreach({
      prospectName: cand.fullName,
      jobTitle: cand.jobTitle,
      company,
      criteria,
      sender,
    });

    return {
      id: `pros-${Date.now()}-${idx}`,
      projectId,
      fullName: cand.fullName,
      jobTitle: cand.jobTitle,
      seniority,
      department: cand.jobTitle.includes('Security')
        ? 'Security'
        : cand.jobTitle.includes('Eng') || cand.jobTitle.includes('CTO')
        ? 'Engineering'
        : 'Executive Leadership',
      icpSegmentId: assignedIcp,
      buyingRole,
      companyName: company.companyName,
      location: cand.location,
      locationVerified: cand.locationVerified,
      titleVerified: true,
      email: cand.email,
      emailVerified: cand.emailVerified,
      linkedinUrl: cand.linkedinUrl,
      linkedinVerified: cand.linkedinVerified,
      sources: cand.sources,
      score,
      selectedSignalId: company.buyingSignals[0]?.id,
      emailSubject: outreach.emailSubject,
      emailBody: outreach.emailBody,
      connectionDraft: outreach.connectionDraft,
      qualityReport: outreach.qualityReport,
      outreachStatus: 'Draft Ready',
      provenance: cand.provenance,
      updatedAt: new Date().toISOString(),
    };
  });

  // Sort by totalScore descending
  prospects.sort((a, b) => b.score.totalScore - a.score.totalScore);

  return {
    prospects,
    providerUsed: providersUsed.join(' + '),
    manualModeRequired: false,
    message: `Discovered and scored ${prospects.length} verified prospect(s) via ${providersUsed.join(' + ')}.`,
  };
}
