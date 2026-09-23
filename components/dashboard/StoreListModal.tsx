"use client";

import Link from "next/link";
import { useState } from "react";
import { formatCents } from "@/lib/money";

interface StoreRow {
  storeId: string;
  storeName: string;
  storeAddress: string | null;
  qtySold: number;
  qtyDelivered: number;
  revenueCents: number;
  profitCents: number;
}

export function StoreListModal({ stores, month }: { stores: StoreRow[]; month: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-blue-600 underline"
      >
        View all {stores.length} stores
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded bg-white shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b p-4">
              <h3 className="font-medium">All stores (by profit)</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-sm text-gray-500 hover:text-gray-800"
              >
                Close
              </button>
            </div>
            <div className="overflow-auto p-4">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="py-2 pr-4">Store</th>
                    <th className="py-2 pr-4">Delivered</th>
                    <th className="py-2 pr-4">Sold</th>
                    <th className="py-2 pr-4">Revenue</th>
                    <th className="py-2 pr-4">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {stores.map((s) => (
                    <tr key={s.storeId} className="border-b">
                      <td className="py-2 pr-4">
                        <Link
                          href={`/review?status=ALL&store=${s.storeId}&month=${month}`}
                          className="text-blue-600 underline"
                        >
                          {s.storeName}
                        </Link>
                        {s.storeAddress && (
                          <div className="text-xs text-gray-500">{s.storeAddress}</div>
                        )}
                      </td>
                      <td className="py-2 pr-4 tabular-nums">{s.qtyDelivered}</td>
                      <td className="py-2 pr-4 tabular-nums">{s.qtySold}</td>
                      <td className="py-2 pr-4 tabular-nums">{formatCents(s.revenueCents)}</td>
                      <td className="py-2 pr-4 tabular-nums">{formatCents(s.profitCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
