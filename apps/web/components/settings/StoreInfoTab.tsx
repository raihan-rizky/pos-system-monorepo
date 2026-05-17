"use client";

import React, { useState, useEffect } from "react";
import { Upload, X, RefreshCw, Save, Store, CheckCircle2 } from "lucide-react";
import { useStoreSettings, useUpdateStore } from "@/hooks/useSettings";
import { useRole } from "@/components/providers/RoleProvider";
import { shouldShowUpdateAction } from "@/features/rbac/helpers/rbac-ui";

export default function StoreInfoTab() {
  const { canPerform } = useRole();
  const canUpdateSettings = shouldShowUpdateAction("settings", canPerform);
  const { data: settings, isLoading } = useStoreSettings();
  const updateStore = useUpdateStore();

  const [form, setForm] = useState({ name: "", address: "", phone: "", logoUrl: "" });
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setForm({
        name: settings.name ?? "",
        address: settings.address ?? "",
        phone: settings.phone ?? "",
        logoUrl: settings.logoUrl ?? "",
      });
    }
  }, [settings]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canUpdateSettings) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message || "Upload failed");
      }
      const { url } = await res.json();
      setForm(prev => ({ ...prev, logoUrl: url }));
    } catch (err: any) {
      setUploadError(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canUpdateSettings) return;
    setSaveError(null);
    setSaved(false);
    try {
      await updateStore.mutateAsync({
        name: form.name,
        address: form.address,
        phone: form.phone,
        logoUrl: form.logoUrl || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setSaveError(err.message);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="w-6 h-6 text-brand-400 animate-spin" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-lg font-bold text-surface-900">Store Information</h2>
        <p className="text-sm text-surface-500 mt-0.5">Basic details shown on receipts and invoices.</p>
      </div>

      {/* Logo */}
      <div>
        <label
          htmlFor="store-logo"
          className="block text-sm font-semibold text-surface-700 mb-2"
        >
          Store Logo
        </label>
        <div className="flex items-center gap-4">
          {form.logoUrl ? (
            <div className="relative w-20 h-20 rounded-2xl overflow-hidden border border-surface-200 shadow-sm shrink-0">
              <img
                src={form.logoUrl}
                alt="Store logo"
                className="w-full h-full object-cover"
                onError={(e) => { (e.currentTarget as HTMLImageElement).src = ""; }}
              />
              {canUpdateSettings && (
                <button
                  type="button"
                  onClick={() => setForm(p => ({ ...p, logoUrl: "" }))}
                  className="absolute top-1 right-1 bg-white/90 rounded-full p-1 text-surface-500 hover:text-red-600 shadow cursor-pointer transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ) : (
            <div className="relative w-20 h-20 rounded-2xl bg-surface-50 border-2 border-dashed border-surface-300 flex flex-col items-center justify-center hover:bg-surface-100 transition-colors shrink-0 overflow-hidden">
              {isUploading
                ? <RefreshCw className="w-5 h-5 text-brand-500 animate-spin" />
                : <><Store className="w-5 h-5 text-surface-400 mb-1" /><span className="text-[9px] font-bold text-surface-400 uppercase tracking-widest">Upload</span></>
              }
              <input
                id="store-logo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleUpload}
                disabled={isUploading || !canUpdateSettings}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </div>
          )}
          <div className="text-xs text-surface-500 space-y-1">
            <p className="font-semibold text-surface-700 text-sm">Upload Store Logo</p>
            <p>Square image, JPG/PNG/WebP, up to 5 MB.</p>
            {uploadError && <p className="text-red-600 font-medium">{uploadError}</p>}
          </div>
        </div>
      </div>

      {/* Name */}
      <div>
        <label
          htmlFor="store-name"
          className="block text-sm font-semibold text-surface-700 mb-1.5"
        >
          Store Name
        </label>
        <input
          id="store-name"
          type="text"
          value={form.name}
          onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
          disabled={!canUpdateSettings}
          placeholder="e.g. Teladan Print & ATK"
          className="w-full px-4 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all"
        />
      </div>

      {/* Address */}
      <div>
        <label
          htmlFor="store-address"
          className="block text-sm font-semibold text-surface-700 mb-1.5"
        >
          Address
        </label>
        <textarea
          id="store-address"
          value={form.address}
          onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
          disabled={!canUpdateSettings}
          placeholder="Jl. Contoh No. 1, Bandung"
          rows={3}
          className="w-full px-4 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all resize-none"
        />
      </div>

      {/* Phone */}
      <div>
        <label
          htmlFor="store-phone"
          className="block text-sm font-semibold text-surface-700 mb-1.5"
        >
          Phone Number
        </label>
        <input
          id="store-phone"
          type="tel"
          value={form.phone}
          onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
          disabled={!canUpdateSettings}
          placeholder="e.g. 0812-3456-7890"
          className="w-full px-4 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all"
        />
      </div>

      {/* Save */}
      {saveError && (
        <p className="text-sm text-red-600 font-medium">{saveError}</p>
      )}
      {canUpdateSettings && (
      <button
        type="submit"
        disabled={updateStore.isPending}
        className="flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white font-semibold text-sm shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-60 cursor-pointer"
      >
        {updateStore.isPending
          ? <><RefreshCw className="w-4 h-4 animate-spin" /> Saving…</>
          : saved
            ? <><CheckCircle2 className="w-4 h-4" /> Saved!</>
            : <><Save className="w-4 h-4" /> Save Changes</>
        }
      </button>
      )}
    </form>
  );
}
