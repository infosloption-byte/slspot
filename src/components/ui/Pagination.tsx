import { ChevronLeft, ChevronRight } from 'lucide-react'

type PaginationProps = {
  page: number
  totalPages: number
  onChange: (page: number) => void
}

export function Pagination({ page, totalPages, onChange }: PaginationProps) {
  if (totalPages <= 1) return null

  return (
    <nav className="pagination" aria-label="Pagination">
      <button className="icon-button" type="button" onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1} aria-label="Previous page"><ChevronLeft size={15} /></button>
      <span>Page {page} of {totalPages}</span>
      <button className="icon-button" type="button" onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page === totalPages} aria-label="Next page"><ChevronRight size={15} /></button>
    </nav>
  )
}
