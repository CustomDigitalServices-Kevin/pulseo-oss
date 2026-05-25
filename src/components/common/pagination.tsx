'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  basePath: string;
}

export function Pagination({
  currentPage,
  totalPages,
  basePath,
}: PaginationProps) {
  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  return (
    <div className="flex justify-between items-center">
      {hasPrev ? (
        <Link href={`${basePath}?page=${currentPage - 1}`}>
          <Button variant="outline">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Precedent
          </Button>
        </Link>
      ) : (
        <Button variant="outline" disabled>
          <ChevronLeft className="w-4 h-4 mr-1" />
          Precedent
        </Button>
      )}

      <span className="text-sm text-muted-foreground">
        Page {currentPage} sur {totalPages}
      </span>

      {hasNext ? (
        <Link href={`${basePath}?page=${currentPage + 1}`}>
          <Button variant="outline">
            Suivant
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </Link>
      ) : (
        <Button variant="outline" disabled>
          Suivant
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      )}
    </div>
  );
}
