# ProspectIQ (v2.1)

> **AI-Powered B2B Account Intelligence, Buying Committee Discovery, 100-Point Explainable Scoring & Brevo Transactional Outreach Studio**

ProspectIQ is a production-grade B2B intelligence and outbound enablement application. Designed with a clean, high-density interface inspired by **Linear**, **Attio**, and **Stripe**, ProspectIQ streamlines the end-to-end account-based marketing (ABM) workflow: from domain intelligence gathering and multi-ICP segmentation to verified prospect discovery, transparent scoring, and clean 1-to-1 Brevo email delivery.

---

## Key Capabilities

### 1. Account Intelligence & ICP Segmentation
- **Domain-First Extraction:** Enter any target company URL (e.g. `https://www.microsoft.com`, `https://stripe.com`, `https://snowflake.com`).
- **Resilient Multi-Source Enrichment:** Combines Clearbit Brand API logos, Wikipedia executive summaries, Hunter.io company domain search, and Google Gemini AI structured grounding.
- **3-Tier ICP Personas:** Generates 3 distinct Ideal Customer Profile personas (Economic Buyer, Champion/Evaluator, Technical Stakeholder) mapped directly to corporate pain points.
- **Verified Buying Signals:** Identifies active market triggers (enterprise AI initiatives, cloud modernizations, geographic expansions) with direct source links.

### 2. Multi-Waterfall Prospect Discovery & Zero-Hallucination Guardrails
- **Automated Waterfall:** Traverses **Hunter.io Domain Search (`HUNTER_API_KEY`)**, **Google Gemini Search Grounding (`GEMINI_API_KEY`)**, **Serper.dev (`SERPER_API_KEY`)**, and **Tavily AI Search (`TAVILY_API_KEY`)**.
- **Zero Hallucination Guarantee:** Never invents fake decision-makers or URLs. Every prospect includes verified work emails, confidence scores, and real public profile links.
- **Guided Manual Fallback:** Instant pre-filtered Google & Bing Boolean search queries (`site:linkedin.com/in/ "Company" "VP"`) plus a manual verified prospect entry modal.

### 3. Transparent 100-Point Scoring Engine
Every prospect is evaluated across four transparent, explainable dimensions with a visual breakdown:
1. **Title Relevance (0–35 pts):** Match against target buying roles and ICP priorities.
2. **Seniority & Decision Authority (0–25 pts):** Budget control and decision power (C-Suite, VP, Director).
3. **Industry & Company Fit (0–20 pts):** Alignment with target enterprise profile.
4. **Objective Alignment & Verification (0–20 pts):** Data freshness, verified work email, and source confidence.

### 4. Multi-Tone Outreach Studio & Anti-Spam Linter
- **Dynamic Tone Switcher:**
  - **Executive:** High-level strategic alignment focused on enterprise efficiency.
  - **Consultative:** Pain-point problem-solving tailored to the prospect's operational mandate.
  - **MBA / Research Brief:** Academic, objective brief analyzing industry positioning.
- **Dual Format Controls:**
  - **Full Personalized Email:** Multi-paragraph executive outreach email (Subject + Body).
  - **Concise Direct Note (≤ 300 chars):** Ultra-short message with real-time character limit enforcement.
- **Quality & Anti-Spam Linter:** Scans for sales buzzwords ("synergy", "touch base", "game-changing") and scores outreach deliverability.

### 5. Brevo Transactional Email Engine
- **Clean 1-to-1 Dispatch:** Dispatches personal plain-text or clean HTML executive emails without internal scoring tables or debug markers.
- **Subscribed Alert Lists:** Add/remove subscriber email addresses with explicit opt-in consent verification.
- **Direct Recipient Override:** Option to send outreach directly to any specified email address on demand.
- **Enterprise Credential Security:** Brevo credentials can be encrypted for the current Windows user account via Windows DPAPI (`%LOCALAPPDATA%\ProspectIQ\brevo_credentials.dpapi`) or configured via `.env`.

### 6. Dual-View Tracking & Dual CSV Export
- **Data Table & Pipeline Board:** Switch between a high-density data table with tabular numerals and an Attio-style Kanban board (`Researched` → `Draft Ready` → `Sent via Brevo` → `Accepted` → `Follow-up Needed`).
- **Flexible Export:** Download either a comprehensive **Full Research Audit CSV** or a sanitized **Campaign-Ready CSV** for import into CRM or sales engagement platforms.

---

## Tech Stack & Architecture

