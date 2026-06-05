"use client";

import { useState } from "react";
import { Button, Input } from "@pos/ui";
import { Plus, Trash2 } from "lucide-react";
import { formatRupiah } from "@/lib/utils";
import { useRole } from "@/components/providers/RoleProvider";
import {
  useCreatePrintingService,
  useDeletePrintingService,
  usePrintingServices,
  useUpdatePrintingService,
} from "../hooks/usePrintingServices";
import type { PrintingService, PrintingServiceInput } from "../types";
import { PrintingServiceFormModal } from "./PrintingServiceFormModal";
import { PrintingServiceOrderModal, type PrintingServiceOrderData } from "./PrintingServiceOrderModal";

interface PrintingServicesTabProps {
  onAddToCart: (data: PrintingServiceOrderData) => void;
}

export function PrintingServicesTab({ onAddToCart }: PrintingServicesTabProps) {
  const [search, setSearch] = useState("");
  const [editingService, setEditingService] = useState<PrintingService | null>(null);
  const [orderingService, setOrderingService] = useState<PrintingService | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const servicesQuery = usePrintingServices(search);
  const createService = useCreatePrintingService();
  const updateService = useUpdatePrintingService();
  const deleteService = useDeletePrintingService();
  const { canPerform } = useRole();
  const canManageServices = canPerform("product", "update");
  const services = servicesQuery.data?.data ?? [];

  const openCreateForm = () => {
    setFormError(null);
    setEditingService(null);
    setIsFormOpen(true);
  };

  const handleSubmit = async (input: PrintingServiceInput) => {
    setFormError(null);
    try {
      if (editingService) {
        await updateService.mutateAsync({ id: editingService.id, data: input });
      } else {
        await createService.mutateAsync(input);
      }
      setIsFormOpen(false);
      setEditingService(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Gagal menyimpan layanan");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-col gap-3 bg-white border-b border-surface-100 px-3 py-3 md:flex-row md:items-center md:px-6">
        <div className="flex-1">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari layanan cetak..."
            aria-label="Cari layanan cetak"
          />
        </div>
        {canManageServices && (
          <Button variant="accent" onClick={openCreateForm}>
            <Plus className="h-[18px] w-[18px]" aria-hidden="true" />
            Tambah Layanan
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-24 scroll-pb-24 md:px-6 md:pb-24 md:scroll-pb-24">
        {servicesQuery.isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-36 animate-pulse rounded-xl bg-surface-100" />
            ))}
          </div>
        ) : services.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-surface-500">
            Belum ada layanan cetak
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {services.map((service) => (
              <div
                key={service.id}
                className="flex min-h-36 flex-col rounded-xl border border-surface-200 bg-white p-4 shadow-sm"
              >
                <div className="flex-1">
                  <h3 className="font-bold text-surface-900">{service.name}</h3>
                  <p className="mt-1 text-sm font-semibold text-brand-700">
                    {formatRupiah(Number(service.basePrice))} /{service.unit}
                  </p>
                  {service.description && (
                    <p className="mt-2 line-clamp-2 text-xs text-surface-500">
                      {service.description}
                    </p>
                  )}
                </div>
                <div className="mt-4 flex gap-2">
                  <Button
                    variant="accent"
                    size="sm"
                    className="flex-1"
                    onClick={() => setOrderingService(service)}
                  >
                    Tambah
                  </Button>
                  {canManageServices && (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setFormError(null);
                          setEditingService(service);
                          setIsFormOpen(true);
                        }}
                      >
                        Ubah
                      </Button>
                      <button
                        type="button"
                        aria-label={`Hapus ${service.name}`}
                        onClick={() => deleteService.mutate(service.id)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-danger-200 text-danger-500 hover:bg-danger-50"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <PrintingServiceFormModal
        open={isFormOpen}
        service={editingService}
        isSaving={createService.isPending || updateService.isPending}
        error={formError}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleSubmit}
      />
      <PrintingServiceOrderModal
        open={Boolean(orderingService)}
        service={orderingService}
        onClose={() => setOrderingService(null)}
        onConfirm={(data) => {
          onAddToCart(data);
          setOrderingService(null);
        }}
      />
    </div>
  );
}
