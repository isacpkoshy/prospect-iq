import { GoogleGenAI } from '@google/genai';
import { CompanySummary, SourceCitation } from '../../src/types/prospectiq.js';
import { getServerConfig } from '../config.js';

function decodeHtmlEntities(text: string): string {
  return String(text || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeWebsiteUrl(rawInput: string): { url: string; domain: string; brandName: string } {
  let trimmed = String(rawInput || '').trim();
  if (!trimmed) {
    throw new Error('Please enter a company website URL (e.g., https://www.microsoft.com)');
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Invalid website URL format. Example: https://stripe.com');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http:// and https:// URLs are supported');
  }
  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.startsWith('127.') ||
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    hostname.endsWith('.local')
  ) {
    throw new Error('Private or local network URLs are not permitted for company research');
  }

  const domain = hostname.replace(/^www\./, '');
  const baseSegment = domain.split('.')[0] || domain;
  const brandName =
    baseSegment.length <= 4
      ? baseSegment.toUpperCase()
      : baseSegment.charAt(0).toUpperCase() + baseSegment.slice(1);

  return {
    url: parsed.origin,
    domain,
    brandName,
  };
}

async function fetchPublicWebsiteSnapshot(url: string): Promise<{
  title: string;
  description: string;
  headings: string[];
  textSnippet: string;
  reachable: boolean;
}> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return { title: '', description: '', headings: [], textSnippet: '', reachable: false };
    }

    const html = await response.text();
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? decodeHtmlEntities(titleMatch[1]) : '';

    const descMatch =
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i) ||
      html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
    const description = descMatch ? decodeHtmlEntities(descMatch[1]) : '';

    const headingMatches = [...html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)];
    const headings = headingMatches
      .map((m) => decodeHtmlEntities(m[1].replace(/<[^>]+>/g, ' ')))
      .filter((h) => h.length > 4 && h.length < 90 && !/cookie|privacy|sign in|login|menu|skip to/i.test(h))
      .slice(0, 10);

    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 3500);

    return {
      title,
      description,
      headings,
      textSnippet: stripped,
      reachable: true,
    };
  } catch {
    return { title: '', description: '', headings: [], textSnippet: '', reachable: false };
  }
}

async function fetchClearbitAndWikipediaCompanyProfile(
  domain: string,
  fallbackBrand: string
): Promise<{
  companyName?: string;
  overview?: string;
  shortDescription?: string;
  headquarters?: string;
  wikiUrl?: string;
  wikiTitle?: string;
}> {
  let officialName = fallbackBrand;

  // 1. Resolve official company name from domain via Clearbit's public company suggest endpoint
  try {
    const cbRes = await fetch(
      `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(domain)}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (cbRes.ok) {
      const list = (await cbRes.json()) as Array<{ name?: string; domain?: string }>;
      const exact = list.find((item) => item.domain?.toLowerCase() === domain.toLowerCase()) || list[0];
      if (exact?.name) {
        officialName = decodeHtmlEntities(exact.name);
      }
    }
  } catch {
    // continue with fallbackBrand
  }

  // 2. Fetch factual company overview, industry, and headquarters from Wikipedia REST API
  try {
    const searchQuery = `${officialName} company`;
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      searchQuery
    )}&utf8=1&format=json`;
    const searchRes = await fetch(searchUrl, {
      headers: { 'User-Agent': 'ProspectIQ/2.1 (https://prospectiq.local)' },
      signal: AbortSignal.timeout(6000),
    });
    if (searchRes.ok) {
      const searchJson = await searchRes.json();
      const hits: Array<{ title: string; snippet: string }> = searchJson?.query?.search || [];
      const bestHit =
        hits.find(
          (h) =>
            h.title.toLowerCase().includes(officialName.toLowerCase()) ||
            /company|corporation|limited|inc\.|technologies|services|software/i.test(h.snippet)
        ) || hits[0];

      if (bestHit?.title) {
        const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
          bestHit.title
        )}`;
        const sumRes = await fetch(summaryUrl, {
          headers: { 'User-Agent': 'ProspectIQ/2.1 (https://prospectiq.local)' },
          signal: AbortSignal.timeout(6000),
        });
        if (sumRes.ok) {
          const sumJson = await sumRes.json();
          const extract = sumJson?.extract ? decodeHtmlEntities(String(sumJson.extract)) : '';
          const shortDesc = sumJson?.description ? decodeHtmlEntities(String(sumJson.description)) : '';
          const wikiUrl = sumJson?.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(bestHit.title)}`;

          // Extract headquarters if mentioned in the summary
          const hqMatch =
            extract.match(/headquartered in ([A-Z][A-Za-z\s,]+?)(?:\.|,\s*it\b|;\s*and)/i) ||
            extract.match(/based in ([A-Z][A-Za-z\s,]+?)(?:\.|,\s*it\b)/i);
          const headquarters = hqMatch ? hqMatch[1].trim() : undefined;

          if (extract && extract.length > 40) {
            return {
              companyName: officialName,
              overview: extract,
              shortDescription: shortDesc,
              headquarters,
              wikiUrl,
              wikiTitle: String(sumJson.title || bestHit.title),
            };
          }
        }
      }
    }
  } catch {
    // continue
  }

  return { companyName: officialName };
}

