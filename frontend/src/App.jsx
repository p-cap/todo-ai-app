import React, { useState, useEffect, useRef } from 'react';

// Live Azure Container Apps Production Endpoints
const API_CHAT_URL = "https://agent-api-backend.bluebush-096e5908.eastus2.azurecontainerapps.io/api/chat";
const API_TODOS_URL = "https://agent-api-backend.bluebush-096e5908.eastus2.azurecontainerapps.io/api/todos";

/**
 * A highly resilient Typewriter component tailored for streaming text
 * smoothly without double-triggering or blocking layout rendering engines.
 */
function TypewriterText({ text, speed = 20 }) {
  const [displayedText, setDisplayedText] = useState("");
  
  useEffect(() => {
    setDisplayedText(""); // Clear baseline on fresh string mount
    let index = 0;

    const timer = setInterval(() => {
      // Use the length of the string to safely pull characters sequentially
      if (index < text.length) {
        setDisplayedText(text.substring(0, index + 1));
        index++;
      } else {
        clearInterval(timer);
      }
    }, speed);

    // This cleanup function completely kills the old timer 
    // the exact split-second React remounts the component
    return () => {
      clearInterval(timer);
    };
  }, [text, speed]); 

  return <p className="whitespace-pre-wrap">{displayedText}</p>;
}
export default function App() {
  // --- STATE ENGINE ---
  const [todos, setTodos] = useState([]);
  const [isLoadingTodos, setIsLoadingTodos] = useState(true); // Layout loading monitor flag
  
  const [chatHistory, setChatHistory] = useState([
    { 
      sender: 'ai', 
      text: "Good morning. Welcome back to your space for calm focus. I am synced and ready to assist—how can I help you shape your intentions today?",
      isGreeting: true 
    }
  ]);
  
  const [inputMessage, setInputMessage] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  
  // --- LAYOUT ENGINE (DRAG-TO-RESIZE) ---
  const [chatWidth, setChatWidth] = useState(420);
  const [isResizing, setIsResizing] = useState(false);
  const chatEndRef = useRef(null);

  // Reusable function to pull the latest task arrays directly from Cosmos DB
  const refreshTodoList = async (showLoadingAnimation = false) => {
    if (showLoadingAnimation) setIsLoadingTodos(true);
    try {
      const response = await fetch(API_TODOS_URL);
      if (!response.ok) throw new Error(`Status ${response.status}`);
      const data = await response.json();
      if (data.todos) {
        setTodos(data.todos);
      }
    } catch (err) {
      console.error("Failed to synchronize task state matrix:", err);
    } finally {
      setIsLoadingTodos(false);
    }
  };

  // --- INITIAL COMPONENT MOUNT HOOK ---
  useEffect(() => {
    refreshTodoList(true); // Fire loading state explicitly on mount sequence
  }, []);

  // Auto-scrolls the assistant panel down when new messages drop in
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const startResizing = () => setIsResizing(true);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;
      const computedWidth = window.innerWidth - e.clientX;
      if (computedWidth >= 340 && computedWidth <= (window.innerWidth - 400)) {
        setChatWidth(computedWidth);
      }
    };
    const handleMouseUp = () => setIsResizing(false);

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // --- API SERVICE CALL ---
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || isProcessing) return;

    const userPayload = inputMessage;
    setChatHistory(prev => [...prev, { sender: 'user', text: userPayload }]);
    setInputMessage("");
    setIsProcessing(true);

    try {
      const response = await fetch(API_CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userPayload })
      });

      if (!response.ok) throw new Error(`Status ${response.status}`);
      const data = await response.json();
      
      const aiReply = data.response || data.detail || JSON.stringify(data);
      setChatHistory(prev => [...prev, { sender: 'ai', text: aiReply }]);

      // Pull down the immediate database state layout changes after the agent executes tools
      await refreshTodoList(false);

    } catch (error) {
      setChatHistory(prev => [...prev, { sender: 'ai', text: `Orchestration error: ${error.message}` }]);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className={`h-screen flex flex-col bg-background text-on-surface font-sans select-none ${isResizing ? 'cursor-col-resize' : ''}`}>

      {/* ==================== CONTENT CANVAS ==================== */}
      <main className="flex-1 flex overflow-hidden w-full">
        
        {/* LEFT COLUMN: TASK LIST PANEL */}
        <section className="flex-1 bg-surface p-12 flex flex-col overflow-hidden">
          <div className="max-w-[720px] w-full mx-auto flex flex-col h-full">
            
            {/* ==================== CENTERED HEADER ==================== */}
            <header className="mb-8 flex justify-center items-center flex-shrink-0">
              <div className="text-center">
                <h2 className="text-[44px] font-semibold tracking-tight text-on-surface leading-none">Todo AI</h2>
              </div>
            </header>

            {/* Tasks Stack Container with Adaptive State Interfaces */}
            <div className="flex-1 custom-scrollbar overflow-y-auto pr-2 pb-6 flex flex-col">
              {isLoadingTodos ? (
                /* Organic Minimalist Pulse Loading Placeholders */
                <div className="space-y-3 animate-pulse">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="flex flex-col gap-2 p-6 bg-surface-container-lowest/60 border border-outline-variant/50 rounded-xl">
                      <div className="h-4 w-1/3 bg-on-surface-variant/10 rounded" />
                      <div className="h-3 w-1/5 bg-on-surface-variant/5 rounded" />
                    </div>
                  ))}
                </div>
              ) : todos.length > 0 ? (
                <div className="space-y-3">
                  {/* 🚀 Reverse client-side date sorting engine (Descending: Newest to Oldest) */}
                  {[...todos]
                    .sort((a, b) => {
                      const dateA = a.time || "";
                      const dateB = b.time || "";
                      return dateB.localeCompare(dateA);
                    })
                    .map((todo) => (
                      <div key={todo.id} className="flex items-center justify-between p-5 bg-surface-container-lowest border border-outline-variant rounded-xl hover:border-primary/20 transition-all">
                        <div className="space-y-1.5 w-full flex justify-between items-center">
                          <div className="space-y-1.5">
                            <p className="text-[21px] font-normal text-on-surface tracking-tight">{todo.title}</p>
                            <div className="flex items-center gap-4 text-xs font-medium">
                              
                              {/* Dynamic Muted Status Pill Badges */}
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                                todo.status === 'Completed' 
                                  ? 'bg-secondary-container text-on-secondary-container border border-secondary/10' 
                                  : 'bg-primary-container text-on-primary-container border border-primary/10'
                              }`}>
                                <span className="material-symbols-outlined text-[9px] font-bold!">{todo.icon}</span>
                                {todo.status}
                              </span>

                              {todo.time && (
                                <span className="text-on-surface-variant flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[14px]">schedule</span>
                                  {todo.time}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                /* Organic Minimalist Empty Display State */
                <div className="flex-1 flex flex-col items-center justify-center text-center max-w-sm mx-auto p-6 animate-fade-in">
                  <div className="w-16 h-16 rounded-2xl bg-surface-container-low border border-outline-variant/30 flex items-center justify-center text-primary/60 mb-5">
                    <span className="material-symbols-outlined text-[32px] !font-light">spa</span>
                  </div>
                  <h3 className="text-xl font-medium tracking-tight text-on-surface mb-2">Space for Calm Focus</h3>
                  <p className="text-sm text-on-surface-variant/70 leading-relaxed">
                    Your scheduled intention list is currently clear. Ask the Task Assistant on the right to populate your roadmap.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* DRAGGABLE RESIZER SPLIT HANDLE */}
        <div 
          className={`w-[1px] h-full hover:bg-outline-variant transition-colors cursor-col-resize z-10 relative ${isResizing ? 'bg-outline-variant' : 'bg-transparent'}`}
          onMouseDown={startResizing}
        >
          <div className="absolute top-0 bottom-0 left-[-2px] right-[-2px] cursor-col-resize" />
        </div>

        {/* RIGHT COLUMN: TASK AI ASSISTANT PANEL */}
        <section 
          className="bg-surface-container-low border-l border-outline-variant flex flex-col h-full" 
          style={{ width: `${chatWidth}px`, flex: `0 0 ${chatWidth}px` }}
        >
          {/* Assistant Panel Header */}
          <header className="p-5 border-b border-outline-variant flex items-center justify-between flex-shrink-0 bg-surface-container-low">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-on-primary text-[18px] !font-normal" style={{ fontVariationSettings: "'FILL' 1" }}>
                  smart_toy
                </span>
              </div>
              <h3 className="text-[19px] font-medium tracking-tight text-on-surface">Task Assistant</h3>
            </div>
            <button className="text-on-surface-variant/70 hover:text-on-surface transition-colors cursor-pointer">
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </header>

          {/* Chat Message Scroll Canvas */}
          <div className="flex-1 p-5 space-y-5 custom-scrollbar overflow-y-auto bg-surface-container-low">
            {chatHistory.map((chat, idx) => (
              <div key={idx} className={`flex gap-3 ${chat.sender === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center ${chat.sender === 'user' ? 'bg-secondary-fixed' : 'bg-primary-fixed-dim'}`}>
                  <span className={`material-symbols-outlined text-[15px] ${chat.sender === 'user' ? 'text-on-secondary-fixed' : 'text-on-primary-fixed-variant'}`}>
                    {chat.sender === 'user' ? 'person' : 'smart_toy'}
                  </span>
                </div>
                
                <div className={`p-4 rounded-2xl border text-[15px] max-w-[85%] leading-relaxed ${
                  chat.sender === 'user' 
                    ? 'bg-primary-container text-on-primary-container border-transparent rounded-tr-none' 
                    : 'bg-surface-container-lowest text-on-surface border-outline-variant rounded-tl-none'
                }`}>
                  {chat.isGreeting ? (
                    <TypewriterText text={chat.text} speed={20} />
                  ) : (
                    <p className="whitespace-pre-wrap">{chat.text}</p>
                  )}
                </div>
              </div>
            ))}
            
            {/* Loading / Processing Indicator */}
            {isProcessing && (
              <div className="flex gap-1.5 items-center text-xs text-on-surface-variant/60 pl-11">
                <span className="w-1 h-1 rounded-full bg-primary animate-pulse"/>
                <span className="w-1 h-1 rounded-full bg-primary animate-pulse delay-75"/>
                <span>Syncing agent intent...</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Input Dock Area */}
          <div className="p-5 bg-surface-container-low border-t border-outline-variant shrink-0">
            <form onSubmit={handleSendMessage} className="relative flex items-center">
              <input 
                className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl py-3 pl-4 pr-11 focus:ring-1 focus:ring-primary/30 focus:border-primary transition-all text-[15px] text-on-surface placeholder:text-on-surface-variant/40"
                placeholder="Ask anything about your tasks..." 
                type="text"
                value={inputMessage}
                disabled={isProcessing}
                onChange={(e) => setInputMessage(e.target.value)}
              />
              <button 
                type="submit"
                disabled={isProcessing}
                className="absolute right-2.5 p-1.5 bg-primary text-on-primary rounded-lg hover:opacity-95 transition-all disabled:opacity-40 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">send</span>
              </button>
            </form>
            <div className="flex justify-between items-center mt-3.5 px-1 text-xs text-on-surface-variant/70">
              <span className="italic text-[11px] opacity-70">Todo AI may hallucinate tasks</span>
            </div>
          </div>

        </section>
      </main>
    </div>
  );
}