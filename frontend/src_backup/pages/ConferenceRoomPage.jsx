import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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

  return (
    <div className="h-screen bg-gray-900 flex flex-col relative overflow-hidden">
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