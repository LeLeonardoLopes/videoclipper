import type { ClipResult } from '@/types';
import { ClipCard } from './ClipCard';
import { EmptyState } from '../feedback/EmptyState';

interface ClipListProps {
  clips: ReadonlyArray<ClipResult>;
}

export function ClipList({ clips }: ClipListProps) {
  if (clips.length === 0) {
    return (
      <EmptyState
        title="Nenhum corte gerado"
        description="O processamento não identificou cortes relevantes para este vídeo."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {clips.map((clip) => (
        <ClipCard key={clip.clipId} clip={clip} />
      ))}
    </div>
  );
}
