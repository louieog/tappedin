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
  AlertCircle,
  WifiOff
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import './App.css';

// Supabase configuration - read from env vars
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Debug logging (remove in production)
console.log('Supabase URL:', SUPABASE_URL ? 'Set' : 'Not set');
console.log('Supabase Key:', SUPABASE_ANON_KEY ? 'Set' : 'Not set');

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

interface DbMessage {
  id: string;
  user_id: string;
  username: string;
  text: string;
  timestamp: string;
  type: 'message' | 'system';
}

// Generate random ID
const generateId = () => Math.random().toString(36).substring(2, 9);

// Initialize Supabase client only if credentials are available
let supabase: SupabaseClient | null = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
    console.log('Supabase client initialized');
  } catch (err) {
    console.error('Failed to initialize Supabase:', err);
  }
} else {
  console.warn('Supabase credentials missing - chat will work in local-only mode');
}

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
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isSupabaseConfigured, setIsSupabaseConfigured] = useState(!!supabase);
  const [stats, setStats] = useState({ onlineCount: 0, messageCount: 0, totalUsers: 0 });
  
  const chatWindowRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const presenceChannelRef = useRef<RealtimeChannel | null>(null);
  const messagesChannelRef = useRef<RealtimeChannel | null>(null);

  // Check if mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Check Supabase configuration
  useEffect(() => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      setConnectionError('Supabase not configured. Chat will work in local-only mode.');
      setIsSupabaseConfigured(false);
    } else {
      setIsSupabaseConfigured(true);
    }
  }, []);

  // Load current user from localStorage on mount
  useEffect(() => {
    const savedCurrentUser = localStorage.getItem('tappedin_current_user');
    if (savedCurrentUser) {
      const user = JSON.parse(savedCurrentUser);
      setCurrentUser(user);
      setIsChatOpen(true);
    }
    // Fetch stats for landing page even if not logged in
    fetchStats();
  }, []);

  // Save current user to localStorage
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('tappedin_current_user', JSON.stringify(currentUser));
    }
  }, [currentUser]);

  // Fetch initial messages
  const fetchMessages = async () => {
    if (!supabase) {
      console.log('Supabase not available, skipping message fetch');
      return;
    }
    
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .order('timestamp', { ascending: true })
        .limit(100);
      
      if (error) {
        console.error('Error fetching messages:', error);
        setConnectionError(`Database error: ${error.message}`);
        return;
      }
      
      if (data) {
        const formattedMessages: Message[] = data.map((msg: DbMessage) => ({
          id: msg.id,
          userId: msg.user_id,
          username: msg.username,
          text: msg.text,
          timestamp: new Date(msg.timestamp).getTime(),
          type: msg.type,
        }));
        setMessages(formattedMessages);
        console.log(`Loaded ${formattedMessages.length} messages`);
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err);
      setConnectionError('Failed to connect to chat server');
    }
  };

  // Fetch stats for landing page (message count, total users)
  const fetchStats = async () => {
    if (!supabase) return;
    
    try {
      // Get message count
      const { count: msgCount } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('type', 'message');
      
      // Get unique user count from messages
      const { data: userData } = await supabase
        .from('messages')
        .select('user_id')
        .eq('type', 'message');
      
      const uniqueUsers = userData ? new Set(userData.map(m => m.user_id)).size : 0;
      
      setStats({
        onlineCount: getOnlineUsers().length,
        messageCount: msgCount || 0,
        totalUsers: uniqueUsers,
      });
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  // Subscribe to real-time messages
  useEffect(() => {
    if (!supabase || !currentUser) {
      console.log('Skipping realtime subscription - supabase or user not available');
      return;
    }

    console.log('Setting up realtime subscriptions...');
    fetchMessages();

    messagesChannelRef.current = supabase
      .channel('messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          console.log('New message received:', payload);
          const newMsg = payload.new as DbMessage;
          const message: Message = {
            id: newMsg.id,
            userId: newMsg.user_id,
            username: newMsg.username,
            text: newMsg.text,
            timestamp: new Date(newMsg.timestamp).getTime(),
            type: newMsg.type,
          };
          setMessages((prev) => {
            if (prev.find((m) => m.id === message.id)) return prev;
            return [...prev, message];
          });
        }
      )
      .subscribe((status) => {
        console.log('Messages subscription status:', status);
        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
          setConnectionError(null);
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setIsConnected(false);
          setConnectionError('Realtime connection lost');
        }
      });

    return () => {
      messagesChannelRef.current?.unsubscribe();
    };
  }, [currentUser]);

  // Presence tracking
  useEffect(() => {
    if (!supabase || !currentUser) {
      console.log('Skipping presence tracking - supabase or user not available');
      return;
    }

    console.log('Setting up presence tracking...');

    presenceChannelRef.current = supabase.channel('presence:chat', {
      config: {
        presence: {
          key: currentUser.id,
        },
      },
    });

    presenceChannelRef.current
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannelRef.current?.presenceState() || {};
        const onlineUsers: User[] = Object.values(state).flatMap((presences: any) =>
          presences.map((p: any) => ({
            id: p.user_id,
            username: p.username,
            status: p.status,
            lastSeen: p.last_seen,
          }))
        );
        setUsers(onlineUsers);
        console.log('Presence sync:', onlineUsers.length, 'users online');
      })
      .on('presence', { event: 'join' }, ({ key }) => {
        console.log('User joined:', key);
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        console.log('User left:', key);
      })
      .subscribe(async (status) => {
        console.log('Presence subscription status:', status);
        if (status === 'SUBSCRIBED') {
          await presenceChannelRef.current?.track({
            user_id: currentUser.id,
            username: currentUser.username,
            status: currentUser.status,
            last_seen: Date.now(),
          });
        }
      });

    // Update presence every 10 seconds
    const interval = setInterval(async () => {
      if (currentUser) {
        await presenceChannelRef.current?.track({
          user_id: currentUser.id,
          username: currentUser.username,
          status: currentUser.status,
          last_seen: Date.now(),
        });
      }
    }, 10000);

    return () => {
      clearInterval(interval);
      presenceChannelRef.current?.unsubscribe();
    };
  }, [currentUser]);

  // Scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  // Send message to Supabase
  const sendMessage = async (message: Omit<Message, 'id'>) => {
    if (!supabase) {
      console.log('Supabase not available, message not sent');
      return;
    }
    
    try {
      const { error } = await supabase.from('messages').insert({
        user_id: message.userId,
        username: message.username,
        text: message.text,
        timestamp: new Date(message.timestamp).toISOString(),
        type: message.type,
      });
      
      if (error) {
        console.error('Error sending message:', error);
        setConnectionError(`Failed to send: ${error.message}`);
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      setConnectionError('Failed to send message');
    }
  };

  // Handlers
  const handleCreateUser = async () => {
    if (!usernameInput.trim()) return;

    const newUser: User = {
      id: generateId(),
      username: usernameInput.trim(),
      status: 'online',
      lastSeen: Date.now(),
    };

    setCurrentUser(newUser);
    setUsernameInput('');
    setShowLoginDialog(false);
    setIsChatOpen(true);

    // Add system message
    if (isSupabaseConfigured) {
      await sendMessage({
        userId: 'system',
        username: 'System',
        text: `${newUser.username} has entered the chat`,
        timestamp: Date.now(),
        type: 'system',
      });
    } else {
      // Local-only mode
      setMessages(prev => [...prev, {
        id: generateId(),
        userId: 'system',
        username: 'System',
        text: `${newUser.username} has entered the chat (local mode)`,
        timestamp: Date.now(),
        type: 'system',
      }]);
    }
  };

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !currentUser) return;

    if (isSupabaseConfigured) {
      await sendMessage({
        userId: currentUser.id,
        username: currentUser.username,
        text: messageInput.trim(),
        timestamp: Date.now(),
        type: 'message',
      });
    } else {
      // Local-only mode
      setMessages(prev => [...prev, {
        id: generateId(),
        userId: currentUser.id,
        username: currentUser.username,
        text: messageInput.trim(),
        timestamp: Date.now(),
        type: 'message',
      }]);
    }

    setMessageInput('');
    inputRef.current?.focus();
  };

  const handleLogout = async () => {
    if (currentUser) {
      if (isSupabaseConfigured) {
        await sendMessage({
          userId: 'system',
          username: 'System',
          text: `${currentUser.username} has left the chat`,
          timestamp: Date.now(),
          type: 'system',
        });
      }
    }
    setCurrentUser(null);
    setIsChatOpen(false);
    localStorage.removeItem('tappedin_current_user');
    presenceChannelRef.current?.untrack();
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getOnlineUsers = () => {
    const now = Date.now();
    return users.filter(u => now - u.lastSeen < 60000); // Online if seen in last 60s
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

          {connectionError && (
            <div className="bg-yellow-500/20 border border-yellow-400 rounded-lg p-4 text-yellow-200 text-sm flex items-center gap-2">
              <WifiOff className="w-4 h-4" />
              {connectionError}
            </div>
          )}

          {!isSupabaseConfigured && (
            <div className="bg-red-500/20 border border-red-400 rounded-lg p-4 text-red-200 text-sm">
              <AlertCircle className="w-4 h-4 inline mr-2" />
              Chat is running in local-only mode. Messages won't sync between users.
            </div>
          )}

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
              <div className="text-3xl font-bold text-yellow-400">{stats.onlineCount}</div>
              <div className="text-sm text-blue-200">Online Now</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
              <div className="text-3xl font-bold text-yellow-400">{stats.messageCount}</div>
              <div className="text-sm text-blue-200">Messages</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20 col-span-2 md:col-span-1">
              <div className="text-3xl font-bold text-yellow-400">{stats.totalUsers}</div>
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
            {!isSupabaseConfigured && (
              <div className="bg-yellow-50 border-2 border-yellow-400 rounded p-3 text-sm text-yellow-800">
                <AlertCircle className="w-4 h-4 inline mr-1" />
                Running in local mode. Messages won't sync with other users.
              </div>
            )}
            <div className="bg-blue-50 border-2 border-blue-400 rounded p-3 text-sm text-blue-800">
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
                  <div className="flex items-center gap-2 text-xs">
                    {!isSupabaseConfigured ? (
                      <span className="flex items-center gap-1 text-gray-500">
                        <WifiOff className="w-2 h-2" />
                        Local Mode
                      </span>
                    ) : isConnected ? (
                      <span className="flex items-center gap-1 text-green-600">
                        <Circle className="w-2 h-2 fill-current" />
                        Live
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-yellow-600">
                        <Circle className="w-2 h-2 fill-current" />
                        Connecting...
                      </span>
                    )}
                  </div>
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
                  <div className="flex-1 flex flex-col min-w-0">
                    <div className="flex-1 overflow-y-auto p-4">
                      <div className="space-y-3">
                        {messages.filter(m => m.userId !== 'stat').length === 0 ? (
                          <div className="text-center text-gray-400 py-8">
                            <div className="text-4xl mb-2">👋</div>
                            <p>Welcome to Chat!</p>
                            <p className="text-sm">
                              {isSupabaseConfigured ? 'Start the conversation...' : 'Local mode - messages are not synced'}
                            </p>
                          </div>
                        ) : (
                          messages.filter(m => m.userId !== 'stat').map((msg) => (
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
                    </div>

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
                          placeholder={isSupabaseConfigured ? "Type a message..." : "Local mode - message not synced..."}
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

                  {/* Buddy List Sidebar - Fixed position */}
                  <div className="w-48 border-l border-gray-400 bg-gray-50 flex flex-col shrink-0 h-full">
                    <div className="bg-blue-600 text-white text-xs font-bold px-3 py-2 flex items-center gap-2 shrink-0">
                      <Users className="w-3 h-3" />
                      Buddies ({getOnlineUsers().length})
                    </div>
                    <div className="flex-1 overflow-y-auto">
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
                            {isSupabaseConfigured ? 'No buddies online' : 'Local mode - no sync'}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Status Bar */}
                <div className="aol-statusbar no-drag px-2 py-1 text-xs flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-4">
                    <span>{messages.filter(m => m.type === 'message' && m.userId !== 'stat').length} messages</span>
                    <span>{getOnlineUsers().length} buddies online</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {!isSupabaseConfigured ? (
                      <>
                        <WifiOff className="w-2 h-2 text-gray-500" />
                        <span className="text-gray-500">Local</span>
                      </>
                    ) : (
                      <>
                        <Circle className={`w-2 h-2 fill-current ${isConnected ? 'text-green-500' : 'text-yellow-500'}`} />
                        <span>{isConnected ? 'Connected' : 'Connecting...'}</span>
                      </>
                    )}
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