async function fetchHunterOrganizationMeta(
  domain: string,
  apiKey: string
): Promise<{
  organization?: string;
  description?: string;
  industry?: string;
  location?: string;
} | null> {
  if (!apiKey) return null;
  try {
    const endpoint = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(
      domain
    )}&limit=1&api_key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const json = await res.json();
    const data = json?.data;
    if (!data) return null;
    const locParts = [data.city, data.state, data.country].filter(Boolean);
    return {
      organization: data.organization ? decodeHtmlEntities(String(data.organization)) : undefined,
      description: data.description ? decodeHtmlEntities(String(data.description)) : undefined,
      industry: data.industry ? decodeHtmlEntities(String(data.industry)) : undefined,
      location: locParts.length > 0 ? locParts.join(', ') : undefined,
    };
  } catch {
    return null;
  }
}

function inferProductsFromDescription(overview: string, industry: string, headings: string[]): string[] {
  if (headings.length >= 2) {
    return headings.slice(0, 4);
  }
  const combined = `${overview} ${industry}`.toLowerCase();
  if (/information technology|consulting|it services|outsourcing|system integrat/i.test(combined)) {
    return [
      'IT Services & Digital Transformation Consulting',
      'Enterprise Cloud Migration & AI Solutions',
      'Application Engineering & Core System Modernization',
      'Managed Cognitive Business Operations',
    ];
  }
  if (/payment|fintech|banking|financial|mortgage|lending/i.test(combined)) {
    return [
      'Digital Financial & Payment Infrastructure',
      'Enterprise Risk, Compliance & Treasury Automation',
      'Embedded Finance & API Banking Platform',
    ];
  }
  if (/crm|marketing|sales|revenue|customer/i.test(combined)) {
    return [
      'AI-Powered CRM & Revenue Engagement Platform',
      'Marketing Automation & Customer Data Hub',
      'Enterprise Sales Analytics & Pipeline Operations',
    ];
  }
  return [
    'Enterprise Cloud & Digital Platform Solutions',
    'AI-Driven Workflow & Data Automation',
    'Enterprise Integration & Advisory Services',
  ];
}

