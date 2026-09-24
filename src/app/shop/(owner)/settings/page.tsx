import { updateShopSettings } from "@/app/shop/actions";
import { getShopContext } from "@/lib/shop-portal";
import { ShopPageHeader } from "@/components/shop-page";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export const dynamic = "force-dynamic";

export default async function ShopSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const context = await getShopContext();
  if (!context) return <Alert tone="error">Shop workspace unavailable.</Alert>;
  const params = await searchParams;
  const { data: settings } = await context.client
    .from("shop_settings")
    .select("accepting_orders, payment_mode, razorpay_key_id, razorpay_key_secret, razorpay_webhook_secret")
    .eq("shop_id", context.shop.id)
    .maybeSingle();

  const isRazorpayConfigured = Boolean(settings?.razorpay_key_id && settings?.razorpay_key_secret);

  return (
    <div className="space-y-8">
      <ShopPageHeader
        eyebrow="Shop configuration"
        title="Settings"
        description="Keep your public shop details, operating availability, and direct payment gateway current."
      />
      {params.error ? <Alert tone="error">{params.error}</Alert> : null}
      {params.success ? <Alert tone="success">{params.success}</Alert> : null}

      <form action={updateShopSettings} className="space-y-8 max-w-3xl">
        {/* 1. Shop Details Card */}
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-brand-950 text-lg">Shop details</h2>
            <p className="mt-1 text-sm text-muted">Basic shop information and availability status.</p>
          </CardHeader>
          <CardContent className="space-y-5">
            <Input id="name" name="name" label="Shop name" defaultValue={context.shop.name} required />
            <div className="grid gap-5 sm:grid-cols-2">
              <Input id="phone" name="phone" label="Contact phone" defaultValue={context.shop.phone ?? ""} />
              <Input
                id="email"
                name="email"
                label="Contact email"
                type="email"
                defaultValue={context.shop.email ?? ""}
              />
            </div>
            <Input id="address" name="address" label="Address" defaultValue={context.shop.address ?? ""} />
            <div className="grid gap-5 sm:grid-cols-2">
              <Select
                id="isActive"
                name="isActive"
                label="Shop active"
                defaultValue={context.shop.is_active ? "true" : "false"}
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </Select>
              <Select
                id="acceptingOrders"
                name="acceptingOrders"
                label="Accepting orders"
                defaultValue={settings?.accepting_orders ?? true ? "true" : "false"}
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </Select>
            </div>

            <div className="pt-3 border-t border-line">
              <label className="text-sm font-semibold text-brand-950 block mb-1">
                Payment Collection Mode
              </label>
              <p className="text-xs text-muted mb-3">
                Choose how customers can pay: cash/UPI at the counter with a sequential token, online via Razorpay, or both.
              </p>
              <Select
                id="paymentMode"
                name="paymentMode"
                label="Payment Mode"
                defaultValue={settings?.payment_mode ?? "both"}
              >
                <option value="both">Both (Customer Choice: Online or Pay at Counter)</option>
                <option value="counter">Pay at Counter Only (Generate Token; cash/UPI at counter)</option>
                <option value="online">Accept Payment Online Only (Razorpay)</option>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* 2. Direct Razorpay Payment Gateway Card */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-brand-950 text-lg">Direct Customer Payment Gateway (Razorpay)</h2>
                <p className="mt-1 text-sm text-muted">
                  Connect your own Razorpay account so customer print payments are credited directly into your bank account.
                </p>
              </div>
              <Badge tone={isRazorpayConfigured ? "success" : "warning"}>
                {isRazorpayConfigured ? "Direct Payments Active" : "Not Configured"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-xs text-slate-700 leading-relaxed space-y-2">
              <p className="font-semibold text-slate-900">
                💡 How Direct Payments Work:
              </p>
              <ul className="list-disc list-inside space-y-1 text-slate-600">
                <li>When a customer pays online for a print order, funds go straight into <strong>your</strong> Razorpay account.</li>
                <li>PrintSaathi never touches or holds your customer print earnings.</li>
                <li>Your separate shop subscription plan fee (billed to the platform) is managed under the Subscription tab.</li>
              </ul>
            </div>

            <Input
              id="razorpayKeyId"
              name="razorpayKeyId"
              label="Razorpay Key ID"
              placeholder="rzp_live_... or rzp_test_..."
              defaultValue={settings?.razorpay_key_id ?? ""}
              autoComplete="off"
              spellCheck={false}
            />

            <Input
              id="razorpayKeySecret"
              name="razorpayKeySecret"
              type="password"
              label="Razorpay Key Secret"
              autoComplete="new-password"
              placeholder={
                settings?.razorpay_key_secret
                  ? "•••••••••••••••• (Leave blank to keep saved secret)"
                  : "Enter your Razorpay Key Secret"
              }
              hint={
                settings?.razorpay_key_secret
                  ? "✓ A Key Secret is currently saved. Leave blank to keep it unchanged, or enter a new one to update."
                  : undefined
              }
            />

            <Input
              id="razorpayWebhookSecret"
              name="razorpayWebhookSecret"
              type="password"
              label="Razorpay Webhook Secret (Optional)"
              autoComplete="new-password"
              placeholder={
                settings?.razorpay_webhook_secret
                  ? "•••••••••••••••• (Leave blank to keep saved secret)"
                  : "Enter your Webhook Secret (Optional)"
              }
              hint={
                settings?.razorpay_webhook_secret
                  ? "✓ A Webhook Secret is currently saved. Leave blank to keep it unchanged."
                  : undefined
              }
            />

            <div className="rounded-lg bg-emerald-50/60 border border-emerald-200/70 p-3 text-xs text-emerald-900">
              <span className="font-bold">Need API Keys?</span> Log in to your{" "}
              <a
                href="https://dashboard.razorpay.com/#/app/keys"
                target="_blank"
                rel="noreferrer"
                className="underline font-semibold hover:text-emerald-700"
              >
                Razorpay Dashboard &rarr; Settings &rarr; API Keys
              </a>{" "}
              to generate your Key ID and Key Secret.
            </div>
          </CardContent>
        </Card>

        <div>
          <SubmitButton pendingLabel="Saving settings...">Save all settings</SubmitButton>
        </div>
      </form>
    </div>
  );
}
