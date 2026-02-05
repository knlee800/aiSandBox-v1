'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useTranslations } from '../../../hooks/useTranslations';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import Editor from '@monaco-editor/react';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import TokenCounter from '@/components/TokenCounter';
import Timeline from '@/components/Timeline';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface FileNode {
  name: string;
  type: 'file' | 'directory';
  path: string;
}

export default function SandboxPage() {
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;
  const t = useTranslations('sandbox');
  const [sessionId, setSessionId] = useState('');
  const [userId, setUserId] = useState('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [editorLanguage, setEditorLanguage] = useState('javascript');
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [totalLoadedMessages, setTotalLoadedMessages] = useState(0);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor');

  // Preview state
  const [previewStatus, setPreviewStatus] = useState<'stopped' | 'starting' | 'running'>('stopped');
  const [previewPort, setPreviewPort] = useState<number | null>(null);
  const [previewFramework, setPreviewFramework] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUserId = localStorage.getItem('userId');
    const storedSessionId = localStorage.getItem('sessionId');

    if (!token || !storedUserId) {
      router.push(`/${locale}/login`);
      return;
    }

    setUserId(storedUserId);

    // Reuse existing session if available
    if (storedSessionId) {
      setSessionId(storedSessionId);
      loadFiles(storedSessionId);
      loadConversationHistory(storedSessionId);
    } else {
      initializeSession(storedUserId);
    }
  }, [router]);

  // WebSocket connection setup
  useEffect(() => {
    if (!sessionId) return;

    console.log('Setting up WebSocket connection for session:', sessionId);

    // Connect to WebSocket server
    const newSocket = io('http://localhost:4000', {
      transports: ['websocket', 'polling'],
    });

    newSocket.on('connect', () => {
      console.log('WebSocket connected:', newSocket.id);
      // Join session room
      newSocket.emit('join-session', sessionId);
    });

    newSocket.on('disconnect', () => {
      console.log('WebSocket disconnected');
    });

    // Listen for file change events
    newSocket.on('file-changed', (data: { file: { path: string; action: string } }) => {
      console.log('File changed event received:', data);
      // Refresh file list
      loadFiles(sessionId);
      // If the changed file is currently open, reload it
      if (selectedFile && data.file.path === selectedFile.path) {
        loadFileContent(sessionId, selectedFile.path);
      }
    });

    setSocket(newSocket);

    return () => {
      newSocket.emit('leave-session', sessionId);
      newSocket.disconnect();
    };
  }, [sessionId]);

  const initializeSession = async (uid: string) => {
    try {
      const response = await axios.post('/api/sessions', {
        userId: uid,
      });
      const newSessionId = response.data.sessionId;
      setSessionId(newSessionId);
      localStorage.setItem('sessionId', newSessionId);
      loadFiles(newSessionId);
      loadConversationHistory(newSessionId);
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  };

  const loadFiles = async (sid: string) => {
    try {
      const response = await axios.get(`/api/files/${sid}/list`);
      // Filter out .git directory
      const filteredFiles = (response.data || []).filter(
        (file: FileNode) => file.name !== '.git'
      );
      setFiles(filteredFiles);
    } catch (error) {
      console.error('Failed to load files:', error);
    }
  };

  const loadConversationHistory = async (sid: string, limit: number = 20) => {
    try {
      const response = await axios.get(
        `/api/conversations/${sid}/messages?limit=${limit}`
      );
      const historyMessages = response.data || [];
      setMessages(historyMessages);
      setTotalLoadedMessages(historyMessages.length);
      setHasMoreMessages(historyMessages.length === limit);

      // Scroll to bottom after loading
      setTimeout(() => {
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
      }, 100);
    } catch (error: any) {
      // 404 is expected for new sessions with no conversation yet
      if (error.response?.status === 404) {
        console.log('No conversation history yet - this is a new session');
        setMessages([]);
        setTotalLoadedMessages(0);
        setHasMoreMessages(false);
      } else {
        console.error('Failed to load conversation history:', error);
      }
    }
  };

  const loadMoreMessages = async () => {
    if (!sessionId || loadingMore || !hasMoreMessages) return;

    setLoadingMore(true);
    try {
      // Save current scroll position
      const container = chatContainerRef.current;
      const previousScrollHeight = container?.scrollHeight || 0;

      // Load next 20 messages
      const newLimit = totalLoadedMessages + 20;
      const response = await axios.get(
        `/api/conversations/${sessionId}/messages?limit=${newLimit}`
      );
      const allMessages = response.data || [];

      setMessages(allMessages);
      setTotalLoadedMessages(allMessages.length);
      setHasMoreMessages(allMessages.length === newLimit);

      // Restore scroll position
      setTimeout(() => {
        if (container) {
          const newScrollHeight = container.scrollHeight;
          container.scrollTop = newScrollHeight - previousScrollHeight;
        }
      }, 50);
    } catch (error: any) {
      // 404 means no more messages
      if (error.response?.status === 404) {
        setHasMoreMessages(false);
      } else {
        console.error('Failed to load more messages:', error);
      }
    } finally {
      setLoadingMore(false);
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    // Load more when scrolled to top (within 50px)
    if (container.scrollTop < 50 && hasMoreMessages && !loadingMore) {
      loadMoreMessages();
    }
  };

  const handleFileClick = async (file: FileNode) => {
    if (file.type === 'directory') return;

    setSelectedFile(file);
    try {
      const response = await axios.post(`/api/files/${sessionId}/read`, {
        path: file.path,
      });
      setFileContent(response.data.content);

      const ext = file.name.split('.').pop();
      const langMap: Record<string, string> = {
        js: 'javascript',
        ts: 'typescript',
        jsx: 'javascript',
        tsx: 'typescript',
        py: 'python',
        java: 'java',
        html: 'html',
        css: 'css',
        json: 'json',
        md: 'markdown',
      };
      setEditorLanguage(langMap[ext || ''] || 'plaintext');
    } catch (error) {
      console.error('Failed to read file:', error);
    }
  };

  const reloadCurrentFile = async () => {
    if (!selectedFile || !sessionId) return;

    try {
      const response = await axios.post(`/api/files/${sessionId}/read`, {
        path: selectedFile.path,
      });
      setFileContent(response.data.content);
    } catch (error) {
      console.error('Failed to reload file:', error);
    }
  };

  const handleSaveFile = async () => {
    if (!selectedFile) return;

    try {
      await axios.post(`/api/files/${sessionId}/write`, {
        path: selectedFile.path,
        content: fileContent,
      });
      alert(t('fileSaved'));
    } catch (error) {
      console.error('Failed to save file:', error);
      alert(t('fileSaveFailed'));
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading || !sessionId) return;

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setTotalLoadedMessages(prev => prev + 1);
    setInput('');
    setLoading(true);

    try {
      const response = await axios.post('/api/messages/chat', {
        sessionId,
        userId,
        message: input,
      });

      const assistantMessage: Message = {
        role: 'assistant',
        content: response.data.message,
        timestamp: new Date().toISOString(),
      };

      setMessages(prev => [...prev, assistantMessage]);
      setTotalLoadedMessages(prev => prev + 1);

      // Reload files and refresh currently open file (with small delay to ensure file operations complete)
      setTimeout(async () => {
        await loadFiles(sessionId);
        await reloadCurrentFile();
      }, 500);

      // Scroll to bottom after new message
      setTimeout(() => {
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
      }, 100);
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: t('errorProcessing'),
          timestamp: new Date().toISOString(),
        },
      ]);
      setTotalLoadedMessages(prev => prev + 1);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    // Keep sessionId so user can continue with same workspace after login
    router.push(`/${locale}/login`);
  };

  // Preview functions
  const checkPreviewStatus = async () => {
    if (!sessionId) return;

    try {
      const response = await axios.get(`/api/preview/${sessionId}/status`);
      if (response.data.running) {
        setPreviewStatus(response.data.status);
        setPreviewPort(response.data.port);
        setPreviewFramework(response.data.framework);
        setPreviewUrl(`/api/preview/${sessionId}/proxy`);
        setShowPreview(true);
      } else {
        setPreviewStatus('stopped');
        setPreviewPort(null);
        setPreviewFramework(null);
        setPreviewUrl(null);
      }
    } catch (error) {
      console.error('Failed to check preview status:', error);
    }
  };

  const handleStartPreview = async () => {
    if (!sessionId) return;

    try {
      setPreviewStatus('starting');
      const response = await axios.post(`/api/preview/${sessionId}/start`);

      if (response.data.success) {
        setPreviewPort(response.data.port);
        setPreviewFramework(response.data.framework);
        setPreviewUrl(`/api/preview/${sessionId}/proxy`);
        setPreviewStatus(response.data.status);
        setShowPreview(true);
        setActiveTab('preview'); // Auto-switch to preview tab

        // Poll status until running
        const pollInterval = setInterval(async () => {
          const statusResponse = await axios.get(`/api/preview/${sessionId}/status`);
          if (statusResponse.data.running && statusResponse.data.status === 'running') {
            setPreviewStatus('running');
            clearInterval(pollInterval);
          }
        }, 2000);

        // Stop polling after 30 seconds
        setTimeout(() => clearInterval(pollInterval), 30000);
      }
    } catch (error: any) {
      console.error('Failed to start preview:', error);
      const errorMessage = error.response?.data?.message || 'Failed to start preview server';
      alert(errorMessage + '\n\nTip: Create an index.html file or package.json to enable preview.');
      setPreviewStatus('stopped');
    }
  };

  const handleStopPreview = async () => {
    if (!sessionId) return;

    try {
      await axios.delete(`/api/preview/${sessionId}/stop`);
      setPreviewStatus('stopped');
      setPreviewPort(null);
      setPreviewFramework(null);
      setPreviewUrl(null);
      setShowPreview(false);
    } catch (error) {
      console.error('Failed to stop preview:', error);
      alert('Failed to stop preview server');
    }
  };

  const handleRefreshPreview = () => {
    if (previewUrl) {
      // Force iframe reload by updating key
      const iframe = document.querySelector('#preview-iframe') as HTMLIFrameElement;
      if (iframe) {
        iframe.src = iframe.src;
      }
    }
  };

  const handleOpenPreviewInNewTab = () => {
    if (previewUrl) {
      window.open(previewUrl, '_blank');
    }
  };

  // Check preview status on session load
  useEffect(() => {
    if (sessionId) {
      checkPreviewStatus();
    }
  }, [sessionId]);

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Column 1: Chat Panel (Left) */}
      <div className="w-[500px] bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-semibold text-lg">{t('chatWithAI')}</h2>
        </div>

        <div
          ref={chatContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 space-y-4"
        >
          {loadingMore && (
            <div className="text-center py-2">
              <p className="text-xs text-gray-500">{t('loadingOlderMessages')}</p>
            </div>
          )}
          {messages.length === 0 && !loadingMore && (
            <p className="text-sm text-gray-500">
              {t('askMeToCreate')}
            </p>
          )}
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`max-w-[80%] p-3 rounded-lg ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-800'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-200 text-gray-800 p-3 rounded-lg">
                <p className="text-sm">{t('thinking')}</p>
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-200">
          <div className="flex space-x-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('typeMessage')}
              className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading || !sessionId}
            />
            <button
              type="submit"
              disabled={loading || !sessionId}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-300"
            >
              {t('send')}
            </button>
          </div>
        </form>
      </div>

      {/* Column 2: Tabbed Content (Center) */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 p-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">AI Sandbox</h1>
            {sessionId && (
              <p className="text-sm text-gray-500">{t('session')}: {sessionId}</p>
            )}
          </div>
          <LanguageSwitcher />
        </div>

        {/* Tab Navigation */}
        <div className="bg-white border-b border-gray-200 flex">
          <button
            onClick={() => setActiveTab('editor')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'editor'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-800'
            }`}
          >
            Code Editor
          </button>
          <button
            onClick={() => setActiveTab('preview')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center space-x-2 ${
              activeTab === 'preview'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-800'
            }`}
          >
            <span>Preview</span>
            {previewStatus === 'running' && (
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
            )}
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-hidden bg-white">
          {activeTab === 'editor' ? (
            /* Editor Tab */
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between p-2 border-b border-gray-200">
                <span className="text-sm font-medium">
                  {selectedFile ? selectedFile.name : t('noFileSelected')}
                </span>
                {selectedFile && (
                  <button
                    onClick={handleSaveFile}
                    className="px-4 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                  >
                    {t('save')}
                  </button>
                )}
              </div>
              <div className="flex-1">
                <Editor
                  height="100%"
                  language={editorLanguage}
                  value={fileContent}
                  onChange={(value) => setFileContent(value || '')}
                  theme="vs-dark"
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                  }}
                />
              </div>
            </div>
          ) : (
            /* Preview Tab */
            <div className="h-full flex flex-col">
              <div className="p-3 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <h3 className="font-semibold text-sm">Preview</h3>
                  {previewStatus === 'running' && (
                    <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded">
                      Running
                    </span>
                  )}
                  {previewStatus === 'starting' && (
                    <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-700 rounded">
                      Starting...
                    </span>
                  )}
                  {previewFramework && (
                    <span className="text-xs text-gray-500">
                      {previewFramework}
                    </span>
                  )}
                </div>
                <div className="flex space-x-1">
                  {previewStatus === 'stopped' ? (
                    <button
                      onClick={handleStartPreview}
                      className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                      disabled={!sessionId}
                    >
                      Start Preview
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={handleRefreshPreview}
                        className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                        title="Refresh"
                      >
                        ↻
                      </button>
                      <button
                        onClick={handleOpenPreviewInNewTab}
                        className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                        title="Open in new tab"
                      >
                        ↗
                      </button>
                      <button
                        onClick={handleStopPreview}
                        className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                      >
                        Stop
                      </button>
                    </>
                  )}
                </div>
              </div>

              {showPreview && previewUrl ? (
                <div className="flex-1 bg-white">
                  <iframe
                    id="preview-iframe"
                    src={previewUrl}
                    className="w-full h-full border-0"
                    title="Preview"
                    sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
                  />
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center bg-gray-50">
                  <div className="text-center p-8">
                    <p className="text-sm text-gray-500 mb-2">
                      No preview running
                    </p>
                    <p className="text-xs text-gray-400 mb-4">
                      Create a web app and click "Start Preview" to see it here
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Column 3: File Browser (Right) */}
      <div className="w-64 bg-white border-l border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-semibold text-lg">{t('files')}</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {files.length === 0 ? (
            <p className="text-sm text-gray-500 p-2">{t('noFiles')}</p>
          ) : (
            files.map((file, idx) => (
              <div
                key={idx}
                onClick={() => handleFileClick(file)}
                className={`p-2 text-sm cursor-pointer hover:bg-gray-100 rounded ${
                  selectedFile?.path === file.path ? 'bg-blue-100' : ''
                }`}
              >
                {file.type === 'directory' ? '📁' : '📄'} {file.name}
              </div>
            ))
          )}
        </div>
        <div className="p-2">
          {sessionId && <TokenCounter sessionId={sessionId} />}
          {sessionId && userId && (
            <Timeline
              sessionId={sessionId}
              userId={userId}
              socket={socket}
              onRevert={() => {
                loadFiles(sessionId);
                reloadCurrentFile();
              }}
            />
          )}
        </div>
        <div className="p-4 border-t border-gray-200">
          <button
            onClick={handleLogout}
            className="w-full bg-red-500 text-white py-2 rounded hover:bg-red-600"
          >
            {t('logout')}
          </button>
        </div>
      </div>
    </div>
  );
}
