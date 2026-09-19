# Printiva Codebase Context & Directory Guide

This document provides a comprehensive overview of the Printiva codebase structure, detailing where specific file types and features are located, how to edit them, and how to run the web and Electron desktop applications.

---

## 🏗️ Architecture Overview

Printiva is a full-stack automated printing management system consisting of:
1. **Next.js Web Application** (`src/app`, `src/components`, `src/lib`): Customer ordering portal, shop owner management dashboard, admin analytics, payment processing (Razorpay), document conversion (LibreOffice/Sharp), and Supabase backend integration.
2. **Electron & Node Desktop Agent** (`src/agent`): Native Windows desktop app and daemon that discovers local physical printers, polls print jobs from Supabase, dispatches print tasks via SumatraPDF/`pdf-to-printer`, and maintains real-time status heartbeats.
3. **Database & Backend Infrastructure** (`supabase/`): Supabase database schema, RLS security policies, document storage buckets, and SQL migrations.
4. **Scripts & Build Utilities** (`scripts/`): Automated environment checks, build bundlers, installer scripts, and E2E smoke tests.

---

## 📁 File Directory & Editing Guide

### 1. Web Application (`src/app/`)
- **Location:** `src/app/`
- **File Types:** Next.js App Router pages (`page.tsx`, `layout.tsx`), Server Actions (`actions/`), API Routes (`api/`).
- **How to Edit:**
  - **Landing & Main Pages:** Edit `src/app/page.tsx` or `src/app/layout.tsx`.
  - **Customer Upload & Ordering:** Edit `src/app/customer/` or `src/app/shop/`.
  - **Shop Owner Portal:** Edit `src/app/shops/` and `src/app/admin/`.
  - **API Endpoints (Webhooks, Agent API, Downloads):** Edit files inside `src/app/api/` (e.g., `src/app/api/payment/webhook/route.ts`, `src/app/api/agent/download/route.ts`).
  - **Global Styles:** Edit `src/app/globals.css`.

### 2. UI Components (`src/components/`)
- **Location:** `src/components/`
- **File Types:** React components (`.tsx`).
- **How to Edit:**
  - **Customer Flow UI:** Modify `src/components/customer-print-flow.tsx`.
  - **Shop & Admin Dashboards:** Edit `src/components/admin-dashboard.tsx` and `src/components/shop-portal-shell.tsx`.
  - **Subscription & Payment Components:** Edit `src/components/subscription-checkout.tsx` and `src/components/billing-mode-toggle.tsx`.
  - **Reusable Design System UI:** Edit files in `src/components/ui/`.

### 3. Business Logic, Pricing & Utilities (`src/lib/`)
- **Location:** `src/lib/`
- **File Types:** TypeScript logic files (`.ts`) and unit tests (`.test.ts`).
- **How to Edit:**
  - **Document Conversion & Page Counting:** Edit `src/lib/document-converter.ts` and `src/lib/normalize-document.ts`.
  - **Pricing Rules & Calculations:** Edit `src/lib/pricing-engine.ts`.
  - **Razorpay Integration:** Edit `src/lib/razorpay.ts` and `src/lib/mock-payments.ts`.
  - **Database & Supabase Queries:** Edit `src/lib/supabase/` and `src/lib/admin-data.ts`.
  - **Printer Availability Logic:** Edit `src/lib/printer-availability.ts`.

### 4. Electron Desktop App & Print Daemon (`src/agent/`)
- **Location:** `src/agent/`
- **File Types:** TypeScript agent scripts, Electron main process, printer hardware interfaces (`.ts`), unit tests (`.test.ts`).
- **How to Edit:**
  - **Electron Main Process & Window Setup:** Edit `src/agent/desktop.ts` (Entry point referenced in `package.json` `"main"`).
  - **Agent UI & Local Web Server:** Edit `src/agent/ui.ts`.
  - **Printer Discovery & USB Detection:** Edit `src/agent/printer-discovery.ts` (Handles physical Windows printer scanning & filtering out virtual printers).
  - **Print Job Execution:** Edit `src/agent/print-executor.ts` (Downloads documents and triggers PDF printing).
  - **Background Daemon & Supabase Polling:** Edit `src/agent/daemon.ts`.
  - **CLI Entry Point:** Edit `src/agent/index.ts`.
  - **Agent Config & Types:** Edit `src/agent/config.ts` and `src/agent/types.ts`.

### 5. Database Schema & Migrations (`supabase/`)
- **Location:** `supabase/`
- **File Types:** SQL migration scripts (`supabase/migrations/*.sql`) and Supabase CLI configuration (`config.toml`).
- **How to Edit:**
  - Add new database tables, RLS policies, or stored procedures by creating a new `.sql` file in `supabase/migrations/`.

### 6. Build, Test & Installer Scripts (`scripts/`)
- **Location:** `scripts/`
- **File Types:** Node.js CommonJS scripts (`.cjs`) and PowerShell scripts (`.ps1`).
- **Key Files:**
  - `scripts/Install-PrintivaAgent.ps1`: Windows installer script.
  - `scripts/copy-print-renderer.cjs`: Bundles SumatraPDF renderer for silent background printing.
  - `scripts/smoke-customer-flow.cjs`: E2E integration test script.

---

## ⚡ Running & Developing the Application

### Dependencies
All project dependencies (including `electron`, `electron-builder`, `next`, `react`, `pdf-to-printer`, `@supabase/supabase-js`, `razorpay`, `tailwindcss`) are installed in `node_modules`.

### Standard NPM Commands

| Task | Command | Description |
| :--- | :--- | :--- |
| **Install Dependencies** | `npm install` *(or `npm.cmd install` on PowerShell if scripts are restricted)* | Installs all required Web & Electron packages. |
| **Run Web Server Only** | `npm run dev:web` | Starts Next.js development server at `http://localhost:3000`. |
| **Run Electron App Only** | `npm run dev:desktop` | Compiles agent TS files and launches the Electron desktop app. |
| **Run Web + Electron Concurrently** | `npm run dev` | Runs both Next.js web app and Electron app side-by-side. |
| **Run Agent CLI (No GUI)** | `npm run dev:agent` | Runs background print daemon directly in console. |
| **Build Web Application** | `npm run build` | Builds production Next.js application. |
| **Build Desktop Standalone (.exe)** | `npm run build:desktop` | Builds Electron Windows installer (`PrintivaAgent.exe`) via `electron-builder`. |
| **Run Unit Tests** | `npm test` | Runs tests using Vitest. |
| **Check Types & Linting** | `npm run typecheck && npm run lint` | Validates TypeScript types and ESLint standards. |

---

## 💡 Notes on PowerShell Script Execution

If running `npm` commands in Windows PowerShell throws a `PSSecurityException` error (*"running scripts is disabled on this system"*), you can use any of the following remedies:

1. **Enable user script execution (Recommended once per machine):**
   ```powershell
   Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
   ```
2. **Or run with `.cmd` extension:**
   ```powershell
   npm.cmd install
   npm.cmd run dev
   ```