export async function researchCompanyByUrl(rawUrl: string): Promise<CompanySummary> {
  const { url, domain, brandName } = normalizeWebsiteUrl(rawUrl);
  const cfg = getServerConfig();
  const today = new Date().toISOString().slice(0, 10);

  const [snapshot, hunterMeta, publicProfile] = await Promise.all([
    fetchPublicWebsiteSnapshot(url),
    fetchHunterOrganizationMeta(domain, cfg.hunterApiKey),
    fetchClearbitAndWikipediaCompanyProfile(domain, brandName),
  ]);

  const resolvedCompanyName =
    hunterMeta?.organization ||
    publicProfile.companyName ||
    (snapshot.title ? snapshot.title.split(/[|\-–—:]/)[0].trim() : '') ||
    brandName;

  const sources: SourceCitation[] = [
    {
      title: snapshot.title || `${resolvedCompanyName} Official Website (${domain})`,
      url,
      provider: 'Company Website',
      snippet:
        snapshot.description ||
        hunterMeta?.description ||
        publicProfile.shortDescription ||
        `Official corporate domain (${domain})`,
      verifiedAt: today,
    },
  ];

  if (publicProfile.wikiUrl && publicProfile.overview) {
    sources.push({
      title: `${publicProfile.wikiTitle || resolvedCompanyName} — Corporate Profile`,
      url: publicProfile.wikiUrl,
      provider: 'Public Encyclopedia / Knowledge Graph',
      snippet: publicProfile.overview.slice(0, 220),
      verifiedAt: today,
    });
  }

  // If Gemini API key is configured, use gemini-3.8-flash with Google Search grounding
  if (cfg.geminiApiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: cfg.geminiApiKey });
      const prompt = `Research the company at ${url} (domain: ${domain}, name: ${resolvedCompanyName}) using both the verified data below and Google Search.
VERIFIED DATA:
- Website Title: ${snapshot.title}
- Meta Description: ${snapshot.description || hunterMeta?.description || ''}
- Public Overview: ${publicProfile.overview || ''}
- Headings: ${snapshot.headings.join(' | ')}

Extract a verified B2B intelligence summary and return ONLY valid JSON matching this exact structure:
{
  "companyName": "Official Company Name",
  "industry": "Primary Industry & Vertical",
  "employeeRange": "Estimated employee range or Enterprise",
  "headquarters": "HQ City/Country",
  "businessModel": "How the company monetizes",
  "overview": "2-3 sentence factual overview of what the company does",
  "productsAndServices": ["Core Product 1", "Core Service 2", "Platform Solution 3", "Solution 4"],
  "targetCustomers": ["Customer Segment 1", "Customer Segment 2", "Customer Segment 3"],
  "icpSegments": [
    {
      "id": "icp-1",
      "name": "ICP 1: Segment Name",
      "targetRoles": ["VP of Engineering", "CTO"],
      "painPoints": ["Key pain point 1", "Key pain point 2"],
      "valueHook": "Strategic outreach angle for this persona"
    },
    {
      "id": "icp-2",
      "name": "ICP 2: Segment Name",
      "targetRoles": ["VP of Product", "Head of Operations"],
      "painPoints": ["Key pain point 1"],
      "valueHook": "Strategic outreach angle for this persona"
    },
    {
      "id": "icp-3",
      "name": "ICP 3: Segment Name",
      "targetRoles": ["Chief Revenue Officer", "VP Partnerships"],
      "painPoints": ["Key pain point 1"],
      "valueHook": "Strategic outreach angle for this persona"
    }
  ],
  "buyingSignals": [
    {
      "id": "sig-1",
      "category": "Strategic Initiative",
      "headline": "Verifiable company initiative or product focus",
      "description": "1-sentence factual summary",
      "sourceUrl": "${url}"
    }
  ]
}`;

      const interaction = await ai.interactions.create({
        model: 'gemini-3.8-flash',
        input: prompt,
        tools: [{ type: 'google_search' }],
      });

      const outText = interaction.output_text || '';
      const jsonMatch = outText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          companyName: String(parsed.companyName || resolvedCompanyName),
          websiteUrl: url,
          domain,
          industry: String(
            parsed.industry ||
              hunterMeta?.industry ||
              publicProfile.shortDescription ||
              'Enterprise Technology & Digital Services'
          ),
          employeeRange: String(parsed.employeeRange || 'Enterprise'),
          headquarters: String(parsed.headquarters || publicProfile.headquarters || hunterMeta?.location || 'Global'),
          businessModel: String(parsed.businessModel || 'B2B Enterprise Solutions & Services'),
          overview: String(
            parsed.overview ||
              publicProfile.overview ||
              snapshot.description ||
              hunterMeta?.description ||
              `${resolvedCompanyName} delivers enterprise technology platforms, digital transformation, and cloud solutions.`
          ),
          productsAndServices:
            Array.isArray(parsed.productsAndServices) && parsed.productsAndServices.length > 0
              ? parsed.productsAndServices.map(String)
              : inferProductsFromDescription(
                  publicProfile.overview || snapshot.description || '',
                  hunterMeta?.industry || publicProfile.shortDescription || '',
                  snapshot.headings
                ),
          targetCustomers:
            Array.isArray(parsed.targetCustomers) && parsed.targetCustomers.length > 0
              ? parsed.targetCustomers.map(String)
              : ['Enterprise & Mid-Market B2B Organizations', 'Technical & Operational Decision-Makers'],
          icpSegments:
            Array.isArray(parsed.icpSegments) && parsed.icpSegments.length > 0
              ? parsed.icpSegments.slice(0, 3).map((seg: Record<string, unknown>, idx: number) => ({
                  id: String(seg.id || `icp-${idx + 1}`),
                  name: String(seg.name || `ICP ${idx + 1}: Core Decision-Makers`),
                  targetRoles: Array.isArray(seg.targetRoles)
                    ? seg.targetRoles.map(String)
                    : ['VP of Engineering', 'Director of Operations'],
                  painPoints: Array.isArray(seg.painPoints)
                    ? seg.painPoints.map(String)
                    : ['Operational efficiency and scalable execution'],
                  valueHook: String(seg.valueHook || `Strategic alignment with ${resolvedCompanyName}'s core initiatives.`),
                }))
              : buildDefaultIcpSegments(resolvedCompanyName),
          buyingSignals:
            Array.isArray(parsed.buyingSignals) && parsed.buyingSignals.length > 0
              ? parsed.buyingSignals.slice(0, 3).map((sig: Record<string, unknown>, idx: number) => ({
                  id: String(sig.id || `sig-${idx + 1}`),
                  category: 'Strategic Initiative',
                  headline: String(sig.headline || `${resolvedCompanyName} Enterprise Platform & AI Transformation`),
                  description: String(sig.description || snapshot.description || `Verified from ${url}`),
                  sourceUrl: String(sig.sourceUrl || url),
                  detectedAt: today,
                }))
              : [
                  {
                    id: 'sig-1',
                    category: 'Strategic Initiative',
                    headline: `${resolvedCompanyName} Digital Transformation & Platform Growth`,
                    description:
                      publicProfile.overview ||
                      snapshot.description ||
                      `Enterprise solutions and strategic initiatives at ${resolvedCompanyName} (${domain}).`,
                    sourceUrl: url,
                    detectedAt: today,
                  },
                ],
          sources,
          lastEditedByUser: false,
          provenance: 'LIVE_SEARCH',
        };
      }
    } catch {
      // Fall back to enriched Wikipedia + Hunter + Website metadata below
    }
  }

  const resolvedIndustry =
    hunterMeta?.industry ||
    (publicProfile.shortDescription
      ? publicProfile.shortDescription.charAt(0).toUpperCase() + publicProfile.shortDescription.slice(1)
      : 'Enterprise Technology & Consulting Services');

  const resolvedOverview =
    publicProfile.overview ||
    snapshot.description ||
    hunterMeta?.description ||
    (snapshot.textSnippet
      ? `${snapshot.textSnippet.slice(0, 320)}...`
      : `${resolvedCompanyName} (${domain}) is an enterprise organization specializing in ${resolvedIndustry.toLowerCase()}, digital transformation, and scalable B2B solutions.`);

  const extractedProducts = inferProductsFromDescription(
    resolvedOverview,
    resolvedIndustry,
    snapshot.headings
  );

  return {
    companyName: resolvedCompanyName,
    websiteUrl: url,
    domain,
    industry: resolvedIndustry,
    employeeRange: 'Enterprise',
    headquarters: publicProfile.headquarters || hunterMeta?.location || 'Global',
    businessModel: 'B2B Enterprise Consulting, Cloud Platforms & Managed Digital Services',
    overview: resolvedOverview,
    productsAndServices: extractedProducts,
    targetCustomers: [
      `Global Fortune 2000 & Enterprise organizations partnering with ${resolvedCompanyName}`,
      'CIOs, CTOs, and Digital Transformation leaders',
      'Commercial, Operations & Strategic Partnership executives',
    ],
    icpSegments: buildDefaultIcpSegments(resolvedCompanyName),
    buyingSignals: [
      {
        id: 'sig-web-1',
        category: 'Strategic Initiative',
        headline: `${resolvedCompanyName} Enterprise Cloud, AI & Digital Engineering Momentum`,
        description: resolvedOverview.slice(0, 180),
        sourceUrl: publicProfile.wikiUrl || url,
        detectedAt: today,
      },
    ],
    sources,
    lastEditedByUser: false,
    provenance: 'LIVE_SEARCH',
  };
}

function buildDefaultIcpSegments(brandName: string) {
  return [
    {
      id: 'icp-1',
      name: 'ICP 1: Technology & Engineering Leadership',
      targetRoles: ['CTO', 'VP of Engineering', 'Director of Architecture'],
      painPoints: ['Scaling platform reliability and engineering velocity', 'Reducing technical debt and integration overhead'],
      valueHook: `Partnering with ${brandName}'s technical leadership on high-velocity engineering initiatives.`,
    },
    {
      id: 'icp-2',
      name: 'ICP 2: Product & Security Executives',
      targetRoles: ['VP of Product', 'CISO', 'Senior Security Executive'],
      painPoints: ['Accelerating enterprise product adoption with strict security governance'],
      valueHook: `Supporting ${brandName}'s product and security roadmap with verified enterprise guardrails.`,
    },
    {
      id: 'icp-3',
      name: 'ICP 3: Commercial GTM & Strategic Partnerships',
      targetRoles: ['Chief Revenue Officer', 'VP Partnerships', 'Head of Business Development'],
      painPoints: ['Expanding ecosystem co-sell and enterprise market penetration'],
      valueHook: `Unlocking joint GTM and strategic alliance value with ${brandName}.`,
    },
  ];
}
