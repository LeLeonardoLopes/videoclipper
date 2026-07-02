import { useState } from 'react';
import type { ClipResult } from '@/types';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

interface ClipCardProps {
  clip: ClipResult;
}

// Converts raw seconds to "M:SS" format (e.g. 90 → "1:30")
function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Converts duration in seconds to human-readable label (e.g. 90 → "1min 30s")
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}min`;
  return `${m}min ${s}s`;
}

// Inline SVG icons — no external dependency
function IconDownload() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function IconChevronDown({ expanded }: { expanded: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function ClipCard({ clip }: ClipCardProps) {
  const [descExpanded, setDescExpanded] = useState(false);
  const [whyExpanded, setWhyExpanded] = useState(false);

  const timeRange = `${formatTimestamp(clip.startSeconds)} - ${formatTimestamp(clip.endSeconds)}`;

  return (
    <Card padding="none" className="overflow-hidden hover:shadow-md transition-shadow flex flex-col">
      {/* Thumbnail */}
      <div className="relative bg-gray-900">
        <img
          src={clip.thumbnailUrl}
          alt={clip.seoTitle}
          className="w-full aspect-[9/16] object-cover"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
        {/* Overlay: clip number + duration */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 py-2">
          <span className="text-xs font-bold text-white bg-black/60 px-2 py-0.5 rounded">
            Corte #{clip.index + 1}
          </span>
          <Badge variant="primary">{formatDuration(clip.durationSeconds)}</Badge>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-4 flex-1">
        {/* Title — full, no truncation */}
        <h3 className="font-semibold text-gray-900 break-words leading-snug">
          {clip.seoTitle}
        </h3>

        {/* Timestamps */}
        <p className="text-xs text-gray-500 font-mono">{timeRange}</p>

        {/* Description with expand/collapse */}
        <div>
          <p
            className={`text-sm text-gray-600 break-words ${descExpanded ? '' : 'line-clamp-3'}`}
          >
            {clip.description}
          </p>
          {/* UX decision: only show toggle when text might be clipped (arbitrary >120 chars heuristic) */}
          {clip.description.length > 120 && (
            <button
              type="button"
              onClick={() => setDescExpanded((prev) => !prev)}
              className="mt-1 text-xs text-blue-600 hover:text-blue-800 focus:outline-none focus-visible:underline"
              aria-expanded={descExpanded}
            >
              {descExpanded ? 'ver menos' : 'ver mais'}
            </button>
          )}
        </div>

        {/* Hashtags — all visible, no slice */}
        <div className="flex flex-wrap gap-1.5">
          {clip.hashtags.map((tag) => (
            <Badge key={tag} variant="primary">
              {tag.startsWith('#') ? tag : `#${tag}`}
            </Badge>
          ))}
        </div>

        {/* "Por que este corte?" — expandable section with chevron */}
        <div className="border border-gray-100 rounded-md overflow-hidden">
          <button
            type="button"
            onClick={() => setWhyExpanded((prev) => !prev)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-expanded={whyExpanded}
          >
            <span>Por que este corte?</span>
            <IconChevronDown expanded={whyExpanded} />
          </button>
          {whyExpanded && (
            <p className="px-3 pb-3 pt-1 text-xs text-gray-600 bg-gray-50 break-words">
              {clip.whyChosen}
            </p>
          )}
        </div>

        {/* Download buttons */}
        <div className="flex flex-col gap-2 mt-auto pt-2">
          <a href={clip.videoUrl} download className="block w-full">
            <Button variant="primary" size="sm" className="w-full gap-1.5">
              <IconDownload />
              Baixar video
            </Button>
          </a>
          <div className="flex gap-2">
            <a href={clip.srtUrl} download className="flex-1">
              <Button variant="secondary" size="sm" className="w-full gap-1.5">
                <IconDownload />
                Legenda .srt
              </Button>
            </a>
            <a href={clip.copyUrl} download className="flex-1">
              <Button variant="secondary" size="sm" className="w-full gap-1.5">
                <IconDownload />
                Texto
              </Button>
            </a>
          </div>
        </div>
      </div>
    </Card>
  );
}
