export function paginate<T>(items: T[], page: number, perPage = 10) {
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const current = Math.min(Math.max(1, page), totalPages);
  const start = (current - 1) * perPage;
  return { pageItems: items.slice(start, start + perPage), page: current, totalPages };
}
