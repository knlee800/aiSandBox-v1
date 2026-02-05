'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { Socket } from 'socket.io-client';

interface Checkpoint {
  id: string;
  session_id: string;
  user_id: string;
  message_number: number;
  git_commit_hash: string;
  checkpoint_type: 'auto' | 'manual' | 'milestone';
  description: string;
  files_changed: number;
  created_at: string;
  is_deleted: number;
}

export default function Timeline({ sessionId, userId, socket, onRevert }: {
  sessionId: string;
  userId: string;
  socket: Socket | null;
  onRevert?: () => void;
}) {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [reverting, setReverting] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    const fetchCheckpoints = async () => {
      try {
        const response = await axios.get(`/api/git/${sessionId}/checkpoints?limit=20`);
        setCheckpoints(response.data);
        setLoading(false);
      } catch (error) {
        console.error('Failed to fetch checkpoints:', error);
        setLoading(false);
      }
    };

    // Initial fetch
    fetchCheckpoints();

    // Listen for real-time checkpoint updates via WebSocket
    if (socket) {
      socket.on('checkpoint-created', (data: { checkpoint: Checkpoint }) => {
        console.log('Checkpoint created event received:', data);
        setCheckpoints(prev => [data.checkpoint, ...prev].slice(0, 20));
      });

      return () => {
        socket.off('checkpoint-created');
      };
    }
  }, [sessionId, socket]);

  const handleRevert = async (checkpoint: Checkpoint) => {
    if (!confirm(`Revert to: ${checkpoint.description}?\n\nThis will reset your workspace to this checkpoint.`)) {
      return;
    }

    setReverting(checkpoint.id);

    try {
      await axios.post(`/api/git/${sessionId}/revert`, {
        userId,
        commitHash: checkpoint.git_commit_hash,
      });

      alert('Workspace reverted successfully! Please refresh the file list.');

      // Call callback to refresh files
      if (onRevert) {
        onRevert();
      }
    } catch (error) {
      console.error('Failed to revert:', error);
      alert('Failed to revert workspace. Please try again.');
    } finally {
      setReverting(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;

    return date.toLocaleDateString();
  };

  const getCheckpointIcon = (type: string) => {
    switch (type) {
      case 'milestone':
        return '🏁';
      case 'manual':
        return '📌';
      default:
        return '💾';
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
          <div className="h-3 bg-gray-200 rounded w-3/4"></div>
        </div>
      </div>
    );
  }

  if (checkpoints.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <h3 className="font-semibold text-sm text-gray-700 mb-2">Timeline</h3>
        <p className="text-xs text-gray-500">No checkpoints yet. Checkpoints are created automatically when Claude makes changes.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-4 mb-4 max-h-96 overflow-y-auto">
      <h3 className="font-semibold text-sm text-gray-700 mb-3">Timeline</h3>

      <div className="space-y-2">
        {checkpoints.map((checkpoint, index) => (
          <div
            key={checkpoint.id}
            className={`relative pl-4 pb-3 ${index === checkpoints.length - 1 ? '' : 'border-l-2 border-gray-200'}`}
          >
            {/* Timeline dot */}
            <div className="absolute left-0 top-1 -ml-1 w-2 h-2 rounded-full bg-blue-500"></div>

            {/* Checkpoint info */}
            <div className="bg-gray-50 rounded p-2">
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex items-center gap-1 flex-1 min-w-0">
                  <span className="text-xs">{getCheckpointIcon(checkpoint.checkpoint_type)}</span>
                  <p className="text-xs font-medium text-gray-800 truncate">
                    {checkpoint.description}
                  </p>
                </div>
                {index !== 0 && (
                  <button
                    onClick={() => handleRevert(checkpoint)}
                    disabled={reverting !== null}
                    className="text-xs px-2 py-0.5 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed whitespace-nowrap flex-shrink-0"
                  >
                    {reverting === checkpoint.id ? 'Reverting...' : 'Revert'}
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>{formatDate(checkpoint.created_at)}</span>
                {checkpoint.files_changed > 0 && (
                  <>
                    <span>•</span>
                    <span>{checkpoint.files_changed} file{checkpoint.files_changed !== 1 ? 's' : ''}</span>
                  </>
                )}
                <span>•</span>
                <span className="font-mono text-xs">#{checkpoint.message_number}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
