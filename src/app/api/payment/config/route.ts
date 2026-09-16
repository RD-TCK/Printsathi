import { NextResponse } from "next/server";
import { mockPaymentsEnabled } from "@/lib/mock-payments";
import { getRazorpayServerEnv } from "@/lib/env";

export const dynamic = "force-dynamic";
export function GET() {
  return NextResponse.json({ mockEnabled: mockPaymentsEnabled(), razorpayEnabled: Boolean(getRazorpayServerEnv()) },
    { headers: { "Cache-Control": "no-store" } });
}
