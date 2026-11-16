import { Button } from '@downora/ui';
import { Compass } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/shared/EmptyState';
import { useDocumentTitle } from '@/lib/useDocumentTitle';

export function NotFoundPage() {
  useDocumentTitle('Page not found');
  return (
    <EmptyState
      level={1}
      icon={Compass}
      title="This page doesn’t exist"
      className="mt-10"
      action={
        <Button variant="primary" asChild>
          <Link to="/dashboard">Go to dashboard</Link>
        </Button>
      }
    >
      The link may be old or mistyped.
    </EmptyState>
  );
}
