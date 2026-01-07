import React, { useState } from 'react';
import { X, Send, Paperclip } from 'lucide-react';

const ChatPanel = ({ isOpen, onClose }) => {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([
    {
      id: 1,
      user: 'Alex',
      text: 'Can you share the Figma link?',
      time: '10:30 AM',
      isOwn: false,
    },
    {
      id: 2,
      user: 'You',
      text: 'Project_Assets.zip',
      time: '10:31 AM',
      isOwn: true,
      isFile: true,
    },
  ]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!message.trim()) return;

    const newMessage = {
      id: messages.length + 1,
      user: 'You',
      text: message,
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      isOwn: true,
    };

    setMessages([...messages, newMessage]);
    setMessage('');
    
    console.log('[STUB] Message sent:', message);
  };

  if (!isOpen) return null;

  return (
    <div className="absolute right-0 top-0 bottom-0 w-80 bg-white border-l border-gray-200 flex flex-col z-10">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">In-call messages</h3>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 rounded transition-colors"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.isOwn ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[70%] ${msg.isOwn ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
              {!msg.isOwn && (
                <span className="text-xs font-medium text-gray-900">{msg.user}</span>
              )}
              
              {msg.isFile ? (
                <div className={`px-4 py-3 rounded-lg flex items-center gap-2 ${
                  msg.isOwn ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-900'
                }`}>
                  <Paperclip className="w-4 h-4" />
                  <span className="text-sm">{msg.text}</span>
                </div>
              ) : (
                <div className={`px-4 py-2 rounded-lg ${
                  msg.isOwn ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-900'
                }`}>
                  <p className="text-sm">{msg.text}</p>
                </div>
              )}
              
              <span className="text-xs text-gray-500">{msg.time}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="p-4 border-t border-gray-200">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Paperclip className="w-5 h-5" />
          </button>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Send a message..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
          />
          <button
            type="submit"
            disabled={!message.trim()}
            className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChatPanel;