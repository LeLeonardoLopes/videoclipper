import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { PageContainer } from '../components/layout/PageContainer';
import { ClipList } from '../components/clips/ClipList';
import { ErrorState } from '../components/feedback/ErrorState';
import { SkeletonCard } from '../components/feedback/SkeletonCard';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { usePipelineStore } from '@/stores/pipeline.store';
import { apiClient } from '@/services/api.client';
import type { JobResult } from '@/types';

export function ResultsPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const store = usePipelineStore();
  const [job, setJob] = useState<JobResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;

    // Use store if available, otherwise fetch
    if (store.clips.length > 0 && store.jobId === jobId) {
      setJob({
        jobId,
        status: store.status,
        videoMetadata: store.videoMetadata,
        clips: store.clips,
        createdAt: '',
        completedAt: null,
        error: null,
      } as JobResult);
      setLoading(false);
      return;
    }

    apiClient.getJob(jobId)
      .then((result) => { setJob(result); })
      .catch((err) => { setError(err instanceof Error ? err.message : 'Falha ao carregar resultados'); })
      .finally(() => { setLoading(false); });
  }, [jobId]);

  if (loading) {
    return (
      <PageContainer>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </PageContainer>
    );
  }

  if (error || !job) {
    return (
      <PageContainer maxWidth="md">
        <ErrorState
          message={error ?? 'Job não encontrado'}
          onRetry={() => window.location.reload()}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div className="min-w-0 flex-1">
          {/* Title breaks naturally on long YouTube titles */}
          <h1 className="text-2xl font-bold text-gray-900 break-words leading-snug">
            {job.videoMetadata?.title ?? 'Cortes gerados'}
          </h1>
          {job.videoMetadata && (
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="text-sm text-gray-500">{job.videoMetadata.channel}</span>
              <Badge variant="success">{job.clips.length} cortes</Badge>
            </div>
          )}
        </div>
        <Link to="/" className="shrink-0">
          <Button variant="primary">Novo video</Button>
        </Link>
      </div>

      {/* Visual separator between header and grid */}
      <hr className="border-gray-200 mb-6" />

      {/* Clips Grid */}
      <ClipList clips={job.clips} />
    </PageContainer>
  );
}
