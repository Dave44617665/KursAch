import { useState, useEffect } from 'react';

// ⚠️ ЗАГЛУШКА для WebRTC - будет заменена реальной реализацией
export const useWebRTC = (conferenceId) => {
  const [participants, setParticipants] = useState([]);
  const [localStream, setLocalStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  useEffect(() => {
    console.log('[STUB] Connecting to conference:', conferenceId);

    // Имитация загрузки участников
    setTimeout(() => {
      setParticipants([
        {
          id: '1',
          name: 'Alex Chen',
          isMuted: false,
          isVideoOn: true,
          isScreenSharing: false,
        },
        {
          id: '2',
          name: 'Sarah Miller',
          isMuted: true,
          isVideoOn: true,
          isScreenSharing: false,
        },
        {
          id: '3',
          name: 'David Kim',
          isMuted: false,
          isVideoOn: false,
          isScreenSharing: false,
        },
        {
          id: '4',
          name: 'You',
          isMuted: false,
          isVideoOn: true,
          isScreenSharing: false,
        },
      ]);

      console.log('[STUB] Connected to conference');
    }, 1000);

    return () => {
      console.log('[STUB] Disconnecting from conference');
    };
  }, [conferenceId]);

  const toggleMute = () => {
    setIsMuted(!isMuted);
    console.log('[STUB] Mic toggled:', !isMuted ? 'muted' : 'unmuted');
  };

  const toggleVideo = () => {
    setIsVideoOn(!isVideoOn);
    console.log('[STUB] Video toggled:', !isVideoOn ? 'on' : 'off');
  };

  const toggleScreenShare = () => {
    setIsScreenSharing(!isScreenSharing);
    console.log('[STUB] Screen sharing toggled:', !isScreenSharing ? 'on' : 'off');
  };

  const leaveCall = () => {
    console.log('[STUB] Leaving call');
  };

  return {
    participants,
    localStream,
    isMuted,
    isVideoOn,
    isScreenSharing,
    toggleMute,
    toggleVideo,
    toggleScreenShare,
    leaveCall,
  };
};