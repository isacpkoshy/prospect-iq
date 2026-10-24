/**
 * Brevo Email Subscription & Transactional Delivery Service
 * Modeled directly on Indian-SEPA-Screener/server.py:
 * - Windows DPAPI encrypted credential storage (%LOCALAPPDATA%\ProspectIQ\brevo_credentials.dpapi)
 *   with automatic fallback/restore from %LOCALAPPDATA%\Indian-SEPA-Screener\brevo_credentials.dpapi if present.
 * - Opt-in subscriber management (consent required, persistent local storage).
 * - 10-second burst coalescing alert queue + instant Test Email, Single Prospect Outreach, and Full Company Digest via https://api.brevo.com/v3/smtp/email.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
import { BrevoEmailStatus, Prospect, ResearchProject } from '../../src/types/prospectiq.js';
import { getServerConfig } from '../config.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const SUBSCRIBERS_FILE = path.join(DATA_DIR, 'email_subscribers.json');

const LOCAL_APPDATA = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const PROSPECTIQ_DPAPI_FILE = path.join(LOCAL_APPDATA, 'ProspectIQ', 'brevo_credentials.dpapi');
const SEPA_DPAPI_FILE = path.join(LOCAL_APPDATA, 'Indian-SEPA-Screener', 'brevo_credentials.dpapi');

interface SubscriberRecord {
  email: string;
  addedAt: string;
}

interface SubscriberStore {
  subscribers: SubscriberRecord[];
  sent: number;
  failed: number;
  autoAlert: boolean;
}

let emailConfig = {
  apiKey: '',
  senderEmail: '',
};

let statusMessage = 'Email alerts are not configured';
let isSavedOnDisk = false;

// Burst coalescing queue (10-second window like Indian-SEPA-Screener)
let burstQueue: { project: ResearchProject; prospects: Prospect[] }[] = [];
let burstTimer: NodeJS.Timeout | null = null;

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Encrypt or decrypt UTF-8 JSON string using Windows Data Protection API (CurrentUser scope)
 */
function dpapiProtect(plainText: string, filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const base64Input = Buffer.from(plainText, 'utf-8').toString('base64');
  const psScript = `
    Add-Type -AssemblyName System.Security
    $bytes = [Convert]::FromBase64String('${base64Input}')
    $enc = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
    [IO.File]::WriteAllBytes('${filePath.replace(/'/g, "''")}', $enc)
  `;
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], {
    timeout: 8000,
    windowsHide: true,
  });
}

function dpapiUnprotect(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const psScript = `
      Add-Type -AssemblyName System.Security
      $enc = [IO.File]::ReadAllBytes('${filePath.replace(/'/g, "''")}')
      $dec = [System.Security.Cryptography.ProtectedData]::Unprotect($enc, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
      [Console]::Out.Write([Text.Encoding]::UTF8.GetString($dec))
    `;
    const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], {
      timeout: 8000,
      windowsHide: true,
      encoding: 'utf-8',
    });
    return out.trim();
  } catch {
    return null;
  }
}

function loadSubscriberStore(): SubscriberStore {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(SUBSCRIBERS_FILE)) {
    const initial: SubscriberStore = {
      subscribers: [],
      sent: 0,
      failed: 0,
      autoAlert: true,
    };
    fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
  try {
    return JSON.parse(fs.readFileSync(SUBSCRIBERS_FILE, 'utf-8')) as SubscriberStore;
  } catch {
    return { subscribers: [], sent: 0, failed: 0, autoAlert: true };
  }
}

function saveSubscriberStore(store: SubscriberStore): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

export function initBrevoEmailConfig(): void {
  const envCfg = getServerConfig();
  // 1. Check ProspectIQ's own DPAPI file
  const rawProspectIq = dpapiUnprotect(PROSPECTIQ_DPAPI_FILE);
  if (rawProspectIq) {
    try {
      const parsed = JSON.parse(rawProspectIq);
      if (parsed.api_key && parsed.sender_email) {
        emailConfig = { apiKey: String(parsed.api_key), senderEmail: String(parsed.sender_email) };
        isSavedOnDisk = true;
        statusMessage = 'Brevo credentials securely restored for this Windows account';
        return;
      }
    } catch {
      // continue
    }
  }

  // 2. Fallback: Check if user already saved DPAPI credentials in Indian-SEPA-Screener!
  const rawSepa = dpapiUnprotect(SEPA_DPAPI_FILE);
  if (rawSepa) {
    try {
      const parsed = JSON.parse(rawSepa);
      if (parsed.api_key && parsed.sender_email) {
        emailConfig = { apiKey: String(parsed.api_key), senderEmail: String(parsed.sender_email) };
        isSavedOnDisk = true;
        statusMessage = 'Brevo credentials securely restored from your Windows DPAPI store';
        return;
      }
    } catch {
      // continue
    }
  }

  // 3. Fallback: Check .env variables
  if (envCfg.brevoApiKeyEnv && envCfg.brevoSenderEmailEnv) {
    emailConfig = { apiKey: envCfg.brevoApiKeyEnv, senderEmail: envCfg.brevoSenderEmailEnv };
    isSavedOnDisk = false;
    statusMessage = 'Brevo credentials loaded from server .env';
  }
}

