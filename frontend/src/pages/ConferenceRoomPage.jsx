import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Share2, Check } from 'lucide-react';
import VideoGrid from '../components/conference/VideoGrid';
import ControlBar from '../components/conference/ControlBar';
import ChatPanel from '../components/conference/ChatPanel';
import { useWebRTC } from '../hooks/useWebRTC';
import { conferenceService } from '../services/conferenceService';

const ConferenceRoomPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [conference, setConference] = useState(null);
  const [copied, setCopied] = useState(false); // ← НОВОЕ

  const {
    participants,
    isMuted,
    isVideoOn,
    isScreenSharing,
    toggleMute,
    toggleVideo,
    toggleScreenShare,
    leaveCall,
  } = useWebRTC(id);

  useEffect(() => {
    loadConference();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadConference = async () => {
    try {
      const data = await conferenceService.getConference(id);
      setConference(data);
    } catch (error) {
      console.error('Failed to load conference:', error);
    }
  };

  const handleLeaveCall = async () => {
    try {
      await conferenceService.leaveConference(id);
      leaveCall();
      navigate('/dashboard');
    } catch (error) {
      console.error('Failed to leave conference:', error);
      navigate('/dashboard');
    }
  };

  // ← НОВОЕ: Копирование ссылки
  const handleCopyInviteLink = () => {
    if (conference?.readable_id) {
      const inviteLink = `${window.location.origin}/join/${conference.readable_id}`;
      navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="h-screen bg-gray-900 flex flex-col relative overflow-hidden">
      {/* НОВОЕ: Кнопка Invite */}
      <div className="absolute top-4 right-4 z-20">
        <button
          onClick={handleCopyInviteLink}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors shadow-lg"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4" />
              Copied!
            </>
          ) : (
            <>
              <Share2 className="w-4 h-4" />
              Invite
            </>
          )}
        </button>
        
        {conference?.readable_id && (
          <div className="mt-2 px-4 py-2 bg-black bg-opacity-60 rounded-lg text-center">
            <p className="text-xs text-gray-400">Meeting ID</p>
            <p className="text-lg font-mono font-bold text-white tracking-widest">
              {conference.readable_id}
            </p>
          </div>
        )}
      </div>

      {/* Video Grid */}
      <div className="flex-1 relative">
        <VideoGrid participants={participants} />
        
        {/* Chat Panel */}
        <ChatPanel isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
      </div>

      {/* Control Bar */}
      <ControlBar
        isMuted={isMuted}
        isVideoOn={isVideoOn}
        isScreenSharing={isScreenSharing}
        onToggleMute={toggleMute}
        onToggleVideo={toggleVideo}
        onToggleScreenShare={toggleScreenShare}
        onLeaveCall={handleLeaveCall}
        onToggleChat={() => setIsChatOpen(!isChatOpen)}
      />
    </div>
  );
};

export default ConferenceRoomPage;