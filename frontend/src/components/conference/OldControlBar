import React from 'react';
import { Mic, MicOff, Video as VideoIcon, VideoOff, Monitor, PhoneOff, Settings, MessageSquare } from 'lucide-react';

const ControlBar = ({ 
  isMuted, 
  isVideoOn, 
  isScreenSharing,
  onToggleMute, 
  onToggleVideo, 
  onToggleScreenShare,
  onLeaveCall,
  onToggleChat
}) => {
  return (
    <div className="absolute bottom-0 left-0 right-0 bg-gray-900 bg-opacity-95 backdrop-blur-sm border-t border-gray-700">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Meeting Info */}
          <div className="text-white">
            <p className="text-sm font-medium">Daily Standup</p>
            <p className="text-xs text-gray-400">08:23</p>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3">
            {/* Mic */}
            <button
              onClick={onToggleMute}
              className={`p-4 rounded-full transition-colors ${
                isMuted
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-gray-700 hover:bg-gray-600'
              }`}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? (
                <MicOff className="w-5 h-5 text-white" />
              ) : (
                <Mic className="w-5 h-5 text-white" />
              )}
            </button>

            {/* Video */}
            <button
              onClick={onToggleVideo}
              className={`p-4 rounded-full transition-colors ${
                !isVideoOn
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-gray-700 hover:bg-gray-600'
              }`}
              title={isVideoOn ? 'Turn off camera' : 'Turn on camera'}
            >
              {isVideoOn ? (
                <VideoIcon className="w-5 h-5 text-white" />
              ) : (
                <VideoOff className="w-5 h-5 text-white" />
              )}
            </button>

            {/* Screen Share */}
            <button
              onClick={onToggleScreenShare}
              className={`p-4 rounded-full transition-colors ${
                isScreenSharing
                  ? 'bg-indigo-600 hover:bg-indigo-700'
                  : 'bg-gray-700 hover:bg-gray-600'
              }`}
              title="Share screen"
            >
              <Monitor className="w-5 h-5 text-white" />
            </button>

            {/* Chat */}
            <button
              onClick={onToggleChat}
              className="p-4 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors"
              title="Toggle chat"
            >
              <MessageSquare className="w-5 h-5 text-white" />
            </button>

            {/* Settings */}
            <button
              className="p-4 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors"
              title="Settings"
            >
              <Settings className="w-5 h-5 text-white" />
            </button>

            {/* Leave */}
            <button
              onClick={onLeaveCall}
              className="p-4 rounded-full bg-red-600 hover:bg-red-700 transition-colors ml-2"
              title="Leave call"
            >
              <PhoneOff className="w-5 h-5 text-white" />
            </button>
          </div>

          {/* Participants count */}
          <div className="text-white">
            <p className="text-sm font-medium">4 participants</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ControlBar;