function redactError(err: unknown, apiKey: string): string {
  const raw = err instanceof Error ? err.message : String(err);
  const redacted = apiKey ? raw.split(apiKey).join('[redacted]') : raw;
  return redacted.slice(0, 450);
}

async function postBrevoSmtp(payload: {
  senderEmail: string;
  recipientEmail: string;
  subject: string;
  htmlContent: string;
  textContent: string;
  apiKey: string;
}): Promise<void> {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': payload.apiKey,
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'ProspectIQ Intelligence', email: payload.senderEmail },
      to: [{ email: payload.recipientEmail }],
      subject: payload.subject,
      htmlContent: payload.htmlContent,
      textContent: payload.textContent,
    }),
  });

  if (![200, 201, 202].includes(response.status)) {
    const text = await response.text().catch(() => '');
    let detail = text;
    try {
      const json = JSON.parse(text);
      detail = json.message || json.code || text;
    } catch {
      // keep raw
    }
    const cleanDetail = payload.apiKey ? String(detail).split(payload.apiKey).join('[redacted]') : String(detail);
    throw new Error(`Brevo HTTP ${response.status}: ${cleanDetail.slice(0, 350)}`);
  }
}

function buildCleanOneToOneEmail(
  prospect: Prospect,
  draftMode: 'email' | 'concise' = 'email'
): { subject: string; htmlContent: string; textContent: string } {
  const subject = prospect.emailSubject || `Strategic alignment with ${prospect.companyName}`;
  const rawBody =
    draftMode === 'concise'
      ? prospect.connectionDraft || prospect.emailBody
      : prospect.emailBody || prospect.connectionDraft;

  const paragraphsHtml = rawBody
    .split(/\n\s*\n/)
    .map(
      (para) =>
        `<p style="margin:0 0 14px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111827;white-space:pre-line">${escapeHtml(
          para.trim()
        )}</p>`
    )
    .join('');

  const htmlContent = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111827;max-width:640px">${paragraphsHtml}</div>`;

  return {
    subject,
    htmlContent,
    textContent: rawBody,
  };
}

