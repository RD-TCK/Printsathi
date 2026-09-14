import Link from "next/link";
import { ArrowRight, MonitorDown, ShieldCheck, Printer, PlugZap, Download, LayoutDashboard, Cpu } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { MarketingFooter, SectionHeading } from "@/components/marketing-site";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata = {
  title: "Download Desktop Agent — PrintSathi",
  description:
    "Download the PrintSathi Windows Desktop Agent. Runs silently as a Windows Service, auto-discovers printers, and handles print jobs automatically.",
};

const installSteps = [
  {
    step: 1,
    icon: Download,
    title: "Download the installer",
    body: 'Click "Download for Windows" and save both PrintSaathiAgent.exe and Install-PrintSaathiAgent.ps1 to the same folder.',
  },
  {
    step: 2,
    icon: Cpu,
    title: "Run the installer",
    body: "Right-click Install-PrintSaathiAgent.ps1 → Run with PowerShell. It installs the agent as a Windows Service and adds a system-tray icon automatically.",
  },
  {
    step: 3,
    icon: PlugZap,
    title: "Pair with your shop",
    body: "Generate a one-time pairing code in Shop Portal → Hardware Bridge. Right-click the tray icon → Agent Status and enter the code.",
  },
  {
    step: 4,
    icon: Printer,
    title: "Select your printer",
    body: "The agent auto-discovers all Windows printers. Select the default print destination from the tray menu or agent status page.",
  },
  {
    step: 5,
    icon: LayoutDashboard,
    title: "Access your dashboard",
    body: "Double-click the tray icon anytime to open the Shop Owner Dashboard directly from your desktop — no browser bookmark needed.",
  },
];

export default function DownloadPage() {
  return (
    <div>
      <SiteHeader />
      <main>
        {/* Hero */}
        <section className="bg-brand-50">
          <div className="mx-auto max-w-4xl px-6 py-20 text-center lg:px-8 lg:py-28">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-100/70 px-4 py-1.5 text-xs font-semibold text-emerald-800">
              ⚡ 100% Web Compatible — No Installation Required
            </div>
            <MonitorDown className="mx-auto size-10 text-brand-600" />
            <SectionHeading
              align="center"
              eyebrow="Optional for shop owners"
              title="PrintSathi Windows Desktop Agent (Optional)"
              description="PrintSaathi works 100% in your browser out of the box! If you prefer silent background spooling without leaving a web tab open, you can optionally install our lightweight Windows Agent."
            />
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild variant="primary" size="lg">
                <Link href="/shop/jobs">
                  <Printer className="size-4" />
                  Use Web Station (No Install)
                </Link>
              </Button>
              {/* Primary: download exe */}
              <Button asChild variant="secondary" size="lg">
                <a href="/api/agent/download">
                  <Download className="size-4" />
                  Download for Windows (Optional)
                </a>
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted">
              Windows 10 / 11 &nbsp;·&nbsp; 64-bit &nbsp;·&nbsp; No Node.js required
            </p>
          </div>
        </section>

        {/* What you get callout */}
        <section className="border-b border-line bg-white">
          <div className="mx-auto max-w-5xl px-6 py-10 lg:px-8">
            <div className="flex flex-wrap items-center justify-center gap-8 text-sm font-medium text-brand-800">
              {[
                "🖥️ System tray icon for quick dashboard access",
                "⚙️ Auto-starts as a Windows Service",
                "🖨️ Auto-discovers all Windows printers",
                "📄 Handles PDF print jobs automatically",
                "🔒 Secure — no cloud access to your printer",
              ].map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>
        </section>

        {/* Steps */}
        <section className="mx-auto max-w-5xl px-6 py-16 lg:px-8">
          <SectionHeading
            eyebrow="Setup"
            title="Up and running in 5 minutes"
            description="A one-click installer handles the Windows Service, system tray, and Desktop shortcut — no technical knowledge required."
          />
          <div className="mt-10 grid gap-5 md:grid-cols-5">
            {installSteps.map(({ step, icon: Icon, title, body }) => (
              <Card className="p-6" key={title}>
                <div className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-brand-100 text-sm font-bold text-brand-800">
                    {step}
                  </span>
                  <Icon className="size-5 text-brand-600" />
                </div>
                <h2 className="mt-4 font-semibold text-brand-950">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* Tray screenshot callout */}
        <section className="mx-auto max-w-5xl px-6 pb-16 lg:px-8">
          <div className="overflow-hidden rounded-2xl border border-line bg-brand-950 p-8 md:flex md:items-center md:gap-10">
            <div className="flex-1">
              <p className="text-xs font-bold uppercase tracking-wider text-brand-400">System Tray</p>
              <h2 className="mt-2 text-xl font-bold text-white">Your shop dashboard, one click away</h2>
              <p className="mt-3 text-sm leading-6 text-brand-300">
                After installation the PrintSathi icon lives in your Windows taskbar notification area. Double-click to
                open the Shop Owner Dashboard, or right-click for printer status and agent controls — without opening a
                browser or remembering a URL.
              </p>
              <div className="mt-6">
                <Button asChild size="lg">
                  <Link href="/shop/printer">
                    Open Shop Printer Setup <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </div>
            </div>
            {/* Mini tray menu mock */}
            <div className="mt-8 shrink-0 md:mt-0">
              <div className="w-56 overflow-hidden rounded-xl border border-brand-800 bg-brand-900 shadow-2xl">
                <div className="border-b border-brand-800 bg-brand-950 px-4 py-3">
                  <p className="text-xs font-bold text-brand-400">PRINTSATHI AGENT</p>
                  <p className="mt-0.5 text-xs text-emerald-400">● Connected &amp; Online</p>
                </div>
                {[
                  { icon: "📊", label: "Open Shop Dashboard" },
                  { icon: "🖨️", label: "Agent Status &amp; Printers" },
                ].map(({ icon, label }) => (
                  <div
                    key={label}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-brand-200 hover:bg-brand-800"
                  >
                    <span>{icon}</span>
                    <span dangerouslySetInnerHTML={{ __html: label }} />
                  </div>
                ))}
                <div className="my-1 border-t border-brand-800" />
                <div className="flex items-center gap-3 px-4 py-2.5 text-sm text-brand-400">
                  <span>✕</span> Exit Tray
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Feature cards */}
        <section className="mx-auto grid max-w-5xl gap-5 px-6 py-16 md:grid-cols-3 lg:px-8">
          {[
            [
              ShieldCheck,
              "Secure boundary",
              "The cloud never touches your printer directly. Only the credentialed local agent bridges to the Windows Print Spooler.",
            ],
            [
              MonitorDown,
              "Windows-ready",
              "Discovers printers via Win32_Printer CIM, submits PDFs through the native PrintTo verb. No drivers to install.",
            ],
            [
              PlugZap,
              "Built for reliability",
              "Atomic job claims, heartbeat health checks, lease-based crash recovery, auto-restart via NSSM, and bounded retries.",
            ],
          ].map(([Icon, title, body]) => (
            <Card className="p-6" key={title as string}>
              <Icon className="size-6 text-brand-600" />
              <h2 className="mt-6 font-semibold text-brand-950">{title as string}</h2>
              <p className="mt-3 text-sm leading-6 text-muted">{body as string}</p>
            </Card>
          ))}
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
