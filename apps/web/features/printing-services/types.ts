export interface PrintingService {
  id: string;
  storeId: string;
  name: string;
  basePrice: number | string;
  unit: string;
  description: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface PrintingServicesResponse {
  data: PrintingService[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface PrintingServiceInput {
  name: string;
  basePrice: number;
  unit: string;
  description?: string | null;
  isActive?: boolean;
}

