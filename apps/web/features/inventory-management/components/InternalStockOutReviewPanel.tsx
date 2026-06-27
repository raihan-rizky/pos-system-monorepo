"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@pos/ui";
import { Check, X, Package, Clock } from "lucide-react";
import {
  approveInternalStockOutRequest,
  rejectInternalStockOutRequest
} from "../api/inventory-management-api";

interface InternalStockOutRequest {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  requestedByName: string;
  requestedByRole: string;
  createdAt: string;
}

export function InternalStockOutReviewPanel() {
  const [requests, setRequests] = useState<InternalStockOutRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const loadRequests = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/internal-stock-out?status=PENDING");
      if (response.ok) {
        const data = await response.json();
        setRequests(data.data || []);
      }
    } catch (error) {
      console.error("Failed to load requests:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const handleApprove = async (id: string) => {
    setProcessingId(id);
    try {
      await approveInternalStockOutRequest(id);
      await loadRequests();
    } catch (error) {
      console.error("Failed to approve:", error);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: string) => {
    if (!rejectionReason.trim()) {
      alert("Alasan penolakan wajib diisi");
      return;
    }
    setProcessingId(id);
    try {
      await rejectInternalStockOutRequest(id, rejectionReason);
      setRejectingId(null);
      setRejectionReason("");
      await loadRequests();
    } catch (error) {
      console.error("Failed to reject:", error);
    } finally {
      setProcessingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Clock className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-500">
        <Package className="h-12 w-12 mb-3 opacity-40" />
        <p className="text-sm font-medium">Tidak ada permintaan stock out pending</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {requests.map((request) => (
        <div
          key={request.id}
          className="border border-slate-200 rounded-xl p-4 bg-white"
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <h4 className="font-bold text-slate-900">{request.productName}</h4>
              <p className="text-sm text-slate-500 mt-1">
                Qty: <span className="font-semibold">{request.quantity}</span>
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Diminta oleh: {request.requestedByName} ({request.requestedByRole})
              </p>
            </div>
            <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-full">
              PENDING
            </span>
          </div>

          <div className="mb-3 p-3 bg-slate-50 rounded-lg">
            <p className="text-xs font-bold text-slate-600 mb-1">Alasan:</p>
            <p className="text-sm text-slate-700">{request.reason}</p>
          </div>

          {rejectingId === request.id ? (
            <div className="space-y-2">
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Alasan penolakan..."
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg resize-none"
                rows={2}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setRejectingId(null);
                    setRejectionReason("");
                  }}
                  disabled={processingId === request.id}
                >
                  Batal
                </Button>
                <Button
                  size="sm"
                  className="bg-red-600 text-white hover:bg-red-700"
                  onClick={() => handleReject(request.id)}
                  disabled={processingId === request.id}
                >
                  Konfirmasi Tolak
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={() => handleApprove(request.id)}
                disabled={processingId === request.id}
              >
                <Check className="h-4 w-4" />
                Setujui
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="flex-1"
                onClick={() => setRejectingId(request.id)}
                disabled={processingId === request.id}
              >
                <X className="h-4 w-4" />
                Tolak
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
