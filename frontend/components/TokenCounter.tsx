'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';

interface TokenUsage {
  sessionUsage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cost: number;
  };
  monthlyUsage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cost: number;
  };
}

export default function TokenCounter({ sessionId }: { sessionId: string }) {
  const [usage, setUsage] = useState<TokenUsage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) return;

    const fetchUsage = async () => {
      try {
        const response = await axios.get(`/api/conversations/${sessionId}/usage`);
        setUsage(response.data);
        setLoading(false);
      } catch (error) {
        console.error('Failed to fetch token usage:', error);
        setLoading(false);
      }
    };

    fetchUsage();

    // Refresh every 10 seconds
    const interval = setInterval(fetchUsage, 10000);
    return () => clearInterval(interval);
  }, [sessionId]);

  if (loading || !usage) {
    return (
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
          <div className="h-3 bg-gray-200 rounded w-3/4"></div>
        </div>
      </div>
    );
  }

  const formatNumber = (num: number) => num.toLocaleString();

  return (
    <div className="bg-white rounded-lg shadow p-4 mb-4">
      <h3 className="font-semibold text-sm text-gray-700 mb-3">Token Usage</h3>

      {/* Session Usage */}
      <div className="mb-3 pb-3 border-b border-gray-200">
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-gray-600">Current Session</span>
          <span className="text-xs font-mono text-blue-600">
            {formatNumber(usage.sessionUsage.total_tokens)} tokens
          </span>
        </div>
        <div className="flex justify-between text-xs text-gray-500">
          <span>In: {formatNumber(usage.sessionUsage.input_tokens)}</span>
          <span>Out: {formatNumber(usage.sessionUsage.output_tokens)}</span>
        </div>
        {usage.sessionUsage.cost > 0 && (
          <div className="text-xs text-gray-500 mt-1">
            Cost: ${usage.sessionUsage.cost.toFixed(4)}
          </div>
        )}
      </div>

      {/* Monthly Usage */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-gray-600">This Month</span>
          <span className="text-xs font-mono text-purple-600">
            {formatNumber(usage.monthlyUsage.total_tokens)} tokens
          </span>
        </div>
        <div className="flex justify-between text-xs text-gray-500">
          <span>In: {formatNumber(usage.monthlyUsage.input_tokens)}</span>
          <span>Out: {formatNumber(usage.monthlyUsage.output_tokens)}</span>
        </div>
        {usage.monthlyUsage.cost > 0 && (
          <div className="text-xs text-gray-500 mt-1">
            Cost: ${usage.monthlyUsage.cost.toFixed(4)}
          </div>
        )}
      </div>
    </div>
  );
}
