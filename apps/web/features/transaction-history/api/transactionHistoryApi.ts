export const updateBuktiTransaksi = async (id: string, buktiTransaksiUrls: string[]) => {
  const response = await fetch(`/api/transactions/${id}/bukti`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ buktiTransaksiUrls }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || "Failed to update bukti transaksi");
  }

  return response.json();
};
