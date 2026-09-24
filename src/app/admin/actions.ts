"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type ClearShopDataResult = {
  success: boolean;
  message?: string;
  error?: string;
  deleted?: {
    orders: number;
    jobs: number;
    documents: number;
    payments: number;
  };
};

function chunkArray<T>(items: T[], size = 200): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function clearShopDataAction(input: {
  shopId: string;
  confirmationText: string;
}): Promise<ClearShopDataResult> {
  const { shopId, confirmationText } = input;

  if (!confirmationText || confirmationText.trim().toUpperCase() !== "CLEAR") {
    return { success: false, error: 'Confirmation requires typing "CLEAR" exactly.' };
  }

  const profile = await getCurrentProfile();
  if (profile?.role !== "admin") {
    return { success: false, error: "Unauthorized: Administrator access required." };
  }

  const client = createSupabaseAdminClient();
  if (!client) {
    return { success: false, error: "Admin database connection not configured." };
  }

  try {
    const isAll = shopId === "all" || !shopId;
    let targetDescription = "all shops across the platform";

    if (!isAll) {
      const { data: shop, error: shopErr } = await client
        .from("shops")
        .select("id, name")
        .eq("id", shopId)
        .maybeSingle();
      if (shopErr || !shop) {
        return { success: false, error: "Selected shop does not exist." };
      }
      targetDescription = `shop "${shop.name}"`;
    }

    // 1. Fetch relevant orders
    let ordersQuery = client.from("orders").select("id");
    if (!isAll) {
      ordersQuery = ordersQuery.eq("shop_id", shopId);
    }
    const { data: orderRows } = await ordersQuery;
    const orderIds = (orderRows ?? []).map((o) => o.id);

    // 2. Fetch relevant print_jobs
    let jobsQuery = client.from("print_jobs").select("id");
    if (!isAll) {
      jobsQuery = jobsQuery.eq("shop_id", shopId);
    }
    const { data: jobRows } = await jobsQuery;
    const jobIds = (jobRows ?? []).map((j) => j.id);

    // 3. Fetch documents and storage_paths
    let docsQuery = client.from("documents").select("id, storage_path");
    if (!isAll) {
      docsQuery = docsQuery.eq("shop_id", shopId);
    }
    const { data: docRows } = await docsQuery;
    const docIds = (docRows ?? []).map((d) => d.id);
    const storagePaths = (docRows ?? []).map((d) => d.storage_path).filter(Boolean) as string[];

    // 4. Fetch payments associated with these orders or jobs
    let paymentIds: string[] = [];
    if (isAll) {
      const { data: paymentRows } = await client.from("payments").select("id");
      paymentIds = (paymentRows ?? []).map((p) => p.id);
    } else {
      if (orderIds.length > 0) {
        for (const chunk of chunkArray(orderIds, 200)) {
          const { data: pRows } = await client.from("payments").select("id").in("order_id", chunk);
          if (pRows) paymentIds.push(...pRows.map((p) => p.id));
        }
      }
      if (jobIds.length > 0) {
        for (const chunk of chunkArray(jobIds, 200)) {
          const { data: pRows } = await client.from("payments").select("id").in("print_job_id", chunk);
          if (pRows) {
            for (const row of pRows) {
              if (!paymentIds.includes(row.id)) paymentIds.push(row.id);
            }
          }
        }
      }
    }

    // 5. Reset desktop agents current_job_id
    if (isAll) {
      await client.from("desktop_agents").update({ current_job_id: null }).not("current_job_id", "is", null);
    } else {
      await client.from("desktop_agents").update({ current_job_id: null }).eq("shop_id", shopId);
    }

    // 6. Delete payment transactions
    if (isAll) {
      await client.from("payment_transactions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    } else {
      if (paymentIds.length > 0) {
        for (const chunk of chunkArray(paymentIds, 200)) {
          await client.from("payment_transactions").delete().in("payment_id", chunk);
        }
      }
      if (orderIds.length > 0) {
        for (const chunk of chunkArray(orderIds, 200)) {
          await client.from("payment_transactions").delete().in("order_id", chunk);
        }
      }
    }

    // 7. Delete payments
    if (isAll) {
      await client.from("payments").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    } else if (paymentIds.length > 0) {
      for (const chunk of chunkArray(paymentIds, 200)) {
        await client.from("payments").delete().in("id", chunk);
      }
    }

    // 8. Delete print_job_pages
    if (isAll) {
      await client.from("print_job_pages").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    } else if (jobIds.length > 0) {
      for (const chunk of chunkArray(jobIds, 200)) {
        await client.from("print_job_pages").delete().in("print_job_id", chunk);
      }
    }

    // 9. Delete print_jobs
    if (isAll) {
      await client.from("print_jobs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    } else {
      await client.from("print_jobs").delete().eq("shop_id", shopId);
    }

    // 10. Delete documents
    if (isAll) {
      await client.from("documents").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    } else {
      await client.from("documents").delete().eq("shop_id", shopId);
    }

    // 11. Remove storage files from print-documents bucket
    if (storagePaths.length > 0 && client.storage && typeof client.storage.from === "function") {
      for (const chunk of chunkArray(storagePaths, 100)) {
        try {
          const bucket = client.storage.from("print-documents");
          if (bucket && typeof bucket.remove === "function") {
            await bucket.remove(chunk);
          }
        } catch (storageErr) {
          console.warn("Storage files cleanup error:", storageErr);
        }
      }
    }

    // 12. Delete orders
    if (isAll) {
      await client.from("orders").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    } else {
      await client.from("orders").delete().eq("shop_id", shopId);
    }

    // 13. Clean up audit logs for this shop or job entities
    if (isAll) {
      await client.from("audit_logs").delete().in("entity_type", ["order", "print_job", "payment"]);
    } else {
      await client.from("audit_logs").delete().eq("shop_id", shopId);
    }

    revalidatePath("/admin");
    revalidatePath("/shop/analytics");
    revalidatePath("/shop/jobs");
    revalidatePath("/shop/counter");
    revalidatePath("/shop/history");

    return {
      success: true,
      message: `Successfully cleared all analytics and job records for ${targetDescription}.`,
      deleted: {
        orders: orderIds.length,
        jobs: jobIds.length,
        documents: docIds.length,
        payments: paymentIds.length,
      },
    };
  } catch (error) {
    console.error("Error clearing shop data:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to clear shop data.",
    };
  }
}
