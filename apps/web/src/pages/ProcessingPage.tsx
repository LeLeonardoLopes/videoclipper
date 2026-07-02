import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageContainer } from '../components/layout/PageContainer';
import { Card } from '../components/ui/Card';
import { PipelineStepper } from '../components/pipeline/PipelineStepper';
import { PhaseProgress } from '../components/pipeline/PhaseProgress';
import { ErrorState } from '../components/feedback/ErrorState';
import { usePipelineProgress } from '@/hooks/usePipelineProgress';
import { usePipelineStore } from '@/stores/pipeline.store';
import { JobStatus, PipelinePhase } from '@/types';
import { apiClient } from '@/services/api.client';
import { useJobHistoryStore } from '@/stores/job-history.store';

export function ProcessingPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const progress = usePipelineProgress(jobId ?? null);
  const store = usePipelineStore();
  const { addEntry } = useJobHistoryStore();

  // Check for completion
  useEffect(() => {
    if (progress.status === JobStatus.COMPLETED && jobId) {
      apiClient.getJob(jobId).then((result) => {
        store.setResult(result.videoMetadata, [...result.clips]);
        addEntry({
          jobId,
          videoUrl: '',
          title: result.videoMetadata?.title ?? 'Sem título',
          clipCount: result.clips.length,
          createdAt: result.createdAt,
          status: result.status,
        });
        navigate(`/results/${jobId}`);
      });
    }
  }, [progress.status, jobId]);

  if (progress.error && progress.status === JobStatus.FAILED) {
    return (
      <PageContainer maxWidth="md">
        <ErrorState
          title="Processamento falhou"
          message="Ocorreu um erro durante o processamento do vídeo. Por favor, tente novamente."
          onRetry={() => navigate('/')}
        />
      </PageContainer>
    );
  }

  // Determine completed phases
  const allPhases = [
    PipelinePhase.INGESTION,
    PipelinePhase.TRANSCRIPTION,
    PipelinePhase.VIRALITY_ANALYSIS,
    PipelinePhase.EDITING_EXPORT,
  ];
  const currentIndex = allPhases.indexOf(progress.phase as typeof allPhases[number]);
  const completedPhases = allPhases.slice(0, currentIndex);

  return (
    <PageContainer maxWidth="md">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Processando vídeo...</h1>
        <p className="text-gray-500">Aguarde enquanto nossa IA analisa e corta seu vídeo.</p>
      </div>

      <Card padding="lg" className="space-y-8">
        <PipelineStepper currentPhase={progress.phase} completedPhases={completedPhases} />
        <PhaseProgress
          percentage={progress.phasePercentage}
          overallPercentage={progress.overallPercentage}
          message={progress.message}
        />
      </Card>

      {store.videoMetadata && (
        <Card padding="md" className="mt-6">
          <div className="flex items-center gap-4">
            {store.videoMetadata.thumbnailUrl && (
              <img
                src={store.videoMetadata.thumbnailUrl}
                alt={store.videoMetadata.title}
                className="w-24 h-14 object-cover rounded"
              />
            )}
            <div>
              <h3 className="font-semibold text-gray-900">{store.videoMetadata.title}</h3>
              <p className="text-sm text-gray-500">{store.videoMetadata.channel}</p>
            </div>
          </div>
        </Card>
      )}
    </PageContainer>
  );
}
