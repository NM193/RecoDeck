// Analysis progress bar component (Traktor-style)
// Shows real-time progress when analyzing tracks:
// - Progress bar (0-100%)
// - Current track being analyzed: "[3/14] Track Name"
// - Total stats: songs count, estimated time, total size

import { useEffect, useState } from "react";
import "./AnalysisProgress.css";

export interface AnalysisProgressData {
  currentIndex: number;
  totalTracks: number;
  currentTrackName: string;
  totalDurationMs: number;
  totalSizeBytes: number;
  startTime: number;
  estimatedTimeRemaining?: number;
}

interface AnalysisProgressProps {
  progress: AnalysisProgressData | null;
  onCancel?: () => void;
}

export function AnalysisProgress({ progress, onCancel }: AnalysisProgressProps) {
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    if (!progress) {
      setElapsedTime(0);
      return;
    }

    const interval = setInterval(() => {
      const elapsed = Date.now() - progress.startTime;
      setElapsedTime(elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [progress]);

  if (!progress) return null;

  const percentage = progress.totalTracks > 0 
    ? Math.round((progress.currentIndex / progress.totalTracks) * 100)
    : 0;

  // Format duration: hours and minutes
  const formatDuration = (ms: number) => {
    const totalMinutes = Math.floor(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0) {
      return `${hours}.${minutes} hour${hours === 1 && minutes === 0 ? '' : 's'}`;
    }
    return `${minutes} min${minutes === 1 ? '' : 's'}`;
  };

  // Format file size
  const formatSize = (bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${bytes} B`;
  };

  // Estimate time remaining based on elapsed time and progress
  const estimateTimeRemaining = () => {
    if (progress.currentIndex === 0) return null;
    
    const avgTimePerTrack = elapsedTime / progress.currentIndex;
    const tracksRemaining = progress.totalTracks - progress.currentIndex;
    const estimatedMs = avgTimePerTrack * tracksRemaining;
    
    if (estimatedMs < 60000) {
      return `${Math.ceil(estimatedMs / 1000)}s remaining`;
    }
    
    const minutes = Math.ceil(estimatedMs / 60000);
    return `${minutes} min${minutes === 1 ? '' : 's'} remaining`;
  };

  const timeRemaining = estimateTimeRemaining();

  return (
    <div className="analysis-progress-container">
      <div className="analysis-progress-bar-wrapper">
        <div 
          className="analysis-progress-bar"
          style={{ width: `${percentage}%` }}
        />
      </div>
      
      <div className="analysis-progress-content">
        <div className="analysis-progress-track">
          <span className="analysis-progress-index">
            [{progress.currentIndex}/{progress.totalTracks}]
          </span>
          {" "}
          <span className="analysis-progress-name">
            {progress.currentTrackName}
          </span>
        </div>

        <div className="analysis-progress-stats">
          <span className="analysis-stat">{progress.totalTracks} songs</span>
          <span className="analysis-stat-separator">•</span>
          <span className="analysis-stat">
            {formatDuration(progress.totalDurationMs)}
          </span>
          <span className="analysis-stat-separator">•</span>
          <span className="analysis-stat">
            {formatSize(progress.totalSizeBytes)}
          </span>
          {timeRemaining && (
            <>
              <span className="analysis-stat-separator">•</span>
              <span className="analysis-stat analysis-stat-time">
                {timeRemaining}
              </span>
            </>
          )}
          {onCancel && (
            <button 
              className="analysis-cancel-btn"
              onClick={onCancel}
              title="Cancel analysis"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
