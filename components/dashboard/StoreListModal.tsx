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
}

export function StoreListModal({ stores }: { stores: StoreRow[] }) {
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
              <h3 className="font-medium">All stores (by qty sold)</h3>
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
                    <th className="py-2 pr-4">Sold / delivered</th>
                    <th className="py-2 pr-4">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {stores.map((s) => (
                    <tr key={s.storeId} className="border-b">
                      <td className="py-2 pr-4">
                        <Link href={`/stores/${s.storeId}`} className="text-blue-600 underline">
                          {s.storeName}
                        </Link>
                        {s.storeAddress && (
                          <div className="text-xs text-gray-500">{s.storeAddress}</div>
                        )}
                      </td>
                      <td className="py-2 pr-4 tabular-nums">
                        {s.qtySold} / {s.qtyDelivered}
                      </td>
                      <td className="py-2 pr-4 tabular-nums">{formatCents(s.revenueCents)}</td>
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
