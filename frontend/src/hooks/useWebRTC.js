import { useState, useEffect, useRef } from 'react';

export const useWebRTC = (conferenceId, jwtToken, userName = 'You') => {
  const [participants, setParticipants] = useState([]); // [{ id, name, stream, isMuted, isVideoOn, isScreenSharing }]
  const [localStream, setLocalStream] = useState(null);
  const [isMuted, setIsMuted] = useState(true); // стартуем с выкл микрофоном
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const pcRef = useRef(null);
  const wsRef = useRef(null);
  const localAudioTrackRef = useRef(null);
  const localVideoTrackRef = useRef(null);
  const localScreenTrackRef = useRef(null);
  const myParticipantIdRef = useRef(null);

  useEffect(() => {
    const wsUrl = `${window.location.protocol.replace('http', 'ws')}//${window.location.host}/ws/conference/${conferenceId}?token=${jwtToken}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[WebRTC] WS connected');
      ws.send(JSON.stringify({ type: 'join' }));
    };

    ws.onmessage = async (event) => {
      const msg = JSON.parse(event.data);
      console.log('[WebRTC] ←', msg.type, msg);

      switch (msg.type) {
        case 'joined':
          myParticipantIdRef.current = msg.yourId;
          setParticipants(msg.participants || []);
          break;

        case 'participant_joined':
          setParticipants(prev => [...prev, msg.participant]);
          break;

        case 'participant_left':
          setParticipants(prev => prev.filter(p => p.id !== msg.participantId));
          break;

        case 'state_update':
          setParticipants(prev => prev.map(p =>
            p.id === msg.participantId ? { ...p, ...msg.state } : p
          ));
          break;

        case 'answer':
          await pcRef.current.setRemoteDescription(msg.sdp);
          break;

        case 'candidate':
          if (pcRef.current.remoteDescription) {
            await pcRef.current.addIceCandidate(msg.candidate);
          }
          break;

        // Rust может присылать другие типы — просто игнорируем или логируем
        default:
          console.warn('Unknown message type', msg.type);
      }
    };

    ws.onclose = () => console.log('[WebRTC] WS closed');

    // Инициализация медиа и PeerConnection после join
    const initMediaAndPC = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        localAudioTrackRef.current = stream.getAudioTracks()[0];
        localVideoTrackRef.current = stream.getVideoTracks()[0];

        localAudioTrackRef.current.enabled = !isMuted;
        localVideoTrackRef.current.enabled = isVideoOn;

        setLocalStream(stream);

        const pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        });
        pcRef.current = pc;

        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        pc.onicecandidate = ({ candidate }) => {
          if (candidate) {
            ws.send(JSON.stringify({ type: 'candidate', candidate }));
          }
        };

        pc.ontrack = (event) => {
          const remoteStream = event.streams[0];
          const publisherId = remoteStream.id; // ← Важно: Rust SFU должен установить stream.id = participant.id

          setParticipants(prev => prev.map(p => {
            if (p.id === publisherId) {
              remoteStream.getTracks().forEach(t => remoteStream.addTrack(t)); // на всякий
              return { ...p, stream: remoteStream };
            }
            return p;
          }));
        };

        pc.onnegotiationneeded = async () => {
          try {
            await pc.setLocalDescription(await pc.createOffer());
            ws.send(JSON.stringify({ type: 'offer', sdp: pc.localDescription }));
          } catch (err) {
            console.error(err);
          }
        };

        // После успешного join отправляем offer
        // (можно вызвать manually после 'joined')
        setTimeout(async () => {
          await pc.onnegotiationneeded();
        }, 1000);

      } catch (err) {
        console.error('[WebRTC] Media init error:', err);
      }
    };

    ws.addEventListener('message', (event) => {
      if (JSON.parse(event.data).type === 'joined') {
        initMediaAndPC();
      }
    });

    return () => {
      ws.close();
      pcRef.current?.close();
      localStream?.getTracks().forEach(t => t.stop());
    };
  }, [conferenceId, jwtToken]);

  const sendStateUpdate = (state) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'state_update', state }));
    }
  };

  const toggleMute = () => {
    if (localAudioTrackRef.current) {
      localAudioTrackRef.current.enabled = isMuted;
      setIsMuted(!isMuted);
      sendStateUpdate({ isMuted: !isMuted });
    }
  };

  const toggleVideo = () => {
    if (localVideoTrackRef.current) {
      localVideoTrackRef.current.enabled = !isVideoOn;
      setIsVideoOn(!isVideoOn);
      sendStateUpdate({ isVideoOn: !isVideoOn });
    }
  };

  const toggleScreenShare = async () => {
    try {
      if (!isScreenSharing) {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        localScreenTrackRef.current = screenTrack;

        const sender = pcRef.current.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(screenTrack);
        } else {
          pcRef.current.addTrack(screenTrack);
        }

        screenTrack.onended = () => toggleScreenShare();

        setIsScreenSharing(true);
        sendStateUpdate({ screenSharing: true });
      } else {
        if (localScreenTrackRef.current) {
          const sender = pcRef.current.getSenders().find(s => s.track === localScreenTrackRef.current);
          if (sender && localVideoTrackRef.current) {
            await sender.replaceTrack(localVideoTrackRef.current);
          } else {
            pcRef.current.getSenders().find(s => s.track === localScreenTrackRef.current)?.replaceTrack(null);
          }
          localScreenTrackRef.current.stop();
          localScreenTrackRef.current = null;
        }
        setIsScreenSharing(false);
        sendStateUpdate({ screenSharing: false });
      }
    } catch (err) {
      console.error('Screen share error:', err);
    }
  };

  const leaveCall = () => {
    wsRef.current?.close();
  };

  // Добавляем локального участника
  useEffect(() => {
    if (localStream && myParticipantIdRef.current) {
      setParticipants(prev => {
        const local = prev.find(p => p.id === myParticipantIdRef.current) || {
          id: myParticipantIdRef.current,
          name: userName,
          stream: localStream,
          isMuted,
          isVideoOn,
          isScreenSharing,
        };
        return prev.map(p => p.id === myParticipantIdRef.current ? local : p);
      });
    }
  }, [localStream, isMuted, isVideoOn, isScreenSharing]);

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