export const brevoEmailService = {
  getStatus(): BrevoEmailStatus {
    const store = loadSubscriberStore();
    const ready = Boolean(emailConfig.apiKey && emailConfig.senderEmail);
    return {
      ready,
      saved: Boolean(ready && isSavedOnDisk),
      subscribers: store.subscribers.length,
      sent: store.sent,
      failed: store.failed,
      message: statusMessage,
      sender_email: emailConfig.senderEmail,
      emails: store.subscribers.map((s) => s.email),
      auto_alert: store.autoAlert,
    };
  },

  saveConfig(senderEmailInput: string, suppliedApiKey: string): BrevoEmailStatus {
    const sender = String(senderEmailInput || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender)) {
      throw new Error('Enter a valid verified sender email address');
    }
    const apiKey = String(suppliedApiKey || '').trim() || emailConfig.apiKey;
    if (apiKey.length < 16 || apiKey.length > 512) {
      throw new Error('Enter a valid Brevo transactional API key the first time you configure email');
    }

    dpapiProtect(JSON.stringify({ api_key: apiKey, sender_email: sender }), PROSPECTIQ_DPAPI_FILE);
    emailConfig = { apiKey, senderEmail: sender };
    isSavedOnDisk = true;
    statusMessage = 'Brevo credentials securely saved for this Windows account';
    return this.getStatus();
  },

  clearConfig(): BrevoEmailStatus {
    emailConfig = { apiKey: '', senderEmail: '' };
    isSavedOnDisk = false;
    if (fs.existsSync(PROSPECTIQ_DPAPI_FILE)) {
      fs.unlinkSync(PROSPECTIQ_DPAPI_FILE);
    }
    statusMessage = 'Brevo credentials cleared';
    return this.getStatus();
  },

  updateSubscriber(emailInput: string, action: 'add' | 'remove' | 'clear_all', consent = false): BrevoEmailStatus {
    const store = loadSubscriberStore();
    if (action === 'clear_all') {
      store.subscribers = [];
      statusMessage = 'All subscribers removed';
      saveSubscriberStore(store);
      return this.getStatus();
    }

    const email = String(emailInput || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      throw new Error('Enter a valid subscriber email address');
    }
    if (action === 'add') {
      if (!consent) {
        throw new Error('Confirm that this recipient agreed to receive ProspectIQ outreach & research digest emails');
      }
      const exists = store.subscribers.some((s) => s.email === email);
      if (!exists) {
        store.subscribers.push({ email, addedAt: new Date().toISOString() });
        store.subscribers.sort((a, b) => a.email.localeCompare(b.email));
        statusMessage = 'Subscriber added';
      } else {
        statusMessage = 'That email is already subscribed';
      }
    } else if (action === 'remove') {
      const before = store.subscribers.length;
      store.subscribers = store.subscribers.filter((s) => s.email !== email);
      statusMessage = store.subscribers.length < before ? 'Subscriber removed' : 'That email was not subscribed';
    } else {
      throw new Error('Choose add, remove, or clear_all');
    }
    saveSubscriberStore(store);
    return this.getStatus();
  },

  setAutoAlert(enabled: boolean): BrevoEmailStatus {
    const store = loadSubscriberStore();
    store.autoAlert = Boolean(enabled);
    saveSubscriberStore(store);
    statusMessage = `Auto-alert on high-fit prospect discovery ${enabled ? 'enabled' : 'paused'}`;
    return this.getStatus();
  },

  async sendTestEmail(): Promise<{ ok: boolean; message: string; status: BrevoEmailStatus }> {
    const store = loadSubscriberStore();
    if (!emailConfig.apiKey || !emailConfig.senderEmail) {
      throw new Error('Configure Brevo sender email & API key first');
    }
    if (store.subscribers.length === 0) {
      throw new Error('Add a subscriber first; the test goes only to the first listed address');
    }

    const recipient = store.subscribers[0].email;
    const sampleProspect: Prospect = {
      id: 'test-1',
      projectId: 'test',
      fullName: 'Test Decision-Maker',
      jobTitle: 'VP of Enterprise Strategy',
      seniority: 'VP',
      department: 'Strategy',
      icpSegmentId: 'icp-1',
      buyingRole: 'Decision Maker',
      companyName: 'ProspectIQ Verification',
      location: 'Verified Test Delivery',
      locationVerified: true,
      titleVerified: true,
      email: recipient,
      emailVerified: true,
      linkedinUrl: 'https://www.linkedin.com',
      linkedinVerified: true,
      sources: [
        {
          title: 'Brevo Transactional SMTP Test',
          url: 'https://www.brevo.com',
          provider: 'Brevo SMTP',
          verifiedAt: new Date().toISOString().slice(0, 10),
        },
      ],
      score: {
        totalScore: 96,
        titleRelevance: 35,
        seniorityFit: 24,
        industryFit: 19,
        objectiveAlignment: 18,
        reasons: {
          titleReason: 'Test verification payload',
          seniorityReason: 'VP level',
          industryReason: 'Enterprise SaaS',
          objectiveReason: 'Brevo delivery confirmed',
        },
      },
      emailSubject: 'ProspectIQ · Brevo Email Delivery Verification',
      emailBody: 'Brevo transactional email delivery is configured and active for ProspectIQ.',
      connectionDraft: 'Brevo email delivery is configured and active for ProspectIQ outreach digests.',
      qualityReport: {
        charCount: 78,
        isWithinLimit: true,
        qualityScore: 98,
        spamWordsFound: [],
        usesVerifiedSignal: true,
      },
      outreachStatus: 'Sent via Brevo',
      provenance: 'LIVE_SEARCH',
      updatedAt: new Date().toISOString(),
    };

    try {
      const oneToOne = buildCleanOneToOneEmail(sampleProspect, 'email');
      await postBrevoSmtp({
        senderEmail: emailConfig.senderEmail,
        recipientEmail: recipient,
        subject: 'ProspectIQ · Test Email Delivery Confirmed',
        htmlContent: oneToOne.htmlContent,
        textContent: oneToOne.textContent,
        apiKey: emailConfig.apiKey,
      });
      store.sent += 1;
      statusMessage = `Test email accepted by Brevo for ${recipient}`;
      saveSubscriberStore(store);
      return {
        ok: true,
        message: statusMessage,
        status: this.getStatus(),
      };
    } catch (err) {
      store.failed += 1;
      const detail = redactError(err, emailConfig.apiKey);
      statusMessage = `Test email failed: ${detail}`;
      saveSubscriberStore(store);
      throw new Error(statusMessage);
    }
  },

  async sendDigestToSubscribers(
    project: ResearchProject,
    selectedProspectIds?: string[],
    draftMode: 'email' | 'concise' = 'email',
    targetEmail?: string
  ): Promise<{ ok: boolean; sentCount: number; message: string; status: BrevoEmailStatus }> {
    const store = loadSubscriberStore();
    if (!emailConfig.apiKey || !emailConfig.senderEmail) {
      throw new Error('Configure Brevo sender email & API key in the Email Alerts drawer first');
    }

    const prospects =
      selectedProspectIds && selectedProspectIds.length > 0
        ? project.prospects.filter((p) => selectedProspectIds.includes(p.id))
        : project.prospects;

    if (prospects.length === 0) {
      throw new Error('No prospects selected to send');
    }

    const primaryProspect = prospects[0];

    // If a specific target email is passed directly (even if not in prospects or subscribers), send directly to it!
    if (targetEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail.trim())) {
      const recipient = targetEmail.trim().toLowerCase();
      const matched = project.prospects.find((p) => p.email && p.email.toLowerCase() === recipient);
      const prospectToSend = matched || primaryProspect;
      const oneToOne = buildCleanOneToOneEmail(prospectToSend, draftMode);

      try {
        await postBrevoSmtp({
          senderEmail: emailConfig.senderEmail,
          recipientEmail: recipient,
          subject: oneToOne.subject,
          htmlContent: oneToOne.htmlContent,
          textContent: oneToOne.textContent,
          apiKey: emailConfig.apiKey,
        });
        store.sent += 1;
        statusMessage = `Sent 1-to-1 outreach email to ${recipient} (Subject: ${oneToOne.subject})`;
        saveSubscriberStore(store);
        return {
          ok: true,
          sentCount: 1,
          message: statusMessage,
          status: this.getStatus(),
        };
      } catch (err) {
        store.failed += 1;
        const detail = redactError(err, emailConfig.apiKey);
        statusMessage = `Failed sending to ${recipient}: ${detail}`;
        saveSubscriberStore(store);
        throw new Error(statusMessage);
      }
    }

    // Otherwise, send to all emails listed in the subscribers store
    if (store.subscribers.length === 0) {
      throw new Error('Enter an email address to send to, or add a subscriber in the Email Alerts drawer first');
    }

    let sent = 0;
    let failed = 0;
    let lastError = '';

    for (const sub of store.subscribers) {
      const subEmailLower = sub.email.toLowerCase();

      // Check if this subscriber email matches a specific prospect in the current company
      const matchedInProject = project.prospects.find(
        (p) => p.email && p.email.toLowerCase() === subEmailLower
      );

      // If matched, use their tailored draft. If not in prospects (custom/test email), use primaryProspect's proper draft!
      const prospectForRecipient: Prospect = matchedInProject || primaryProspect;

      const oneToOne = buildCleanOneToOneEmail(prospectForRecipient, draftMode);

      try {
        await postBrevoSmtp({
          senderEmail: emailConfig.senderEmail,
          recipientEmail: sub.email,
          subject: oneToOne.subject,
          htmlContent: oneToOne.htmlContent,
          textContent: oneToOne.textContent,
          apiKey: emailConfig.apiKey,
        });
        sent += 1;
      } catch (err) {
        failed += 1;
        lastError = redactError(err, emailConfig.apiKey);
      }
    }

    store.sent += sent;
    store.failed += failed;
    statusMessage =
      failed === 0
        ? `Sent 1-to-1 personalized outreach email (${primaryProspect.fullName}) to ${sent} recipient(s)`
        : `Sent to ${sent}; ${failed} failed. ${lastError}`;
    saveSubscriberStore(store);

    if (sent === 0 && failed > 0) {
      throw new Error(statusMessage);
    }

    return {
      ok: true,
      sentCount: sent,
      message: statusMessage,
      status: this.getStatus(),
    };
  },

  queueHighFitProspectsAlert(project: ResearchProject, newProspects: Prospect[]): void {
    const store = loadSubscriberStore();
    if (!store.autoAlert || !emailConfig.apiKey || !emailConfig.senderEmail || store.subscribers.length === 0) {
      return;
    }
    const highFit = newProspects.filter((p) => p.score.totalScore >= 80);
    if (highFit.length === 0) return;

    burstQueue.push({ project, prospects: highFit });
    if (!burstTimer) {
      burstTimer = setTimeout(async () => {
        const items = [...burstQueue];
        burstQueue = [];
        burstTimer = null;
        for (const item of items) {
          try {
            await this.sendDigestToSubscribers(
              item.project,
              item.prospects.map((p) => p.id)
            );
          } catch {
            // status already recorded
          }
        }
      }, 10000);
    }
  },
};
