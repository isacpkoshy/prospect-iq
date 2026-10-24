export type DataProvenance = 'LIVE_SEARCH' | 'HUNTER_API' | 'MANUAL_ENTRY' | 'DEMO_SAMPLE';

export type SeniorityLevel =
  | 'C-Suite'
  | 'VP'
  | 'Director'
  | 'Manager'
  | 'Individual Contributor';

export type BuyingRole =
  | 'Decision Maker'
  | 'Executive Sponsor'
  | 'Technical Champion'
  | 'Operational Champion'
  | 'Evaluator';

export type OutreachStatus =
  | 'Researched'
  | 'Draft Ready'
  | 'Sent via Brevo'
  | 'Accepted'
  | 'Follow-up Needed';

export interface SourceCitation {
  title: string;
  url: string;
  provider: string; // e.g., "Company Website", "Hunter.io", "Public Web Search", "Press Release"
  snippet?: string;
  verifiedAt: string;
}

export interface IcpSegment {
  id: string;
  name: string;
  targetRoles: string[];
  painPoints: string[];
  valueHook: string;
}

export interface BuyingSignal {
  id: string;
  category:
    | 'Product Launch'
    | 'Hiring & Growth'
    | 'Strategic Initiative'
    | 'Executive Move'
    | 'Market Expansion';
  headline: string;
  description: string;
  sourceUrl: string;
  detectedAt: string;
}

export interface SenderProfile {
  senderName: string;
  senderTitle: string;
  senderCompany: string;
  offeringSummary: string;
  defaultObjective: string;
}

export interface CompanySummary {
  companyName: string;
  websiteUrl: string;
  domain: string;
  industry: string;
  employeeRange: string;
  headquarters: string;
  businessModel: string;
  overview: string;
  productsAndServices: string[];
  targetCustomers: string[];
  icpSegments: IcpSegment[];
  buyingSignals: BuyingSignal[];
  sources: SourceCitation[];
  lastEditedByUser: boolean;
  provenance: DataProvenance;
}

export interface DiscoveryCriteria {
  targetJobTitles: string[];
  seniorityLevels: SeniorityLevel[];
  targetIndustry: string;
  geography: string;
  connectionObjective: string;
  selectedIcpSegmentId?: string;
}

export interface ScoreBreakdown {
  totalScore: number;         // 0 - 100
  titleRelevance: number;     // 0 - 35
  seniorityFit: number;       // 0 - 25
  industryFit: number;        // 0 - 20
  objectiveAlignment: number; // 0 - 20
  reasons: {
    titleReason: string;
    seniorityReason: string;
    industryReason: string;
    objectiveReason: string;
  };
}

export interface MessageQualityReport {
  charCount: number;
  isWithinLimit: boolean;
  qualityScore: number;
  spamWordsFound: string[];
  usesVerifiedSignal: boolean;
}

export interface Prospect {
  id: string;
  projectId: string;
  fullName: string;
  jobTitle: string;
  seniority: SeniorityLevel;
  department: string;
  icpSegmentId: string;
  buyingRole: BuyingRole;
  companyName: string;
  location: string;
  locationVerified: boolean;
  titleVerified: boolean;
  email: string | null;
  emailVerified: boolean;
  linkedinUrl: string | null;
  linkedinVerified: boolean;
  sources: SourceCitation[];
  score: ScoreBreakdown;
  selectedSignalId?: string;
  emailSubject: string;
  emailBody: string;
  connectionDraft: string; // Concise <=300 char note
  qualityReport: MessageQualityReport;
  outreachStatus: OutreachStatus;
  provenance: DataProvenance;
  notes?: string;
  lastEmailedAt?: string;
  updatedAt: string;
}

export interface ResearchProject {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  isDemo: boolean;
  company: CompanySummary;
  criteria: DiscoveryCriteria;
  prospects: Prospect[];
}

export interface ApiCapabilitiesStatus {
  hasGeminiKey: boolean;
  hasTavilyKey: boolean;
  hasSerperKey: boolean;
  hasHunterKey: boolean;
  hasAnySearchProvider: boolean;
  configuredProviders: string[];
  brevoReady: boolean;
  brevoSubscribers: number;
}

export interface BrevoEmailStatus {
  ready: boolean;
  saved: boolean;
  subscribers: number;
  sent: number;
  failed: number;
  message: string;
  sender_email: string;
  emails: string[];
  auto_alert: boolean;
}
