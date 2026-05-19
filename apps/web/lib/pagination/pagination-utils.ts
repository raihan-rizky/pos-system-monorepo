export interface PaginationInfo {
  totalItems: number;
  itemsPerPage: number;
  currentPage: number;
  totalPages: number;
  pageDisplay: string;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginationParams {
  totalItems: number;
  itemsPerPage: number;
  currentPage: number;
}

export function calculatePaginationInfo(params: PaginationParams): PaginationInfo {
  const { totalItems, itemsPerPage, currentPage } = params;
  
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / itemsPerPage);
  const pageDisplay = totalPages === 0 ? "0/0" : `${currentPage}/${totalPages}`;
  const hasNextPage = currentPage < totalPages;
  const hasPreviousPage = currentPage > 1;
  
  return {
    totalItems,
    itemsPerPage,
    currentPage,
    totalPages,
    pageDisplay,
    hasNextPage,
    hasPreviousPage,
  };
}
