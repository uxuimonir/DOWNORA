import { Button } from '@downora/ui';
import { Compass } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/shared/EmptyState';

export function NotFoundPage() {
  return (
    <EmptyState
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
