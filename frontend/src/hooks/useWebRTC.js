import { useState, useEffect, useRef } from 'react';

export const useWebRTC = (conferenceId, jwtToken, userName = 'You') => {
  const [participants, setParticipants] = useState([]);
  const [localStream, setLocalStream] = useState(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const pcRef = useRef(null);
  const wsRef = useRef(null);
  const localAudioTrackRef = useRef(null);
  const localVideoTrackRef = useRef(null);
  const localScreenTrackRef = useRef(null);
  const myParticipantIdRef = useRef(null);

  useEffect(() => {
    // Проверяем что токен передан
    if (!jwtToken) {
      console.error('[WebRTC] JWT token is required');
      return;
    }

    // Подключаемся к Go API WebSocket (который проксирует к Rust SFU)
    // В development используем явный URL к Go API
    const isDevelopment = process.env.NODE_ENV === 'development';
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    
    let wsUrl;
    if (isDevelopment) {
      // В dev режиме явно указываем порт Go API
      wsUrl = `ws://localhost:8080/ws/conference/${conferenceId}?token=${jwtToken}`;
    } else {
      // В production используем текущий хост
      const wsHost = window.location.host;
      wsUrl = `${wsProtocol}//${wsHost}/ws/conference/${conferenceId}?token=${jwtToken}`;
    }
    
    console.log('[WebRTC] Connecting to:', wsUrl);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    let initializationDone = false;

    ws.onopen = () => {
      console.log('[WebRTC] WebSocket connected');
      setIsConnected(true);
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        console.log('[WebRTC] ← Received:', msg.type, msg);

        switch (msg.type) {
          case 'joined':
            // Go прислал подтверждение присоединения
            myParticipantIdRef.current = msg.yourId;
            console.log('[WebRTC] Joined as participant:', msg.yourId);
            
            // Устанавливаем начальный список участников
            if (msg.participants && Array.isArray(msg.participants)) {
              setParticipants(msg.participants.map(p => ({
                id: p.id,
                name: p.name,
                stream: null,
                isMuted: p.isMuted ?? true,
                isVideoOn: p.isVideoOn ?? true,
                isScreenSharing: p.screenSharing ?? false
              })));
            }
            
            // Инициализируем медиа и PeerConnection только один раз
            if (!initializationDone) {
              initializationDone = true;
              await initMediaAndPC(ws);
            }
            break;

          case 'participant_joined':
            // Новый участник присоединился
            console.log('[WebRTC] Participant joined:', msg.participant);
            if (msg.participant) {
              const p = msg.participant;
              setParticipants(prev => {
                // Проверяем что такого участника еще нет
                if (prev.find(existing => existing.id === p.id)) {
                  return prev;
                }
                return [...prev, {
                  id: p.id,
                  name: p.name,
                  stream: null,
                  isMuted: p.isMuted ?? true,
                  isVideoOn: p.isVideoOn ?? true,
                  isScreenSharing: p.screenSharing ?? false
                }];
              });
            }
            break;

          case 'participant_left':
            // Участник покинул конференцию
            console.log('[WebRTC] Participant left:', msg.participantId);
            if (msg.participantId) {
              setParticipants(prev => prev.filter(p => p.id !== msg.participantId));
            }
            break;

          case 'state_update':
            // Обновление состояния участника (mute/video/screen)
            console.log('[WebRTC] State update for:', msg.participantId, msg.state);
            if (msg.participantId && msg.state) {
              setParticipants(prev => prev.map(p => {
                if (p.id === msg.participantId) {
                  return {
                    ...p,
                    isMuted: msg.state.isMuted ?? p.isMuted,
                    isVideoOn: msg.state.isVideoOn ?? p.isVideoOn,
                    isScreenSharing: msg.state.screenSharing ?? p.isScreenSharing
                  };
                }
                return p;
              }));
            }
            break;

          case 'answer':
            // SDP answer от Rust SFU (через Go proxy)
            console.log('[WebRTC] Received SDP answer');
            if (pcRef.current && msg.sdp) {
              try {
                await pcRef.current.setRemoteDescription({
                  type: 'answer',
                  sdp: msg.sdp
                });
                console.log('[WebRTC] Remote description set successfully');
              } catch (err) {
                console.error('[WebRTC] Error setting remote description:', err);
              }
            }
            break;

          case 'candidate':
            // ICE candidate от Rust SFU (через Go proxy)
            console.log('[WebRTC] Received ICE candidate');
            if (pcRef.current && msg.candidate) {
              try {
                // Парсим candidate string
                const candidate = new RTCIceCandidate({
                  candidate: msg.candidate,
                  sdpMid: msg.sdpMid || '0',
                  sdpMLineIndex: msg.sdpMLineIndex || 0
                });
                await pcRef.current.addIceCandidate(candidate);
                console.log('[WebRTC] ICE candidate added');
              } catch (err) {
                console.error('[WebRTC] Error adding ICE candidate:', err);
              }
            }
            break;

          case 'error':
            console.error('[WebRTC] Server error:', msg.error || msg);
            break;

          default:
            console.warn('[WebRTC] Unknown message type:', msg.type);
        }
      } catch (err) {
        console.error('[WebRTC] Error processing message:', err);
      }
    };

    ws.onerror = (error) => {
      console.error('[WebRTC] WebSocket error:', error);
      setIsConnected(false);
    };

    ws.onclose = () => {
      console.log('[WebRTC] WebSocket closed');
      setIsConnected(false);
    };

    const initMediaAndPC = async (ws) => {
      try {
        console.log('[WebRTC] Initializing media...');
        
        // Получаем локальный медиа-поток
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });

        localAudioTrackRef.current = stream.getAudioTracks()[0];
        localVideoTrackRef.current = stream.getVideoTracks()[0];

        // Применяем начальное состояние
        if (localAudioTrackRef.current) {
          localAudioTrackRef.current.enabled = !isMuted;
        }
        if (localVideoTrackRef.current) {
          localVideoTrackRef.current.enabled = isVideoOn;
        }

        setLocalStream(stream);
        console.log('[WebRTC] Local stream acquired:', {
          audio: !!localAudioTrackRef.current,
          video: !!localVideoTrackRef.current
        });

        // Создаём PeerConnection
        const pc = new RTCPeerConnection({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        });
        pcRef.current = pc;

        // Добавляем локальные треки
        stream.getTracks().forEach(track => {
          console.log('[WebRTC] Adding local track:', track.kind, track.id);
          pc.addTrack(track, stream);
        });

        // Обработка ICE candidates
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            console.log('[WebRTC] → Sending ICE candidate');
            ws.send(JSON.stringify({
              type: 'candidate',
              candidate: event.candidate.candidate
            }));
          } else {
            console.log('[WebRTC] ICE gathering complete');
          }
        };

        // Обработка входящих треков от других участников
        pc.ontrack = (event) => {
          console.log('[WebRTC] Received remote track:', event.track.kind, event.track.id);
          const remoteStream = event.streams[0];
          
          if (!remoteStream) {
            console.warn('[WebRTC] No stream associated with track');
            return;
          }

          console.log('[WebRTC] Remote stream received, id:', remoteStream.id);
          
          // Обновляем участников с потоком
          // TODO: Rust SFU должен передавать participant ID
          // Пока обновляем первого участника без потока
          setParticipants(prev => {
            // Ищем участника без стрима (не считая себя)
            const updated = [...prev];
            const idx = updated.findIndex(p => 
              !p.stream && p.id !== myParticipantIdRef.current
            );
            
            if (idx !== -1) {
              updated[idx] = { ...updated[idx], stream: remoteStream };
              console.log('[WebRTC] Assigned stream to participant:', updated[idx].id);
            } else {
              console.warn('[WebRTC] No participant found for remote stream');
            }
            
            return updated;
          });
        };

        // Мониторинг состояния соединения
        pc.oniceconnectionstatechange = () => {
          console.log('[WebRTC] ICE connection state:', pc.iceConnectionState);
          if (pc.iceConnectionState === 'failed') {
            console.error('[WebRTC] ICE connection failed');
            // Можно попробовать restart ICE
            pc.restartIce();
          }
        };

        pc.onconnectionstatechange = () => {
          console.log('[WebRTC] Connection state:', pc.connectionState);
          if (pc.connectionState === 'failed') {
            console.error('[WebRTC] Connection failed');
          }
        };

        pc.onicegatheringstatechange = () => {
          console.log('[WebRTC] ICE gathering state:', pc.iceGatheringState);
        };

        // Создаём и отправляем offer
        console.log('[WebRTC] Creating offer...');
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true
        });
        
        await pc.setLocalDescription(offer);
        console.log('[WebRTC] Local description set');
        
        console.log('[WebRTC] → Sending offer');
        ws.send(JSON.stringify({
          type: 'offer',
          sdp: offer.sdp
        }));

        // Отправляем начальное состояние
        sendStateUpdate(ws, {
          isMuted,
          isVideoOn,
          screenSharing: isScreenSharing
        });

      } catch (err) {
        console.error('[WebRTC] Media initialization error:', err);
        alert('Failed to access camera/microphone: ' + err.message);
      }
    };

    return () => {
      console.log('[WebRTC] Cleaning up...');
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      if (pcRef.current) {
        pcRef.current.close();
      }
      if (localStream) {
        localStream.getTracks().forEach(t => {
          t.stop();
          console.log('[WebRTC] Stopped track:', t.kind);
        });
      }
    };
  }, [conferenceId, jwtToken]);

  const sendStateUpdate = (ws, state) => {
    const wsToUse = ws || wsRef.current;
    if (wsToUse?.readyState === WebSocket.OPEN) {
      console.log('[WebRTC] → Sending state update:', state);
      wsToUse.send(JSON.stringify({
        type: 'state_update',
        state
      }));
    }
  };

  const toggleMute = () => {
    if (localAudioTrackRef.current) {
      const newMuted = !isMuted;
      localAudioTrackRef.current.enabled = !newMuted;
      setIsMuted(newMuted);
      console.log('[WebRTC] Microphone', newMuted ? 'muted' : 'unmuted');
      sendStateUpdate(null, {
        isMuted: newMuted,
        isVideoOn,
        screenSharing: isScreenSharing
      });
    }
  };

  const toggleVideo = () => {
    if (localVideoTrackRef.current) {
      const newVideoOn = !isVideoOn;
      localVideoTrackRef.current.enabled = newVideoOn;
      setIsVideoOn(newVideoOn);
      console.log('[WebRTC] Video', newVideoOn ? 'enabled' : 'disabled');
      sendStateUpdate(null, {
        isMuted,
        isVideoOn: newVideoOn,
        screenSharing: isScreenSharing
      });
    }
  };

  const toggleScreenShare = async () => {
    // Проверка поддержки Screen Sharing API
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      console.error('[WebRTC] Screen sharing not supported');
      alert('Screen sharing is not supported in your browser');
      return;
    }

    try {
      if (!isScreenSharing) {
        console.log('[WebRTC] Starting screen share...');
        
        // Проверяем что PeerConnection существует
        if (!pcRef.current) {
          console.error('[WebRTC] PeerConnection not initialized');
          alert('Connection not ready. Please try again.');
          return;
        }

        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            cursor: 'always',
            displaySurface: 'monitor'
          },
          audio: false
        });
        
        const screenTrack = screenStream.getVideoTracks()[0];
        
        if (!screenTrack) {
          console.error('[WebRTC] No screen track obtained');
          return;
        }

        localScreenTrackRef.current = screenTrack;

        // Заменяем video track на screen track
        const sender = pcRef.current.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(screenTrack);
          console.log('[WebRTC] Video track replaced with screen share');
        } else {
          console.warn('[WebRTC] No video sender found, adding new track');
          pcRef.current.addTrack(screenTrack, screenStream);
        }

        // Обработка завершения screen share (когда пользователь нажимает "Stop sharing")
        screenTrack.onended = () => {
          console.log('[WebRTC] Screen share ended by user');
          // Предотвращаем рекурсивный вызов
          if (isScreenSharing) {
            stopScreenShare();
          }
        };

        setIsScreenSharing(true);
        sendStateUpdate(null, {
          isMuted,
          isVideoOn,
          screenSharing: true
        });
      } else {
        await stopScreenShare();
      }
    } catch (err) {
      console.error('[WebRTC] Screen share error:', err);
      
      // Более информативные сообщения об ошибках
      if (err.name === 'NotAllowedError') {
        console.log('[WebRTC] User denied screen sharing permission');
      } else if (err.name === 'NotFoundError') {
        alert('No screen available to share');
      } else if (err.name === 'NotReadableError') {
        alert('Cannot access screen. It may be in use by another application.');
      } else if (err.name === 'AbortError') {
        console.log('[WebRTC] Screen sharing cancelled by user');
      } else {
        alert('Failed to share screen: ' + err.message);
      }
    }
  };

  const stopScreenShare = async () => {
    console.log('[WebRTC] Stopping screen share...');
    
    if (localScreenTrackRef.current) {
      // Останавливаем screen track
      localScreenTrackRef.current.stop();
      
      // Возвращаем обычную камеру
      const sender = pcRef.current?.getSenders().find(
        s => s.track === localScreenTrackRef.current
      );
      
      if (sender && localVideoTrackRef.current) {
        try {
          await sender.replaceTrack(localVideoTrackRef.current);
          console.log('[WebRTC] Screen share track replaced back to camera');
        } catch (err) {
          console.error('[WebRTC] Error replacing track:', err);
        }
      }
      
      localScreenTrackRef.current = null;
    }
    
    setIsScreenSharing(false);
    sendStateUpdate(null, {
      isMuted,
      isVideoOn,
      screenSharing: false
    });
  };

  const leaveCall = () => {
    console.log('[WebRTC] Leaving call...');
    if (wsRef.current) {
      wsRef.current.close();
    }
    if (pcRef.current) {
      pcRef.current.close();
    }
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
    }
  };

  // Добавляем локального участника в список
  useEffect(() => {
    if (localStream && myParticipantIdRef.current) {
      setParticipants(prev => {
        const exists = prev.find(p => p.id === myParticipantIdRef.current);
        if (exists) {
          return prev.map(p => p.id === myParticipantIdRef.current ? {
            ...p,
            stream: localStream,
            isMuted,
            isVideoOn,
            isScreenSharing,
            name: p.name || userName
          } : p);
        }
        return [...prev, {
          id: myParticipantIdRef.current,
          name: userName,
          stream: localStream,
          isMuted,
          isVideoOn,
          isScreenSharing
        }];
      });
    }
  }, [localStream, isMuted, isVideoOn, isScreenSharing, userName]);

  return {
    participants,
    localStream,
    isMuted,
    isVideoOn,
    isScreenSharing,
    isConnected,
    toggleMute,
    toggleVideo,
    toggleScreenShare,
    leaveCall,
  };
};