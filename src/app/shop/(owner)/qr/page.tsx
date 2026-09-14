import Link from "next/link";
import QRCode from "qrcode";
import Image from "next/image";
import { getShopContext } from "@/lib/shop-portal";
import { getShopCustomerUrl } from "@/lib/shops/public-url";
import { ShopPageHeader } from "@/components/shop-page";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { QrActions } from "@/components/qr-actions";

export const dynamic = "force-dynamic";

export default async function ShopQrPage() {
  const context = await getShopContext();
  if (!context) return <Alert tone="error">Shop workspace unavailable.</Alert>;
  const { data: qr, error } = await context.client
    .from("qr_codes")
    .select("public_token, is_active")
    .eq("shop_id", context.shop.id)
    .maybeSingle();
  if (error)
    return (
      <Alert tone="error" title="QR code unavailable">
        The shop QR record could not be loaded.
      </Alert>
    );
  const identifier = context.shop.public_id;
  const customerUrl = getShopCustomerUrl(identifier);
  const qrDataUrl = qr?.is_active
    ? await QRCode.toDataURL(customerUrl, { margin: 2, width: 420, color: { dark: "#0b2b1c", light: "#ffffff" } })
    : null;
  return (
    <div className="space-y-8">
      <ShopPageHeader
        eyebrow="Customer entry"
        title="Your shop QR code"
        description="This QR destination uses the existing public shop identifier. It does not expose your internal shop UUID."
      />
      <div className="grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
        <Card className="flex min-h-80 items-center justify-center p-8">
          {qrDataUrl ? (
            <Image
              className="size-56 rounded-lg"
              src={qrDataUrl}
              alt={`QR code for ${context.shop.name}`}
              width={420}
              height={420}
              unoptimized
            />
          ) : (
            <div className="text-center text-sm text-muted">No active QR record</div>
          )}
        </Card>
        <Card className="p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-600">Customer URL</p>
          <h2 className="mt-3 break-all text-xl font-semibold text-brand-950">{customerUrl}</h2>
          <p className="mt-4 text-sm leading-6 text-muted">
            Customers will open this public route when they scan your printed QR, upload documents, configure printing,
            and pay to start their print order.
          </p>
          <div className="mt-7">
            <QrActions url={customerUrl} dataUrl={qrDataUrl} enabled={Boolean(qr?.is_active)} />
          </div>
          {!qr ? (
            <Alert className="mt-6" tone="warning">
              No QR record exists for this shop yet. Complete onboarding data setup before distributing a QR.
            </Alert>
          ) : !qr.is_active ? (
            <Alert className="mt-6" tone="warning">
              This QR code is inactive.
            </Alert>
          ) : (
            <p className="mt-6 text-xs text-muted">
              Identifier: <span className="font-mono text-brand-800">{identifier}</span>
            </p>
          )}
        </Card>
      </div>
      <p className="text-sm text-muted">
        Public entry preview:{" "}
        <Link className="font-semibold text-brand-700" href={`/shop/${identifier}`}>
          Open customer page
        </Link>
      </p>
    </div>
  );
}
