import Link from "next/link";
import { Mail, Phone, MapPin, Clock, MessageSquare, Send, CheckCircle2 } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { MarketingFooter } from "@/components/marketing-site";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Contact Us & Support",
  description:
    "Get in touch with Printiva support for order assistance, print shop onboarding, desktop agent setup, and general inquiries.",
  path: "/contact",
  keywords: ["Printiva contact", "print shop support India", "Printiva customer care", "printer agent support"],
});

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col">
      <SiteHeader />

      <main className="flex-1 py-12 sm:py-20">
        <div className="mx-auto max-w-5xl px-6 lg:px-8">
          {/* Header */}
          <div className="border-b border-slate-200 pb-8 text-center sm:text-left">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3.5 py-1 text-xs font-bold text-emerald-800 border border-emerald-200 mb-4">
              <MessageSquare className="size-4 text-emerald-600" />
              We&apos;re Here to Help
            </div>
            <h1 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight">
              Contact &amp; Support
            </h1>
            <p className="mt-3 text-sm sm:text-base text-slate-600 max-w-2xl">
              Have a question about an order, need assistance setting up your print shop agent, or exploring a partnership? Get in touch with our team.
            </p>
          </div>

          <div className="mt-10 grid gap-8 lg:grid-cols-3">
            {/* Contact Information Cards (1 col on desktop) */}
            <div className="space-y-4 lg:col-span-1">
              <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-xs space-y-4">
                <h2 className="text-base font-bold text-slate-900">Direct Contact</h2>

                <div className="flex items-start gap-3 text-xs sm:text-sm text-slate-600">
                  <Mail className="size-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="block font-bold text-slate-900">Email Support</span>
                    <a href="mailto:support@printiva.in" className="text-emerald-700 hover:underline">
                      support@printiva.in
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3 text-xs sm:text-sm text-slate-600">
                  <Clock className="size-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="block font-bold text-slate-900">Operating Hours</span>
                    <span>Monday to Saturday</span>
                    <span className="block text-slate-500 text-xs">9:00 AM – 8:00 PM IST</span>
                  </div>
                </div>

                <div className="flex items-start gap-3 text-xs sm:text-sm text-slate-600">
                  <MapPin className="size-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="block font-bold text-slate-900">Headquarters</span>
                    <span>Printiva Digital Platform</span>
                    <span className="block text-slate-500 text-xs">India</span>
                  </div>
                </div>
              </div>

              {/* Shop Partner Callout */}
              <div className="rounded-2xl bg-emerald-950 text-white p-6 shadow-md">
                <h3 className="text-base font-bold text-white">Own a Print Shop?</h3>
                <p className="mt-2 text-xs sm:text-sm text-white/70 leading-relaxed">
                  Start our ₹100 for 7 days trial. Connect your existing Windows printer in under 3 minutes with automated counter queueing.
                </p>
                <div className="mt-4">
                  <Link
                    href="/register"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 hover:text-emerald-300 transition"
                  >
                    Register your shop now →
                  </Link>
                </div>
              </div>
            </div>

            {/* Quick Inquiry Form (2 cols on desktop) */}
            <div className="lg:col-span-2">
              <div className="rounded-2xl bg-white border border-slate-200 p-6 sm:p-10 shadow-xs">
                <h2 className="text-xl font-bold text-slate-900">Send us a Message</h2>
                <p className="mt-1 text-xs sm:text-sm text-slate-500">
                  Fill in your details below and our team will get back to you within 24 hours.
                </p>

                <form
                  className="mt-6 space-y-4"
                  action="mailto:support@printiva.in"
                  method="GET"
                  encType="text/plain"
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                        Your Name
                      </label>
                      <input
                        type="text"
                        name="name"
                        required
                        placeholder="Rahul Sharma"
                        className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 transition"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                        Phone / WhatsApp
                      </label>
                      <input
                        type="tel"
                        name="phone"
                        placeholder="+91 98765 43210"
                        className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 transition"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                        Email Address
                      </label>
                      <input
                        type="email"
                        name="email"
                        required
                        placeholder="rahul@example.com"
                        className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 transition"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                        Order ID or Token # (Optional)
                      </label>
                      <input
                        type="text"
                        name="order_ref"
                        placeholder="e.g. Token #3 or order ID"
                        className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                      Subject
                    </label>
                    <select
                      name="subject"
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 transition bg-white"
                    >
                      <option value="Customer Order Help">Customer Order Help / Token Query</option>
                      <option value="Shopkeeper Onboarding">Shopkeeper Onboarding &amp; Setup</option>
                      <option value="Desktop Agent Installation">Desktop Agent Installation Issue</option>
                      <option value="Refund Request">Refund / Cancellation Request</option>
                      <option value="Partnership / Other">Partnership &amp; General Inquiries</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                      Message
                    </label>
                    <textarea
                      name="body"
                      rows={4}
                      required
                      placeholder="Describe your issue or query with as much detail as possible..."
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 transition"
                    />
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-emerald-600 to-emerald-700 px-6 py-3 text-sm font-bold text-white shadow-md hover:from-emerald-500 hover:to-emerald-600 transition active:scale-95 cursor-pointer"
                    >
                      <Send className="size-4" /> Send Inquiry
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-slate-200 flex flex-wrap gap-4 justify-between items-center text-xs sm:text-sm text-slate-500">
            <div>© 2026 Printiva. All rights reserved.</div>
            <div className="flex gap-4">
              <Link href="/privacy" className="hover:text-emerald-700 underline">Privacy Policy</Link>
              <Link href="/terms" className="hover:text-emerald-700 underline">Terms of Service</Link>
              <Link href="/refund" className="hover:text-emerald-700 underline">Refund Policy</Link>
              <Link href="/shipping" className="hover:text-emerald-700 underline">Counter Pick-up Policy</Link>
            </div>
          </div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
