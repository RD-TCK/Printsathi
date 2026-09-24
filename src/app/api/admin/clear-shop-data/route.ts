import { NextResponse } from "next/server";
import { clearShopDataAction } from "@/app/admin/actions";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { shopId, confirmationText } = body;

    const result = await clearShopDataAction({
      shopId: String(shopId || "all"),
      confirmationText: String(confirmationText || ""),
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.error?.includes("Unauthorized") ? 403 : 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}
