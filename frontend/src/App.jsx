import { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Trash2, 
  FileAudio, 
  FileVideo, 
  Send, 
  Loader2, 
  ExternalLink,
  MessageSquare,
  FileText,
  CheckSquare,
  HelpCircle,
  FolderOpen,
  ArrowRight,
  RefreshCw,
  Search,
  Sparkles,
  Info,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

const Youtube = ({ className }) => (
  <svg 
    viewBox="0 0 24 24" 
    className={className} 
    fill="currentColor" 
    stroke="none"
  >
    <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.518 3.545 12 3.545 12 3.545s-7.518 0-9.388.508a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.87.508 9.388.508 9.388.508s7.518 0 9.388-.508a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
);

const API_BASE_URL = "http://127.0.0.1:8000";

function App() {
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [activeSession, setActiveSession] = useState(null);
  const [activeSourceId, setActiveSourceId] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('sidebarCollapsed') === 'true';
  });

  const toggleSidebar = () => {
    const newState = !sidebarCollapsed;
    setSidebarCollapsed(newState);
    localStorage.setItem('sidebarCollapsed', String(newState));
  };
  
  // Input fields
  const [sessionTitleInput, setSessionTitleInput] = useState("");
  const [youtubeUrlInput, setYoutubeUrlInput] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  
  // UI states
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [submittingSource, setSubmittingSource] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [selectedTab, setSelectedTab] = useState("summary"); // summary, decisions, action_items, questions, transcript
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [showAddSourceModal, setShowAddSourceModal] = useState(false);
  
  // Drag and drop state
  const [dragActive, setDragActive] = useState(false);
  
  // Refs
  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // Fetch session list
  const fetchSessions = async () => {
    setLoadingSessions(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/sessions`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch (err) {
      console.error("Failed to fetch sessions:", err);
    } finally {
      setLoadingSessions(false);
    }
  };

  // Fetch active session details
  const fetchSessionDetails = async (sessionId) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        setActiveSession(data);
        
        // Auto select first source if none selected
        if (data.sources && data.sources.length > 0) {
          if (!activeSourceId || !data.sources.find(s => s.id === activeSourceId)) {
            setActiveSourceId(data.sources[0].id);
          }
        } else {
          setActiveSourceId(null);
        }
      }
    } catch (err) {
      console.error("Failed to fetch session details:", err);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  useEffect(() => {
    if (activeSessionId) {
      fetchSessionDetails(activeSessionId);
      // Setup polling for status updates if there are pending/processing sources
      const interval = setInterval(() => {
        if (activeSession?.sources?.some(s => ["pending", "downloading", "processing_audio", "transcribing", "analyzing", "indexing"].includes(s.status))) {
          fetchSessionDetails(activeSessionId);
          fetchSessions();
        }
      }, 5000);
      return () => clearInterval(interval);
    } else {
      setActiveSession(null);
      setActiveSourceId(null);
    }
  }, [activeSessionId, activeSourceId]);

  useEffect(() => {
    // Scroll chat to bottom
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.sources]); // Trigger scroll when new messages are added

  // Create empty session workspace
  const handleCreateSession = async (title = "New Workspace") => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title })
      });
      if (res.ok) {
        const data = await res.json();
        await fetchSessions();
        setActiveSessionId(data.session_id);
        setSessionTitleInput("");
        return data.session_id;
      }
    } catch (err) {
      console.error("Failed to create session:", err);
    }
    return null;
  };

  // Delete session
  const handleDeleteSession = async (sessionId, e) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this workspace and all its data?")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}`, {
        method: "DELETE"
      });
      if (res.ok) {
        if (activeSessionId === sessionId) {
          setActiveSessionId(null);
        }
        fetchSessions();
      }
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
  };

  // Add YouTube Source
  const handleAddYoutubeSource = async (sessionId, url) => {
    if (!url) return;
    setSubmittingSource(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/sources/youtube`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });
      if (res.ok) {
        setYoutubeUrlInput("");
        setShowAddSourceModal(false);
        setSuccessMsg("YouTube video added successfully. Processing started!");
        setTimeout(() => setSuccessMsg(null), 5000);
        await fetchSessionDetails(sessionId);
        await fetchSessions();
      } else {
        const errData = await res.json();
        setErrorMsg(errData.detail || "Failed to process YouTube URL");
      }
    } catch (err) {
      setErrorMsg("Connection to server failed.");
    } finally {
      setSubmittingSource(false);
    }
  };

  // Add File Source (Upload)
  const handleFileUpload = async (sessionId, file) => {
    if (!file) return;
    setSubmittingSource(true);
    setErrorMsg(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/sources/upload`, {
        method: "POST",
        body: formData
      });
      if (res.ok) {
        setShowAddSourceModal(false);
        setSuccessMsg(`File "${file.name}" uploaded successfully. Processing started!`);
        setTimeout(() => setSuccessMsg(null), 5000);
        await fetchSessionDetails(sessionId);
        await fetchSessions();
      } else {
        const errData = await res.json();
        setErrorMsg(errData.detail || "Failed to upload file");
      }
    } catch (err) {
      setErrorMsg("Connection to server failed.");
    } finally {
      setSubmittingSource(false);
    }
  };

  // Drag and drop handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e, sessionId) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(sessionId, e.dataTransfer.files[0]);
    }
  };

  // Submit Q&A chat
  const handleSendChat = async () => {
    if (!chatInput.trim() || chatLoading || !activeSessionId) return;
    const userQuery = chatInput;
    setChatInput("");
    setChatLoading(true);
    
    // Optimistic UI updates - add user message to activeSession local chat messages list
    // We fetch details again to ensure consistency, but this makes it snappy
    const tempMsg = { role: "user", content: userQuery };
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/sessions/${activeSessionId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: userQuery })
      });
      
      if (res.ok) {
        // Fetch session logs to get updated history
        await fetchSessionDetails(activeSessionId);
      } else {
        const errData = await res.json();
        alert(errData.detail || "Failed to get reply");
      }
    } catch (err) {
      console.error("Chat error:", err);
      alert("Failed to reach server");
    } finally {
      setChatLoading(false);
    }
  };

  // Handle Landing Flow (creates workspace + adds first source)
  const handleLandingSubmit = async (type) => {
    if (type === 'youtube') {
      if (!youtubeUrlInput) return;
      const sid = await handleCreateSession("New Workspace");
      if (sid) {
        await handleAddYoutubeSource(sid, youtubeUrlInput);
      }
    }
  };

  // Get active source details
  const getActiveSource = () => {
    if (!activeSession || !activeSourceId) return null;
    return activeSession.sources.find(s => s.id === activeSourceId) || null;
  };

  const activeSource = getActiveSource();

  // Helper to extract YouTube Video ID for iframe player
  const getYoutubeEmbedUrl = (url) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    if (match && match[2].length === 11) {
      return `https://www.youtube.com/embed/${match[2]}`;
    }
    return null;
  };

  // Text formatter for Markdown styling inside summary & takeaways
  const formatMarkdown = (text) => {
    if (!text) return <p className="text-zinc-500 italic">No information available yet.</p>;
    
    // Split by double newlines to isolate paragraphs/lists
    const blocks = text.split('\n');
    return (
      <div className="space-y-3 text-zinc-300 text-sm leading-relaxed">
        {blocks.map((block, idx) => {
          const trimmed = block.trim();
          if (!trimmed) return null;

          // Header formatting e.g., ## Header
          if (trimmed.startsWith('###')) {
            return <h4 key={idx} className="text-zinc-100 font-semibold text-base mt-4 mb-2">{trimmed.replace('###', '').trim()}</h4>;
          }
          if (trimmed.startsWith('##')) {
            return <h3 key={idx} className="text-zinc-100 font-semibold text-lg mt-5 mb-2">{trimmed.replace('##', '').trim()}</h3>;
          }
          if (trimmed.startsWith('#')) {
            return <h2 key={idx} className="text-white font-bold text-xl mt-6 mb-3">{trimmed.replace('#', '').trim()}</h2>;
          }

          // Bullet points
          if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
            return (
              <li key={idx} className="list-disc pl-5 ml-2 text-zinc-300">
                {trimmed.substring(1).trim()}
              </li>
            );
          }

          // Numbered lists
          const numMatch = trimmed.match(/^(\d+)\.\s(.*)/);
          if (numMatch) {
            return (
              <div key={idx} className="flex gap-2 pl-2">
                <span className="text-violet-400 font-medium">{numMatch[1]}.</span>
                <span>{numMatch[2]}</span>
              </div>
            );
          }

          return <p key={idx} className="text-zinc-300">{trimmed}</p>;
        })}
      </div>
    );
  };

  // Parse Q&A response citation tags e.g. [Source: filename]
  const parseChatCitations = (text) => {
    if (!text) return "";
    const parts = text.split(/(\[Source:\s*[^\]]+\])/gi);
    return parts.map((part, index) => {
      const match = part.match(/\[Source:\s*([^\]]+)\]/i);
      if (match) {
        const sourceName = match[1];
        return (
          <span 
            key={index} 
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-violet-950/60 border border-violet-850 text-violet-300 mx-1 cursor-default hover:bg-violet-900/60 transition-colors"
            title={`Verified from: ${sourceName}`}
          >
            <Sparkles className="w-3 h-3" />
            {sourceName}
          </span>
        );
      }
      return part;
    });
  };

  // Suggested questions
  const suggestedQuestions = [
    "What is the main topic discussed?",
    "Summarize the key decisions made.",
    "Are there any actions assigned to anyone?",
    "What is the open question in the video?"
  ];

  // Filtered session list by search bar
  const filteredSessions = sessions.filter(s => 
    s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-screen bg-black text-zinc-100 font-sans select-none overflow-hidden">
      
      {/* ──────────────────────────────────────────────────────── */}
      {/* 1. SIDEBAR                                               */}
      {/* ──────────────────────────────────────────────────────── */}
      <aside className={`bg-[#000000] border-r border-[#1A1A22] flex flex-col z-20 transition-all duration-300 ease-in-out shrink-0 ${sidebarCollapsed ? 'w-0 border-r-0 overflow-hidden' : 'w-72'}`}>
        
        {/* Sidebar Header */}
        <div className="p-5 border-b border-[#1A1A22] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#5A4FCF] to-[#8a85f4] flex items-center justify-center shadow-lg shadow-violet-950/30">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-white text-base tracking-tight font-sans">VideoQuery AI</span>
          </div>
          <div className="flex items-center gap-1">
            <button 
              onClick={() => setActiveSessionId(null)}
              className="p-1.5 rounded-md hover:bg-[#1C1C24] text-zinc-400 hover:text-white transition-colors"
              title="Create new workspace"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button 
              onClick={toggleSidebar}
              className="p-1.5 rounded-md hover:bg-[#1C1C24] text-zinc-400 hover:text-white transition-colors"
              title="Collapse sidebar"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search workspaces */}
        <div className="px-4 py-3 border-b border-[#131318] flex items-center gap-2">
          <Search className="w-4 h-4 text-zinc-500" />
          <input 
            type="text" 
            placeholder="Search workspaces..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none text-zinc-300 text-xs w-full focus:outline-none placeholder-zinc-650"
          />
        </div>

        {/* Session history list */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5 bg-[#030303]">
          <span className="px-3 text-[10px] font-bold text-zinc-500 tracking-wider uppercase block mb-2">Workspaces</span>
          
          {loadingSessions && sessions.length === 0 ? (
            <div className="flex items-center gap-2 justify-center py-8 text-zinc-500 text-xs">
              <Loader2 className="w-4 h-4 animate-spin text-[#5A4FCF]" />
              Loading history...
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="text-zinc-600 text-xs py-8 text-center italic">No workspaces found</div>
          ) : (
            filteredSessions.map(session => (
              <div 
                key={session.id}
                onClick={() => setActiveSessionId(session.id)}
                className={`group flex items-center justify-between px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-all duration-200 ${
                  activeSessionId === session.id 
                    ? "bg-[#16161D] text-white border border-[#272733]" 
                    : "text-zinc-400 hover:bg-[#0c0c0e] hover:text-zinc-205 border border-transparent"
                }`}
              >
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <FolderOpen className={`w-4 h-4 flex-shrink-0 ${activeSessionId === session.id ? 'text-[#8a85f4]' : 'text-zinc-500'}`} />
                  <span className="truncate font-medium">{session.title}</span>
                </div>
                <button 
                  onClick={(e) => handleDeleteSession(session.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-red-400 transition-all"
                  title="Delete workspace"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-[#131318] bg-[#030303] text-xs text-zinc-550 flex items-center justify-between">
          <span>v1.0.0 (Production)</span>
          <span className="flex items-center gap-1 text-[#8a85f4] cursor-default hover:text-[#a09bf8]">
            <Info className="w-3 h-3" />
            Whisper & Sarvam
          </span>
        </div>
      </aside>

      {/* ──────────────────────────────────────────────────────── */}
      {/* 2. MAIN WORKSPACE / LANDING                              */}
      {/* ──────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        
        {/* Success / Error Toast notification banner */}
        {successMsg && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-3 rounded-lg bg-emerald-950/70 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2 z-50 animate-bounce">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></div>
            {successMsg}
          </div>
        )}
        
        {errorMsg && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-3 rounded-lg bg-rose-950/70 border border-rose-800 text-rose-300 text-xs flex items-center gap-2 z-50">
            <div className="w-1.5 h-1.5 rounded-full bg-rose-400"></div>
            {errorMsg}
          </div>
        )}

        {!activeSession ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 relative overflow-hidden min-h-[calc(100vh-140px)]">
            {/* Ambient Background Glow */}
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gradient-to-tr from-[#5A4FCF]/10 to-[#8a85f4]/5 rounded-full blur-[120px] pointer-events-none animate-pulse-slow"></div>
            
            <div className="max-w-2xl w-full text-center space-y-8 relative z-10">
              
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#5A4FCF]/10 border border-[#5A4FCF]/30 text-[#8a85f4] text-xs font-semibold tracking-wide">
                <Sparkles className="w-3.5 h-3.5" />
                Next-Gen Multi-Source RAG
              </div>

              <div className="space-y-4">
                <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-white leading-[1.1]">
                  Chat with any video <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#8a85f4] to-[#c7c4ff]">using AI</span>
                </h1>
                <p className="text-zinc-450 text-base md:text-lg max-w-lg mx-auto font-light leading-relaxed">
                  Upload file recordings (mp3, mp4, wav) or paste YouTube URLs. Transcribe using Whisper (EN) and Sarvam (HI/TA) to query them in real-time.
                </p>
              </div>

              {/* URL paste container */}
              <div className="bg-[#16161C] p-5 rounded-2xl border border-[#272733] shadow-2xl shadow-black/80 space-y-3 text-left">
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider pl-1">Process a YouTube Video</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Youtube className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input 
                      type="text" 
                      placeholder="Paste YouTube video link (e.g. https://youtube.com/watch?...)" 
                      value={youtubeUrlInput}
                      onChange={(e) => setYoutubeUrlInput(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-[#0c0c0e] border border-[#272733] rounded-xl text-sm text-white focus:outline-none focus:border-[#5A4FCF] focus:ring-1 focus:ring-[#5A4FCF] placeholder-zinc-650 transition-all"
                    />
                  </div>
                  <button 
                    onClick={() => handleLandingSubmit('youtube')}
                    disabled={submittingSource || !youtubeUrlInput}
                    className="px-6 py-3 bg-[#5A4FCF] hover:bg-[#6c5ce7] disabled:bg-zinc-800 disabled:text-zinc-550 rounded-xl text-sm text-white font-medium flex items-center gap-2 shadow-lg shadow-violet-950/20 transition-all"
                  >
                    {submittingSource ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        Analyze
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Divider */}
              <div className="flex items-center justify-center gap-4 text-zinc-650 text-xs uppercase tracking-wider font-bold">
                <span className="h-px bg-[#16161C] w-24"></span>
                <span>Or create empty workspace</span>
                <span className="h-px bg-[#16161C] w-24"></span>
              </div>

              {/* Create workspace field */}
              <div className="flex gap-2 justify-center max-w-sm mx-auto">
                <input 
                  type="text" 
                  placeholder="Workspace Name (e.g. Finance Meeting)" 
                  value={sessionTitleInput}
                  onChange={(e) => setSessionTitleInput(e.target.value)}
                  className="px-4 py-3 bg-[#16161C] border border-[#272733] rounded-xl text-xs text-white focus:outline-none focus:border-[#5A4FCF] placeholder-zinc-650 transition-all flex-1"
                />
                <button 
                  onClick={() => handleCreateSession(sessionTitleInput || "New Workspace")}
                  className="px-5 py-3 bg-zinc-900 hover:bg-zinc-850 rounded-xl text-xs font-semibold text-white flex items-center gap-1.5 transition-colors border border-zinc-800"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Create
                </button>
              </div>

            </div>
          </div>
        ) : (
          
          /* ──────────────────────────────────────────────────────── */
          /* 3. ACTIVE SESSION WORKSPACE SCREEN                      */
          /* ──────────────────────────────────────────────────────── */
          <div className="flex-1 flex overflow-hidden">
            
            {/* Middle Pane: Sources and Analysis tabs (Left Column of workspace) */}
            <section className="flex-1 flex flex-col border-r border-[#1C1C24] bg-[#0A0A0F] overflow-hidden min-w-0">
              
              {/* Workspace Header */}
              <div className="px-6 py-4 border-b border-[#1A1A22] bg-[#0c0c0e] flex items-center gap-4 shrink-0">
                {sidebarCollapsed && (
                  <button 
                    onClick={toggleSidebar}
                    className="p-1.5 rounded-lg bg-[#12121A] border border-[#272733] text-zinc-400 hover:text-white transition-all shadow-md"
                    title="Expand sidebar"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-bold text-white truncate leading-tight mb-1">{activeSession.session.title}</h2>
                  <span className="text-[10px] text-zinc-500">Created: {new Date(activeSession.session.created_at).toLocaleString()}</span>
                </div>
                <button 
                  onClick={() => setShowAddSourceModal(true)}
                  className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-semibold text-white flex items-center gap-1.5 shadow-md shadow-violet-950/20 transition-all shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Source
                </button>
              </div>

              {/* Source tabs bar */}
              <div className="px-6 py-3 bg-[#0C0C12] border-b border-[#161620] flex items-center gap-2 overflow-x-auto shrink-0 scrollbar-none">
                <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider mr-2 shrink-0">Sources:</span>
                {activeSession.sources.length === 0 ? (
                  <span className="text-xs text-zinc-600 italic">No sources added yet. Click Add Source.</span>
                ) : (
                  activeSession.sources.map(source => (
                    <button
                      key={source.id}
                      onClick={() => setActiveSourceId(source.id)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200 shrink-0 ${
                        activeSourceId === source.id
                          ? "bg-[#1E1E2A] border-[#37374D] text-white"
                          : "bg-transparent border-[#1E1E2A] text-zinc-400 hover:text-zinc-200 hover:border-zinc-800"
                      }`}
                    >
                      {source.type === "youtube" ? (
                        <Youtube className={`w-3.5 h-3.5 ${source.status === 'completed' ? 'text-red-500' : 'text-zinc-500'}`} />
                      ) : source.name.endsWith('.mp4') ? (
                        <FileVideo className="w-3.5 h-3.5 text-sky-400" />
                      ) : (
                        <FileAudio className="w-3.5 h-3.5 text-violet-400" />
                      )}
                      <span className="max-w-[120px] truncate">{source.name}</span>
                      
                      {/* Live Processing status icons */}
                      {source.status === "completed" && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      )}
                      {["pending", "downloading", "processing_audio", "transcribing", "analyzing", "indexing"].includes(source.status) && (
                        <Loader2 className="w-3 h-3 animate-spin text-violet-500" />
                      )}
                      {source.status === "failed" && (
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" title={source.progress_msg}></span>
                      )}
                    </button>
                  ))
                )}
              </div>

              {/* Source Main view panel */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                
                {activeSource ? (
                  <>
                    {/* Media Player Panel */}
                    <div className="bg-[#12121A] border border-[#1C1C24] rounded-xl overflow-hidden shadow-lg shadow-black/30 shrink-0">
                      
                      {activeSource.status !== "completed" ? (
                        
                        /* Loading state when processing is active */
                        <div className="p-12 flex flex-col items-center justify-center text-center space-y-4">
                          <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
                          <div className="space-y-1">
                            <h4 className="text-sm font-semibold text-white uppercase tracking-wider">{activeSource.status.replace('_', ' ')}</h4>
                            <p className="text-xs text-zinc-400 max-w-sm">{activeSource.progress_msg}</p>
                          </div>
                          <div className="w-full max-w-xs bg-[#1C1C24] h-1.5 rounded-full overflow-hidden">
                            <div 
                              className={`h-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-500 ${
                                activeSource.status === 'downloading' ? 'w-1/4' :
                                activeSource.status === 'transcribing' ? 'w-1/2' :
                                activeSource.status === 'analyzing' ? 'w-3/4' : 'w-[95%]'
                              }`}
                            ></div>
                          </div>
                        </div>

                      ) : (
                        
                        /* Actual Player depending on source type */
                        <div className="relative">
                          {activeSource.type === "youtube" ? (
                            getYoutubeEmbedUrl(activeSource.path) ? (
                              <div className="aspect-video w-full">
                                <iframe 
                                  src={getYoutubeEmbedUrl(activeSource.path)}
                                  className="w-full h-full border-none"
                                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                  allowFullScreen
                                ></iframe>
                              </div>
                            ) : (
                              <div className="p-8 text-center text-zinc-400 text-xs">
                                YouTube URL could not be parsed but text transcribed correctly. <br />
                                <a href={activeSource.path} target="_blank" rel="noreferrer" className="text-violet-400 underline inline-flex items-center gap-1 mt-2">
                                  Open original source <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                            )
                          ) : (
                            // Serve local uploaded audio or video
                            <div className="bg-[#0B0B0F] p-4 flex flex-col items-center">
                              <span className="text-xs font-semibold text-zinc-500 self-start mb-2 uppercase tracking-wide">Workspace Player</span>
                              {activeSource.name.endsWith('.mp4') ? (
                                <video 
                                  controls 
                                  className="w-full max-h-96 rounded bg-black"
                                  src={`${API_BASE_URL}/api/media/${activeSource.id}`}
                                ></video>
                              ) : (
                                <div className="w-full py-6 flex flex-col items-center gap-4 bg-[#14141C] border border-[#272733] rounded-lg">
                                  <FileAudio className="w-10 h-10 text-violet-500 animate-pulse" />
                                  <audio 
                                    controls 
                                    className="w-4/5"
                                    src={`${API_BASE_URL}/api/media/${activeSource.id}`}
                                  ></audio>
                                  <span className="text-[10px] text-zinc-500 font-mono">{activeSource.name}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Analytics / Transcript Tabs */}
                    <div className="bg-[#12121A] border border-[#1C1C24] rounded-xl overflow-hidden flex flex-col min-h-[300px]">
                      
                      {/* Tabs Header */}
                      <div className="flex border-b border-[#1C1C24] bg-[#0E0E14] overflow-x-auto scrollbar-none shrink-0">
                        {[
                          { id: "summary", label: "Summary", icon: FileText },
                          { id: "decisions", label: "Key Decisions", icon: Sparkles },
                          { id: "action_items", label: "Action Items", icon: CheckSquare },
                          { id: "questions", label: "Open Questions", icon: HelpCircle },
                          { id: "transcript", label: "Transcript", icon: FileText },
                        ].map(tab => (
                          <button
                            key={tab.id}
                            onClick={() => setSelectedTab(tab.id)}
                            className={`flex items-center gap-2 px-5 py-3.5 text-xs font-medium border-b-2 transition-all duration-200 shrink-0 ${
                              selectedTab === tab.id
                                ? "border-violet-500 text-white bg-[#14141E]/40"
                                : "border-transparent text-zinc-400 hover:text-zinc-200"
                            }`}
                          >
                            <tab.icon className="w-3.5 h-3.5" />
                            {tab.label}
                          </button>
                        ))}
                      </div>

                      {/* Tabs Content */}
                      <div className="p-6 flex-1 overflow-y-auto max-h-[350px]">
                        {activeSource.status !== "completed" ? (
                          <div className="space-y-4 py-4">
                            <div className="h-4 bg-zinc-800 rounded w-1/3 animate-pulse"></div>
                            <div className="h-3 bg-zinc-900 rounded w-full animate-pulse"></div>
                            <div className="h-3 bg-zinc-900 rounded w-5/6 animate-pulse"></div>
                            <div className="h-3 bg-zinc-900 rounded w-4/5 animate-pulse"></div>
                          </div>
                        ) : (
                          <>
                            {selectedTab === "summary" && formatMarkdown(activeSource.summary)}
                            {selectedTab === "decisions" && formatMarkdown(activeSource.key_decisions)}
                            {selectedTab === "action_items" && formatMarkdown(activeSource.action_items)}
                            {selectedTab === "questions" && formatMarkdown(activeSource.questions)}
                            {selectedTab === "transcript" && (
                              <div className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap select-text">
                                {activeSource.transcript || "No transcript content available."}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  /* Empty state when session has no sources */
                  <div 
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={(e) => handleDrop(e, activeSession.session.id)}
                    className={`flex-1 flex flex-col items-center justify-center p-12 text-center border-2 border-dashed rounded-2xl transition-all ${
                      dragActive 
                        ? "border-violet-500 bg-violet-950/10" 
                        : "border-zinc-850 hover:border-zinc-700 bg-[#12121A]/30"
                    }`}
                  >
                    <FolderOpen className="w-12 h-12 text-zinc-600 mb-4" />
                    <h3 className="text-lg font-bold text-white mb-2">No sources added yet</h3>
                    <p className="text-xs text-zinc-400 max-w-sm mb-6 leading-relaxed">
                      Upload audio/video files (mp3, wav, mp4) or paste a YouTube URL to build the workspace knowledge base.
                    </p>
                    
                    <div className="flex gap-3 justify-center">
                      <button 
                        onClick={() => setShowAddSourceModal(true)}
                        className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-xs font-semibold text-white shadow-lg shadow-violet-950/20 transition-all"
                      >
                        Add Media
                      </button>
                      <input 
                        type="file" 
                        ref={fileInputRef}
                        className="hidden" 
                        accept="audio/*,video/*"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleFileUpload(activeSession.session.id, e.target.files[0]);
                          }
                        }}
                      />
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="px-4 py-2 bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 rounded-lg text-xs font-semibold text-white transition-colors"
                      >
                        Upload Local File
                      </button>
                    </div>

                    {dragActive && (
                      <div className="absolute inset-0 bg-violet-950/20 rounded-2xl flex items-center justify-center pointer-events-none">
                        <span className="text-sm font-semibold text-violet-400">Drop files here to upload</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* ──────────────────────────────────────────────────────── */}
            {/* 4. CHAT INTERFACE (Right Column of workspace)             */}
            {/* ──────────────────────────────────────────────────────── */}
            <section className="w-96 md:w-[450px] bg-[#0E0E14] flex flex-col shrink-0 overflow-hidden">
              
              {/* Chat Header */}
              <div className="px-6 py-4 border-b border-[#1C1C24] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-violet-400" />
                  <span className="font-semibold text-sm text-white">Workspace Q&A Chat</span>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#1C1C24] text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                  <Sparkles className="w-3 h-3 text-violet-500 animate-pulse" />
                  Multi-Source RAG
                </div>
              </div>

              {/* Chat Message List */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                
                {activeSession.sources.filter(s => s.status === 'completed').length === 0 ? (
                  /* Chat block state before processing completes */
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                    <Sparkles className="w-8 h-8 text-zinc-700" />
                    <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Q&A Chat Locked</h4>
                    <p className="text-[11px] text-zinc-500 max-w-[220px]">
                      Chat will unlock automatically once at least one media file has completed processing.
                    </p>
                  </div>
                ) : !activeSession.sources.some(s => s.status === 'completed') ? (
                  /* Empty Chat History */
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                    <MessageSquare className="w-8 h-8 text-zinc-700 animate-bounce" />
                    <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Workspace Ready</h4>
                    <p className="text-[11px] text-zinc-500 max-w-[200px]">
                      Ask a question about the meeting. I will search the transcripts and cite answers.
                    </p>
                  </div>
                ) : (
                  /* Message logs */
                  <>
                    {/* Welcome message */}
                    <div className="flex gap-3">
                      <div className="w-7 h-7 rounded bg-violet-950 flex items-center justify-center shrink-0 border border-violet-800">
                        <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                      </div>
                      <div className="bg-[#12121A] border border-[#1C1C24] p-3.5 rounded-xl rounded-tl-none max-w-[85%] text-xs text-zinc-300 leading-relaxed shadow-sm">
                        Hello! I am your AI Workspace assistant. I can query across all the active sources in this session. Ask me anything!
                      </div>
                    </div>

                    {/* Chat Logs mapping */}
                    {/* Fetch chat logs from database and map */}
                    {activeSession.sources.some(s => s.status === 'completed') && (
                      <ChatMessagesList 
                        sessionId={activeSessionId} 
                        chatLoading={chatLoading} 
                        parseChatCitations={parseChatCitations}
                        chatEndRef={chatEndRef}
                      />
                    )}
                  </>
                )}
              </div>

              {/* Chat Input Area */}
              <div className="p-4 border-t border-[#1C1C24] bg-[#0A0A0F] shrink-0 space-y-3">
                
                {/* Suggested Questions Pills */}
                {activeSession.sources.some(s => s.status === 'completed') && (
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                    {suggestedQuestions.map((q, idx) => (
                      <button
                        key={idx}
                        onClick={() => setChatInput(q)}
                        className="px-3 py-1.5 rounded-full bg-[#12121A] border border-[#1C1C24] text-[10px] text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors whitespace-nowrap shrink-0"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}

                {/* Input box */}
                <div className="relative flex items-center bg-[#12121A] border border-[#272733] focus-within:border-violet-500 rounded-xl px-4 py-2 transition-all shadow-md shadow-black/30">
                  <textarea 
                    rows={1}
                    placeholder={
                      activeSession.sources.filter(s => s.status === 'completed').length > 0 
                        ? "Ask about the workspace content..." 
                        : "Waiting for sources to finish..."
                    }
                    disabled={activeSession.sources.filter(s => s.status === 'completed').length === 0 || chatLoading}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendChat();
                      }
                    }}
                    className="flex-1 bg-transparent border-none text-xs text-white placeholder-zinc-600 resize-none focus:outline-none max-h-24 py-1"
                  />
                  <button 
                    onClick={handleSendChat}
                    disabled={!chatInput.trim() || chatLoading}
                    className="p-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white transition-all shadow-lg shadow-violet-950/20"
                  >
                    {chatLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}
      </main>

      {/* ──────────────────────────────────────────────────────── */}
      {/* 5. ADD SOURCE DIALOG MODAL                               */}
      {/* ──────────────────────────────────────────────────────── */}
      {showAddSourceModal && activeSession && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#12121A] w-full max-w-md border border-[#2D2D3F] rounded-xl shadow-2xl p-6 relative">
            
            <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-400" />
              Add Source to Workspace
            </h3>
            
            {/* Modal Tabs: YouTube vs File */}
            <div className="space-y-6">
              
              {/* YouTube Tab content */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Option 1: Paste YouTube URL</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="https://www.youtube.com/watch?v=..." 
                    value={youtubeUrlInput}
                    onChange={(e) => setYoutubeUrlInput(e.target.value)}
                    className="flex-1 px-3 py-2 bg-[#0B0B0F] border border-[#272733] rounded-lg text-xs text-white focus:outline-none focus:border-violet-500 placeholder-zinc-700 transition-all"
                  />
                  <button 
                    onClick={() => handleAddYoutubeSource(activeSession.session.id, youtubeUrlInput)}
                    disabled={submittingSource || !youtubeUrlInput}
                    className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-850 disabled:text-zinc-500 rounded-lg text-xs text-white font-medium transition-colors"
                  >
                    Add URL
                  </button>
                </div>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3 text-[10px] text-zinc-650 font-bold uppercase tracking-wider">
                <span className="h-px bg-zinc-800 flex-1"></span>
                <span>or</span>
                <span className="h-px bg-zinc-800 flex-1"></span>
              </div>

              {/* Upload Tab Content */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Option 2: Upload File</label>
                <div 
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={(e) => handleDrop(e, activeSession.session.id)}
                  className={`border-2 border-dashed rounded-lg p-6 text-center transition-all ${
                    dragActive ? "border-violet-500 bg-violet-950/10" : "border-zinc-800 hover:border-zinc-700"
                  }`}
                >
                  <FolderOpen className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                  <p className="text-[11px] text-zinc-400 mb-1">Drag files here to upload</p>
                  <span className="text-[9px] text-zinc-550 block mb-3">Supports MP3, WAV, MP4, etc.</span>
                  
                  <input 
                    type="file" 
                    id="modal-file-upload"
                    className="hidden" 
                    accept="audio/*,video/*"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileUpload(activeSession.session.id, e.target.files[0]);
                      }
                    }}
                  />
                  <label 
                    htmlFor="modal-file-upload"
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-750 rounded text-[10px] font-semibold text-white transition-colors cursor-pointer border border-zinc-750"
                  >
                    Select File
                  </label>
                </div>
              </div>

            </div>

            {/* Cancel button */}
            <div className="mt-6 flex justify-end">
              <button 
                onClick={() => {
                  setShowAddSourceModal(false);
                  setErrorMsg(null);
                }}
                className="px-4 py-2 bg-transparent text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-lg text-xs transition-colors"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

// Subcomponent to fetch and render chat history list in real time
function ChatMessagesList({ sessionId, chatLoading, parseChatCitations, chatEndRef }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchChat = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/chat`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (err) {
      console.error("Failed to fetch chat log:", err);
    }
  };

  useEffect(() => {
    fetchChat();
    // Poll chat history every 3 seconds to update when user submits
    const interval = setInterval(fetchChat, 3000);
    return () => clearInterval(interval);
  }, [sessionId, chatLoading]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="space-y-4">
      {messages.map((msg, index) => (
        <div key={index} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
          
          {msg.role !== 'user' && (
            <div className="w-7 h-7 rounded bg-violet-950 flex items-center justify-center shrink-0 border border-violet-850">
              <Sparkles className="w-3.5 h-3.5 text-violet-400" />
            </div>
          )}
          
          <div className={`p-3.5 rounded-xl text-xs leading-relaxed max-w-[85%] border shadow-sm ${
            msg.role === 'user'
              ? "bg-[#1E1E2A] border-[#37374D] text-white rounded-tr-none text-right select-text"
              : "bg-[#12121A] border-[#1C1C24] text-zinc-300 rounded-tl-none text-left select-text whitespace-pre-wrap"
          }`}>
            {msg.role === 'user' ? msg.content : parseChatCitations(msg.content)}
          </div>
          
        </div>
      ))}
      
      {chatLoading && (
        <div className="flex gap-3">
          <div className="w-7 h-7 rounded bg-violet-950 flex items-center justify-center shrink-0 border border-violet-850 animate-pulse">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400" />
          </div>
          <div className="bg-[#12121A] border border-[#1C1C24] p-3.5 rounded-xl rounded-tl-none text-xs text-zinc-550 italic animate-pulse">
            AI is thinking and searching sources...
          </div>
        </div>
      )}
      
      <div ref={chatEndRef} />
    </div>
  );
}

export default App;
