import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  MessageSquare, 
  Users, 
  X, 
  Minimize2, 
  Maximize2, 
  Send, 
  Circle,
  LogOut,
  UserPlus,
  Smile,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import './App.css';

// Types
interface User {
  id: string;
  username: string;
  status: 'online' | 'away' | 'busy';
  lastSeen: number;
}

interface Message {
  id: string;
  userId: string;
  username: string;
  text: string;
  timestamp: number;
  type: 'message' | 'system';
}

// Storage keys
const STORAGE_KEY_USERS = 'aol_chat_users';
const STORAGE_KEY_MESSAGES = 'aol_chat_messages';
const STORAGE_KEY_CURRENT_USER = 'aol_chat_current_user';

// Generate random ID
const generateId = () => Math.random().toString(36).substring(2, 9);

function App() {
  // State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isMobile, setIsMobile] = useState(false);
  
  const chatWindowRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Check if mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Load data from localStorage on mount
  useEffect(() => {
    const savedCurrentUser = localStorage.getItem(STORAGE_KEY_CURRENT_USER);
    const savedUsers = localStorage.getItem(STORAGE_KEY_USERS);
    const savedMessages = localStorage.getItem(STORAGE_KEY_MESSAGES);

    if (savedCurrentUser) {
      setCurrentUser(JSON.parse(savedCurrentUser));
      setIsChatOpen(true);
    }

    if (savedUsers) {
      setUsers(JSON.parse(savedUsers));
    }

    if (savedMessages) {
      setMessages(JSON.parse(savedMessages));
    }
  }, []);

  // Save data to localStorage whenever it changes
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem(STORAGE_KEY_CURRENT_USER, JSON.stringify(currentUser));
    }
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(messages));
  }, [messages]);

  // Scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Update user's last seen periodically
  useEffect(() => {
    if (!currentUser) return;

    const interval = setInterval(() => {
      const updatedUser = { ...currentUser, lastSeen: Date.now() };
      setCurrentUser(updatedUser);
      
      setUsers(prev => {
        const filtered = prev.filter(u => u.id !== currentUser.id);
        return [...filtered, updatedUser];
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [currentUser]);

  // Listen for storage changes (for multi-tab support)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY_USERS) {
        const newUsers = e.newValue ? JSON.parse(e.newValue) : [];
        setUsers(newUsers);
      }
      if (e.key === STORAGE_KEY_MESSAGES) {
        const newMessages = e.newValue ? JSON.parse(e.newValue) : [];
        setMessages(newMessages);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isMobile) return;
    if (e.target instanceof HTMLElement && e.target.closest('.no-drag')) return;
    
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  }, [position, isMobile]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    
    setPosition({
      x: e.clientX - dragOffset.x,
      y: e.clientY - dragOffset.y,
    });
  }, [isDragging, dragOffset]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Handlers
  const handleCreateUser = () => {
    if (!usernameInput.trim()) return;

    const newUser: User = {
      id: generateId(),
      username: usernameInput.trim(),
      status: 'online',
      lastSeen: Date.now(),
    };

    setCurrentUser(newUser);
    setUsers(prev => [...prev, newUser]);
    setUsernameInput('');
    setShowLoginDialog(false);
    setIsChatOpen(true);

    // Add system message
    const systemMessage: Message = {
      id: generateId(),
      userId: 'system',
      username: 'System',
      text: `${newUser.username} has entered the chat`,
      timestamp: Date.now(),
      type: 'system',
    };
    setMessages(prev => [...prev, systemMessage]);
  };

  const handleSendMessage = () => {
    if (!messageInput.trim() || !currentUser) return;

    const newMessage: Message = {
      id: generateId(),
      userId: currentUser.id,
      username: currentUser.username,
      text: messageInput.trim(),
      timestamp: Date.now(),
      type: 'message',
    };

    setMessages(prev => [...prev, newMessage]);
    setMessageInput('');
    inputRef.current?.focus();
  };

  const handleLogout = () => {
    if (currentUser) {
      const systemMessage: Message = {
        id: generateId(),
        userId: 'system',
        username: 'System',
        text: `${currentUser.username} has left the chat`,
        timestamp: Date.now(),
        type: 'system',
      };
      setMessages(prev => [...prev, systemMessage]);
      setUsers(prev => prev.filter(u => u.id !== currentUser.id));
    }
    setCurrentUser(null);
    setIsChatOpen(false);
    localStorage.removeItem(STORAGE_KEY_CURRENT_USER);
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getOnlineUsers = () => {
    const now = Date.now();
    return users.filter(u => now - u.lastSeen < 30000); // Online if seen in last 30s
  };

  // Render
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 relative overflow-hidden">
      {/* Retro background pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: `repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(255,255,255,0.03) 2px,
            rgba(255,255,255,0.03) 4px
          )`,
        }} />
      </div>

      {/* Landing page content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen p-8">
        <div className="text-center space-y-6 max-w-2xl">
          <h1 className="text-5xl md:text-7xl font-black text-white drop-shadow-2xl tracking-tight">
            Welcome to the brand portal
          </h1>
          
          <p className="text-xl text-blue-100 leading-relaxed">
            start chatting with others in the community
          </p>

          {!currentUser ? (
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Button
                onClick={() => setShowLoginDialog(true)}
                className="aol-button text-lg px-8 py-6 font-bold"
              >
                <UserPlus className="w-5 h-5 mr-2" />
                Create Screen Name
              </Button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Button
                onClick={() => setIsChatOpen(true)}
                className="aol-button text-lg px-8 py-6 font-bold animate-pulse"
              >
                <MessageSquare className="w-5 h-5 mr-2" />
                Open Chat
              </Button>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-12 max-w-lg mx-auto">
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
              <div className="text-3xl font-bold text-yellow-400">{getOnlineUsers().length}</div>
              <div className="text-sm text-blue-200">Online Now</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
              <div className="text-3xl font-bold text-yellow-400">{messages.filter(m => m.type === 'message').length}</div>
              <div className="text-sm text-blue-200">Messages</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20 col-span-2 md:col-span-1">
              <div className="text-3xl font-bold text-yellow-400">{users.length}</div>
              <div className="text-sm text-blue-200">Total Users</div>
            </div>
          </div>
        </div>

      </div>

      {/* Login Dialog */}
      <Dialog open={showLoginDialog} onOpenChange={setShowLoginDialog}>
        <DialogContent className="aol-dialog sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-center text-blue-900 flex items-center justify-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                <span className="text-white text-sm font-black">C</span>
              </div>
              Create Screen Name
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="bg-yellow-50 border-2 border-yellow-400 rounded p-3 text-sm text-yellow-800">
              <AlertCircle className="w-4 h-4 inline mr-1" />
              Choose a unique screen name to join the chat room!
            </div>
            <Input
              placeholder="Enter your screen name..."
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateUser()}
              className="aol-input text-lg"
              maxLength={20}
              autoFocus
            />
            <Button
              onClick={handleCreateUser}
              disabled={!usernameInput.trim()}
              className="w-full aol-button py-6 text-lg font-bold"
            >
              Start Chatting!
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Floating Chat Window */}
      {currentUser && isChatOpen && (
        <div
          ref={chatWindowRef}
          className={`fixed z-50 aol-floating-window ${isMinimized && !isMobile ? 'w-64' : isMobile ? 'inset-0 md:inset-4' : 'w-[800px] h-[600px]'}`}
          style={isMobile ? {} : {
            left: position.x,
            top: position.y,
            cursor: isDragging ? 'grabbing' : 'default',
          }}
          onMouseDown={handleMouseDown}
        >
          {/* AOL Window Chrome */}
          <div className={`aol-window-3d ${isMinimized && !isMobile ? 'h-auto' : 'h-full'} flex flex-col`}>
            {/* Title Bar */}
            <div className="aol-titlebar no-drag flex items-center justify-between px-2 py-1 select-none">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 bg-white rounded-sm flex items-center justify-center">
                  <span className="text-blue-600 text-xs font-black">C</span>
                </div>
                <span className="text-white font-bold text-sm">
                  {isMinimized ? 'Chat' : `Instant Messenger - ${currentUser.username}`}
                </span>
              </div>
              <div className="flex items-center gap-1 no-drag">
                {!isMobile && (
                  <button
                    onClick={() => setIsMinimized(!isMinimized)}
                    className="aol-window-btn w-5 h-5 flex items-center justify-center"
                  >
                    {isMinimized ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
                  </button>
                )}
                <button
                  onClick={() => setIsChatOpen(false)}
                  className="aol-window-btn w-5 h-5 flex items-center justify-center hover:bg-red-500"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>

            {!isMinimized && (
              <>
                {/* Menu Bar */}
                <div className="aol-menubar no-drag flex items-center gap-4 px-2 py-1 text-xs border-b border-gray-400">
                  <button className="hover:bg-blue-100 px-2 py-0.5 rounded">File</button>
                  <button className="hover:bg-blue-100 px-2 py-0.5 rounded">Edit</button>
                  <button className="hover:bg-blue-100 px-2 py-0.5 rounded">View</button>
                  <button className="hover:bg-blue-100 px-2 py-0.5 rounded">People</button>
                  <button className="hover:bg-blue-100 px-2 py-0.5 rounded">Help</button>
                </div>

                {/* Toolbar */}
                <div className="aol-toolbar no-drag flex items-center gap-2 px-2 py-2 border-b border-gray-400 bg-gray-100">
                  <Button
                    variant="default"
                    size="sm"
                    className="text-xs"
                  >
                    <MessageSquare className="w-3 h-3 mr-1" />
                    Chat
                  </Button>
                  <div className="flex-1" />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleLogout}
                    className="text-xs text-red-600 hover:bg-red-50"
                  >
                    <LogOut className="w-3 h-3 mr-1" />
                    Sign Off
                  </Button>
                </div>

                {/* Content Area - Always shows chat with buddy list sidebar */}
                <div className="flex-1 flex overflow-hidden bg-white">
                  {/* Chat Messages */}
                  <div className="flex-1 flex flex-col">
                    <ScrollArea className="flex-1 p-4">
                      <div className="space-y-3">
                        {messages.length === 0 ? (
                          <div className="text-center text-gray-400 py-8">
                            <div className="text-4xl mb-2">👋</div>
                            <p>Welcome to Chat!</p>
                            <p className="text-sm">Start the conversation...</p>
                          </div>
                        ) : (
                          messages.map((msg) => (
                            <div
                              key={msg.id}
                              className={`${
                                msg.type === 'system'
                                  ? 'text-center text-gray-500 text-sm italic'
                                  : msg.userId === currentUser.id
                                  ? 'text-right'
                                  : 'text-left'
                              }`}
                            >
                              {msg.type === 'message' && (
                                <div
                                  className={`inline-block max-w-[80%] ${
                                    msg.userId === currentUser.id
                                      ? 'aol-message-sent'
                                      : 'aol-message-received'
                                  }`}
                                >
                                  <div className="text-xs text-gray-500 mb-1">
                                    {msg.username} • {formatTime(msg.timestamp)}
                                  </div>
                                  <div className="text-sm">{msg.text}</div>
                                </div>
                              )}
                              {msg.type === 'system' && (
                                <span className="bg-yellow-100 px-3 py-1 rounded-full text-xs">
                                  {msg.text}
                                </span>
                              )}
                            </div>
                          ))
                        )}
                        <div ref={messagesEndRef} />
                      </div>
                    </ScrollArea>

                    {/* Input Area */}
                    <div className="aol-input-area no-drag p-3 border-t border-gray-400 bg-gray-100">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="shrink-0"
                        >
                          <Smile className="w-4 h-4" />
                        </Button>
                        <Input
                          ref={inputRef}
                          value={messageInput}
                          onChange={(e) => setMessageInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                          placeholder="Type a message..."
                          className="aol-input flex-1"
                        />
                        <Button
                          onClick={handleSendMessage}
                          disabled={!messageInput.trim()}
                          className="aol-send-btn shrink-0"
                        >
                          <Send className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Buddy List Sidebar - Always visible */}
                  <div className="w-48 border-l border-gray-400 bg-gray-50 flex flex-col shrink-0">
                    <div className="bg-blue-600 text-white text-xs font-bold px-3 py-2 flex items-center gap-2">
                      <Users className="w-3 h-3" />
                      Buddies ({getOnlineUsers().length})
                    </div>
                    <ScrollArea className="flex-1">
                      <div className="p-2 space-y-1">
                        {getOnlineUsers().map((user) => (
                          <div
                            key={user.id}
                            className="flex items-center gap-2 px-2 py-1.5 hover:bg-blue-100 rounded cursor-pointer text-sm"
                          >
                            <Circle
                              className={`w-2 h-2 fill-current ${
                                user.status === 'online'
                                  ? 'text-green-500'
                                  : user.status === 'away'
                                  ? 'text-yellow-500'
                                  : 'text-red-500'
                              }`}
                            />
                            <span className="truncate">{user.username}</span>
                          </div>
                        ))}
                        {getOnlineUsers().length === 0 && (
                          <div className="text-center text-gray-400 text-xs py-4">
                            No buddies online
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </div>

                {/* Status Bar */}
                <div className="aol-statusbar no-drag px-2 py-1 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span>{messages.filter(m => m.type === 'message').length} messages</span>
                    <span>{getOnlineUsers().length} buddies online</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Circle className="w-2 h-2 fill-green-500 text-green-500" />
                    <span>Connected</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Floating Chat Button (when chat is closed) */}
      {currentUser && !isChatOpen && (
        <button
          onClick={() => setIsChatOpen(true)}
          className="fixed bottom-6 right-6 z-50 aol-floating-btn animate-bounce"
        >
          <MessageSquare className="w-6 h-6" />
          {messages.filter(m => m.type === 'message' && m.userId !== currentUser.id).length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
              {messages.filter(m => m.type === 'message' && m.userId !== currentUser.id).length}
            </span>
          )}
        </button>
      )}
    </div>
  );
}

export default App;
