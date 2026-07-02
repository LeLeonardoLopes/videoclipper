import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContainer } from '../components/layout/PageContainer';
import { VideoUrlInput } from '../components/forms/VideoUrlInput';
import { Card } from '../components/ui/Card';
import { usePipelineStore } from '@/stores/pipeline.store';
import { useJobHistoryStore } from '@/stores/job-history.store';
import { apiClient } from '@/services/api.client';
import { useToastStore } from '@/components/feedback/Toast';

export function HomePage() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { setJobId, reset } = usePipelineStore();
  const { entries } = useJobHistoryStore();
  const toast = useToastStore();

  const handleSubmit = async (url: string) => {
    setLoading(true);
    reset();

    try {
      const response = await apiClient.createJob({ videoUrl: url });
      setJobId(response.jobId);
      navigate(`/processing/${response.jobId}`);
    } catch (error) {
      toast.add('error', error instanceof Error ? error.message : 'Falha ao criar job');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageContainer maxWidth="md">
      <div className="text-center mb-10">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 mb-4">
          Cortes Automáticos com IA
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Cole o link de um vídeo do YouTube e nossa IA identifica os melhores momentos para
          Shorts, Reels e TikTok.
        </p>
      </div>

      <Card padding="lg" className="mb-10">
        <VideoUrlInput onSubmit={handleSubmit} loading={loading} />
      </Card>

      {/* Recent history */}
      {entries.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Cortes recentes</h2>
          <div className="space-y-3">
            {entries.slice(0, 5).map((entry) => (
              <Card
                key={entry.jobId}
                padding="sm"
                className="flex items-center justify-between cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/results/${entry.jobId}`)}
              >
                <div>
                  <p className="font-medium text-gray-900 text-sm">{entry.title || entry.videoUrl}</p>
                  <p className="text-xs text-gray-500">
                    {entry.clipCount} cortes &middot; {new Date(entry.createdAt).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </Card>
            ))}
          </div>
        </div>
      )}
    </PageContainer>
  );
}
