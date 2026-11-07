"use client";

import React, { useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@pos/ui";
import type { SuratJalanRecord } from "../types/surat-jalan";
import { SuratJalanCreateModal } from "./SuratJalanCreateModal";

export const SuratJalanPrintModal: React.FC<{ suratJalan: SuratJalanRecord }> = ({ suratJalan }) => {
  const [open, setOpen] = useState(false);
  const transactionId = suratJalan.transactionId ?? suratJalan.transaction?.id;
  return <>
    <Button variant="accent" size="sm" icon={<Printer className="h-4 w-4" />} disabled={!transactionId}
      onClick={event => { event.stopPropagation(); setOpen(true); }} className="w-full sm:w-auto">
      Cetak surat jalan
    </Button>
    {transactionId && <SuratJalanCreateModal open={open} transactionId={transactionId} initialRecordId={suratJalan.id} onClose={() => setOpen(false)} />}
  </>;
};