- **Frontend:**
  - [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
  - [Tailwind CSS v4](https://tailwindcss.com/) with native design tokens (`color-scheme: light dark`, `light-dark()`)
  - [Lucide Icons](https://lucide.dev/)
  - [Vite 6](https://vitejs.dev/) with hot-module replacement
- **Backend:**
  - [Node.js](https://nodejs.org/) & [Express 5](https://expressjs.com/)
  - [`@google/genai`](https://www.npmjs.com/package/@google/genai) SDK (`gemini-2.5-flash` / `gemini-3.8-flash`)
  - [Brevo Transactional Email API](https://developers.brevo.com/reference/sendtransacemail)
  - Windows DPAPI encryption via PowerShell / local server persistence

---

## Getting Started

### Prerequisites

- **Node.js**: v18.18+ or v20+ recommended
- **npm**: v9+
- OS: Windows, macOS, or Linux

### 1. Clone the Repository

```bash
git clone https://github.com/isacpkoshy/prospect-iq.git
cd prospect-iq
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` to supply your API credentials:

```ini
PORT=3001

# 1. Google Gemini API Key (Recommended - powers company extraction & AI outreach drafting)
# Get your free key at: https://aistudio.google.com/app/apikey
GEMINI_API_KEY=your_gemini_api_key_here

# 2. Hunter.io Domain Search API Key (Optional - verified corporate emails & titles)
# Get a key at: https://hunter.io/api
HUNTER_API_KEY=your_hunter_api_key_here

# 3. Web Search APIs (Optional - automated public web prospect discovery)
SERPER_API_KEY=your_serper_api_key_here
TAVILY_API_KEY=your_tavily_api_key_here

# 4. Brevo Transactional Email (Optional - can also be configured & encrypted directly in the UI)
# Get a free key at: https://app.brevo.com/settings/keys/api
BREVO_API_KEY=xkeysib-your_brevo_api_key_here
BREVO_SENDER_EMAIL=your_verified_sender@domain.com
```

> **Note:** ProspectIQ works even with zero API keys configured using built-in public enrichment (Clearbit + Wikipedia) and Guided Manual discovery mode!

### 4. Run Development Servers

Start both the backend Express API server and the frontend Vite server concurrently:

```bash
npm run dev
```

- **Frontend Application:** [http://localhost:5173](http://localhost:5173)
- **Backend API Server:** [http://127.0.0.1:3001/api](http://127.0.0.1:3001/api)

### 5. Production Build

To build the client assets for production:

```bash
npm run build
```

To run the production server:

```bash
npm start
```

---

## Project Structure

```
prospect-iq/
├── server/
│   ├── index.ts                  # Express server entry point & route registration
│   ├── config.ts                 # Server environment & capability checks
│   ├── brevoEmail.ts             # Brevo SMTP API dispatcher, templates & subscriber management
│   ├── companyResearch.ts        # Company intelligence extraction & enrichment
│   ├── prospectDiscovery.ts      # Multi-source waterfall discovery engine
│   ├── prospectScoring.ts        # 100-point explainable fit scoring algorithm
│   └── secureStorage.ts          # Windows DPAPI encryption & file storage
├── src/
│   ├── components/
│   │   ├── ApiConfigModal.tsx            # API key & sender profile configuration modal
│   │   ├── BrevoEmailDrawer.tsx          # Slide-over Brevo email subscription & dispatch drawer
│   │   ├── CompanyResearchSection.tsx    # Company summary, ICP personas & buying signals
│   │   ├── OutreachTracker.tsx           # Decision-makers table & Kanban board
│   │   ├── ProspectDetailDrawer.tsx      # Slide-over 100-pt breakdown & tone composer
│   │   └── ProspectDiscoveryBar.tsx      # Targeting criteria bar & manual prospect entry
│   ├── services/
│   │   └── apiClient.ts          # Type-safe frontend client for server endpoints
│   ├── types/
│   │   └── prospectiq.ts         # TypeScript data contracts & models
│   ├── App.tsx                   # Main application layout, sidebar & state coordinator
│   ├── index.css                 # Production design system tokens & component classes
│   └── main.tsx                  # React DOM mount point
├── data/
│   └── seed_demo_projects.ts     # Pre-loaded demo accounts (Microsoft, Snowflake, Stripe)
├── .env.example                  # Environment configuration template
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## API Endpoints Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/capabilities` | Checks availability of Gemini, Hunter, Serper, Tavily, and Brevo |
| `POST` | `/api/config/keys` | Saves API keys to server `.env` |
| `DELETE` | `/api/config/keys/:keyName` | Clears a specific saved API key |
| `POST` | `/api/company/research` | Extracts company intelligence and ICPs from a URL |
| `POST` | `/api/prospects/discover` | Runs multi-waterfall prospect discovery |
| `POST` | `/api/prospects/outreach/regenerate` | Generates outreach drafts in a specific tone |
| `GET` | `/api/brevo/status` | Retrieves Brevo delivery readiness and subscriber list |
| `POST` | `/api/brevo/config` | Saves verified sender email & DPAPI encrypted API key |
| `POST` | `/api/brevo/subscribers` | Adds, removes, or clears consent-verified subscribers |
| `POST` | `/api/brevo/send-digest` | Dispatches clean 1-to-1 outreach or digest via Brevo |
| `POST` | `/api/brevo/test-send` | Dispatches a test verification email |

---

## Contributing & Development Guidelines

1. **Accessibility & Contrast:** Always maintain at least a 3:1 non-text contrast ratio for inputs (`--border-input`) and 4.5:1 for body copy per WCAG AA standards.
2. **Light & Dark Mode:** Use the centralized CSS tokens (`--surface`, `--border`, `--text`, `--accent`) via `light-dark()` rather than hardcoding static hex colors.
3. **No Secret Leaks:** Never bundle API keys into client code. All external AI, Hunter, and Brevo calls are dispatched server-side.

---

## License

MIT License. Designed and engineered for high-performance B2B sales development and executive intelligence workflows.
