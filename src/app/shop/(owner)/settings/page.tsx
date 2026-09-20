import { updateShopSettings } from "@/app/shop/actions";
import { getShopContext } from "@/lib/shop-portal";
import { ShopPageHeader } from "@/components/shop-page";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
    .select("accepting_orders, payment_mode")
    .eq("shop_id", context.shop.id)
    .maybeSingle();
  return (
    <div className="space-y-8">
      <ShopPageHeader
        eyebrow="Shop configuration"
        title="Settings"
        description="Keep your public shop details and operating availability current. Private owner data is never shown on the customer route."
      />
      {params.error ? <Alert tone="error">{params.error}</Alert> : null}
      {params.success ? <Alert tone="success">{params.success}</Alert> : null}
      <Card className="max-w-3xl">
        <CardHeader>
          <h2 className="font-semibold text-brand-950">Shop details</h2>
          <p className="mt-1 text-sm text-muted">Shop active, accepting orders, and payment collection mode.</p>
        </CardHeader>
        <CardContent>
          <form action={updateShopSettings} className="space-y-5">
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
                Choose how customers pay: cash at the counter with a sequential token, online via Razorpay, or both.
              </p>
              <Select
                id="paymentMode"
                name="paymentMode"
                label="Payment Mode"
                defaultValue={settings?.payment_mode ?? "both"}
              >
                <option value="both">Both (Customer Choice: Online or Pay at Counter)</option>
                <option value="counter">Pay at Counter Only (Generate Token; cash at counter)</option>
                <option value="online">Accept Payment Online Only (Razorpay)</option>
              </Select>
            </div>

            <SubmitButton pendingLabel="Saving settings...">Save settings</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
