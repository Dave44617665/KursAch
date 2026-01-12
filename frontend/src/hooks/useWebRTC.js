import { useState, useEffect, useRef } from "react";

export const useWebRTC = (
    conferenceId,
    jwtToken = localStorage.getItem("access_token"),
    userName = "You",
) => {
    const [participants, setParticipants] = useState([]);
    const [localStream, setLocalStream] = useState(null);
    const [localScreenStream, setLocalScreenStream] = useState(null);
    const [isMuted, setIsMuted] = useState(true);
    const [isVideoOn, setIsVideoOn] = useState(true);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [messages, setMessages] = useState([]);

    const pcRef = useRef(null);
    const wsRef = useRef(null);
    const localAudioTrackRef = useRef(null);
    const localVideoTrackRef = useRef(null);
    const localScreenTrackRef = useRef(null);
    const myParticipantIdRef = useRef(null);
    const initializingRef = useRef(false);

    useEffect(() => {
        console.log("[WebRTC] useEffect triggered with:", {
            conferenceId,
            jwtToken: jwtToken
                ? `${jwtToken.substring(0, 20)}...`
                : "NULL/UNDEFINED",
            userName,
        });

        if (!jwtToken) {
            console.error("[WebRTC] JWT token is required but not provided");
            return;
        }

        // Prevent duplicate connections in React StrictMode
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            console.log("[WebRTC] WebSocket already connected, skipping...");
            return;
        }

        if (initializingRef.current) {
            console.log("[WebRTC] Already initializing, skipping...");
            return;
        }

        initializingRef.current = true;

        // Connect using environment variable or relative to current location
        const wsProtocol =
            window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsBaseUrl =
            process.env.REACT_APP_WS_URL ||
            `${wsProtocol}//${window.location.host}/ws`;
        const wsUrl = `${wsBaseUrl}/conference/${conferenceId}?token=${encodeURIComponent(jwtToken)}`;

        console.log(
            "[WebRTC] Connecting to:",
            wsUrl.replace(jwtToken, "***TOKEN***"),
        );

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        let initializationDone = false;

        ws.onopen = () => {
            console.log("[WebRTC] WebSocket connected");
            setIsConnected(true);
            initializingRef.current = false;
        };

        ws.onmessage = async (event) => {
            try {
                const msg = JSON.parse(event.data);
                console.log("[WebRTC] ← Received:", msg.type, msg);

                switch (msg.type) {
                    case "joined":
                        myParticipantIdRef.current = msg.yourId;
                        console.log(
                            "[WebRTC] Joined as participant:",
                            msg.yourId,
                        );

                        if (
                            msg.participants &&
                            Array.isArray(msg.participants)
                        ) {
                            setParticipants(
                                msg.participants.map((p) => ({
                                    id: p.id,
                                    name: p.name,
                                    avatarUrl: p.avatarUrl,
                                    stream: null,
                                    isMuted: p.isMuted ?? true,
                                    isVideoOn: p.isVideoOn ?? true,
                                    isScreenSharing: p.screenSharing ?? false,
                                })),
                            );
                        }

                        if (!initializationDone) {
                            initializationDone = true;
                            await initMediaAndPC(ws);
                        }
                        break;

                    case "participant_joined":
                        console.log(
                            "[WebRTC] Participant joined:",
                            msg.participant,
                        );
                        if (msg.participant) {
                            const p = msg.participant;
                            setParticipants((prev) => {
                                if (
                                    prev.find(
                                        (existing) => existing.id === p.id,
                                    )
                                ) {
                                    return prev;
                                }
                                return [
                                    ...prev,
                                    {
                                        id: p.id,
                                        name: p.name,
                                        avatarUrl: p.avatarUrl,
                                        stream: null,
                                        isMuted: p.isMuted ?? true,
                                        isVideoOn: p.isVideoOn ?? true,
                                        isScreenSharing:
                                            p.screenSharing ?? false,
                                    },
                                ];
                            });
                        }
                        break;

                    case "participant_left":
                        console.log(
                            "[WebRTC] Participant left:",
                            msg.participantId,
                        );
                        if (msg.participantId) {
                            setParticipants((prev) =>
                                prev.filter((p) => p.id !== msg.participantId),
                            );
                        }
                        break;

                    case "state_update":
                        // Handle both camelCase (from Go backend) and snake_case (from Rust SFU)
                        const participantId =
                            msg.participantId || msg.participant_id;
                        const state = msg.state || {
                            isMuted: msg.muted,
                            isVideoOn: msg.video_on,
                            screenSharing: msg.screen_sharing,
                        };

                        console.log(
                            "[WebRTC] State update for:",
                            participantId,
                            state,
                        );

                        if (participantId && state) {
                            setParticipants((prev) =>
                                prev.map((p) => {
                                    if (p.id === participantId) {
                                        return {
                                            ...p,
                                            isMuted: state.isMuted ?? p.isMuted,
                                            isVideoOn:
                                                state.isVideoOn ?? p.isVideoOn,
                                            isScreenSharing:
                                                state.screenSharing ??
                                                p.isScreenSharing,
                                        };
                                    }
                                    return p;
                                }),
                            );
                        }
                        break;

                    case "chat":
                        console.log("[WebRTC] ← Received chat message:", msg);
                        if (msg.message) {
                            const newMessage = {
                                id: Date.now() + Math.random(),
                                participantId: msg.participantId,
                                name: msg.name || "Unknown",
                                avatarUrl: msg.avatarUrl,
                                message: msg.message,
                                timestamp:
                                    msg.timestamp || new Date().toISOString(),
                            };
                            setMessages((prev) => [...prev, newMessage]);
                        }
                        break;

                    case "answer":
                        console.log("[WebRTC] Received SDP answer");
                        if (pcRef.current && msg.sdp) {
                            try {
                                await pcRef.current.setRemoteDescription({
                                    type: "answer",
                                    sdp: msg.sdp,
                                });
                                console.log(
                                    "[WebRTC] Remote description set successfully",
                                );
                            } catch (err) {
                                console.error(
                                    "[WebRTC] Error setting remote description:",
                                    err,
                                );
                            }
                        }
                        break;

                    case "candidate":
                        console.log("[WebRTC] Received ICE candidate");
                        if (pcRef.current && msg.candidate) {
                            try {
                                const candidate = new RTCIceCandidate({
                                    candidate: msg.candidate,
                                    sdpMid: msg.sdpMid || "0",
                                    sdpMLineIndex: msg.sdpMLineIndex || 0,
                                });
                                await pcRef.current.addIceCandidate(candidate);
                                console.log("[WebRTC] ICE candidate added");
                            } catch (err) {
                                console.error(
                                    "[WebRTC] Error adding ICE candidate:",
                                    err,
                                );
                            }
                        }
                        break;

                    case "error":
                        console.error(
                            "[WebRTC] Server error:",
                            msg.error || msg,
                        );
                        break;

                    default:
                        console.warn(
                            "[WebRTC] Unknown message type:",
                            msg.type,
                        );
                }
            } catch (err) {
                console.error("[WebRTC] Error processing message:", err);
            }
        };

        ws.onerror = (error) => {
            console.error("[WebRTC] WebSocket error:", error);
            setIsConnected(false);
            initializingRef.current = false;
        };

        ws.onclose = () => {
            console.log("[WebRTC] WebSocket closed");
            setIsConnected(false);
            initializingRef.current = false;
        };

        const initMediaAndPC = async (ws) => {
            try {
                console.log("[WebRTC] Initializing media...");

                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: true,
                    video: {
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                    },
                });

                localAudioTrackRef.current = stream.getAudioTracks()[0];
                localVideoTrackRef.current = stream.getVideoTracks()[0];

                if (localAudioTrackRef.current) {
                    localAudioTrackRef.current.enabled = !isMuted;
                }
                if (localVideoTrackRef.current) {
                    localVideoTrackRef.current.enabled = isVideoOn;
                }

                setLocalStream(stream);
                console.log("[WebRTC] Local stream acquired:", {
                    audio: !!localAudioTrackRef.current,
                    video: !!localVideoTrackRef.current,
                });

                const pc = new RTCPeerConnection({
                    iceServers: [
                        { urls: "stun:stun.l.google.com:19302" },
                        { urls: "stun:stun1.l.google.com:19302" },
                        { urls: "stun:stun2.l.google.com:19302" },
                        {
                            urls: "turn:openrelay.metered.ca:80",
                            username: "openrelayproject",
                            credential: "openrelayproject",
                        },
                        {
                            urls: "turn:openrelay.metered.ca:443",
                            username: "openrelayproject",
                            credential: "openrelayproject",
                        },
                        {
                            urls: "turn:openrelay.metered.ca:443?transport=tcp",
                            username: "openrelayproject",
                            credential: "openrelayproject",
                        },
                    ],
                    iceCandidatePoolSize: 10,
                });
                pcRef.current = pc;

                stream.getTracks().forEach((track) => {
                    console.log(
                        "[WebRTC] Adding local track:",
                        track.kind,
                        track.id,
                    );
                    pc.addTrack(track, stream);
                });

                pc.ontrack = (event) => {
                    console.log(
                        "[WebRTC] ========== RECEIVED REMOTE TRACK ==========",
                    );
                    console.log("[WebRTC] Track kind:", event.track.kind);
                    console.log("[WebRTC] Track id:", event.track.id);
                    console.log("[WebRTC] Track label:", event.track.label);
                    console.log("[WebRTC] Track enabled:", event.track.enabled);
                    console.log(
                        "[WebRTC] Track readyState:",
                        event.track.readyState,
                    );
                    console.log(
                        "[WebRTC] Transceiver mid:",
                        event.transceiver.mid,
                    );
                    console.log(
                        "[WebRTC] Streams:",
                        event.streams.length,
                        event.streams,
                    );

                    const track = event.track;
                    const isVideo = track.kind === "video";
                    const isAudio = track.kind === "audio";

                    setParticipants((prev) => {
                        console.log(
                            "[WebRTC] Current participants before update:",
                            prev.map((p) => ({
                                id: p.id,
                                name: p.name,
                                hasStream: !!p.stream,
                                audioTracks: p.stream
                                    ? p.stream.getAudioTracks().length
                                    : 0,
                                videoTracks: p.stream
                                    ? p.stream.getVideoTracks().length
                                    : 0,
                            })),
                        );

                        const updated = [...prev];

                        let idx = -1;

                        // Find the right participant based on track type
                        if (isVideo) {
                            // For video: find participant without video track yet
                            idx = updated.findIndex(
                                (p) =>
                                    p.id !== myParticipantIdRef.current &&
                                    (!p.stream ||
                                        p.stream
                                            .getVideoTracks()
                                            .filter(
                                                (t) => t.readyState === "live",
                                            ).length === 0),
                            );

                            // If all have video, find one with screen sharing flag for second video track
                            if (idx === -1 && track.kind === "video") {
                                idx = updated.findIndex(
                                    (p) =>
                                        p.id !== myParticipantIdRef.current &&
                                        p.isScreenSharing &&
                                        (!p.screenStream ||
                                            p.screenStream
                                                .getVideoTracks()
                                                .filter(
                                                    (t) =>
                                                        t.readyState === "live",
                                                ).length === 0),
                                );
                            }
                        } else if (isAudio) {
                            // For audio: find participant without audio track yet
                            idx = updated.findIndex(
                                (p) =>
                                    p.id !== myParticipantIdRef.current &&
                                    (!p.stream ||
                                        p.stream
                                            .getAudioTracks()
                                            .filter(
                                                (t) => t.readyState === "live",
                                            ).length === 0),
                            );
                        }

                        // Fallback: just find first remote participant
                        if (idx === -1) {
                            idx = updated.findIndex(
                                (p) => p.id !== myParticipantIdRef.current,
                            );
                        }

                        if (idx === -1) {
                            console.error(
                                "[WebRTC] ✗ No participant found for remote track!",
                            );
                            console.error(
                                "[WebRTC] Available participants:",
                                updated.map((p) => ({
                                    id: p.id,
                                    name: p.name,
                                    isLocal:
                                        p.id === myParticipantIdRef.current,
                                })),
                            );
                            return prev;
                        }

                        const participant = updated[idx];
                        console.log(
                            "[WebRTC] Found participant for track:",
                            participant.id,
                            participant.name,
                        );

                        // Determine if this is the third+ video track (screen share)
                        // First video track goes to regular stream, second+ goes to screen stream
                        if (isVideo) {
                            const existingVideoTracks = participant.stream
                                ? participant.stream
                                      .getVideoTracks()
                                      .filter((t) => t.readyState === "live")
                                      .length
                                : 0;

                            if (existingVideoTracks === 0) {
                                // First video track - regular camera
                                // Create new stream or clone existing one to avoid mutation
                                const newStream = participant.stream
                                    ? new MediaStream([
                                          ...participant.stream.getTracks(),
                                          track,
                                      ])
                                    : new MediaStream([track]);

                                updated[idx] = {
                                    ...participant,
                                    stream: newStream,
                                };
                                console.log(
                                    "[WebRTC] ✓ Assigned camera video track to participant:",
                                    participant.id,
                                    participant.name,
                                );
                                console.log(
                                    "[WebRTC] Stream now has:",
                                    newStream.getAudioTracks().length,
                                    "audio,",
                                    newStream.getVideoTracks().length,
                                    "video tracks",
                                );
                                console.log(
                                    "[WebRTC] Full stream object:",
                                    newStream,
                                );
                            } else {
                                // Second video track - screen share
                                const newScreenStream = participant.screenStream
                                    ? new MediaStream([
                                          ...participant.screenStream.getTracks(),
                                          track,
                                      ])
                                    : new MediaStream([track]);

                                updated[idx] = {
                                    ...participant,
                                    screenStream: newScreenStream,
                                };
                                console.log(
                                    "[WebRTC] ✓ Assigned screen share video track to participant:",
                                    participant.id,
                                    participant.name,
                                );
                            }
                        } else if (isAudio) {
                            // Audio always goes to regular stream
                            // Create new stream or clone existing one to avoid mutation
                            const newStream = participant.stream
                                ? new MediaStream([
                                      ...participant.stream.getTracks(),
                                      track,
                                  ])
                                : new MediaStream([track]);

                            updated[idx] = {
                                ...participant,
                                stream: newStream,
                            };
                            console.log(
                                "[WebRTC] ✓ Assigned audio track to participant:",
                                participant.id,
                                participant.name,
                            );
                            console.log(
                                "[WebRTC] Stream now has:",
                                newStream.getAudioTracks().length,
                                "audio,",
                                newStream.getVideoTracks().length,
                                "video tracks",
                            );
                            console.log(
                                "[WebRTC] Full stream object:",
                                newStream,
                            );
                        }

                        console.log(
                            "[WebRTC] Participants after update:",
                            updated.map((p) => ({
                                id: p.id,
                                name: p.name,
                                hasStream: !!p.stream,
                                audioTracks: p.stream
                                    ? p.stream.getAudioTracks().length
                                    : 0,
                                videoTracks: p.stream
                                    ? p.stream.getVideoTracks().length
                                    : 0,
                            })),
                        );
                        console.log(
                            "[WebRTC] ================================================",
                        );

                        return updated;
                    });
                };

                pc.oniceconnectionstatechange = () => {
                    console.log(
                        "[WebRTC] ICE connection state:",
                        pc.iceConnectionState,
                    );
                    if (pc.iceConnectionState === "failed") {
                        console.error(
                            "[WebRTC] ICE connection failed - connection cannot be established",
                        );
                        console.error("[WebRTC] This usually means:");
                        console.error("  - UDP port 5000 is blocked");
                        console.error(
                            "  - TURN server needed for NAT traversal",
                        );
                        console.error("  - Firewall blocking WebRTC");
                        pc.restartIce();
                    } else if (pc.iceConnectionState === "disconnected") {
                        console.warn(
                            "[WebRTC] ICE connection disconnected - attempting to reconnect",
                        );
                    } else if (pc.iceConnectionState === "connected") {
                        console.log(
                            "[WebRTC] ✓ ICE connection established successfully",
                        );
                    }
                };

                pc.onconnectionstatechange = () => {
                    console.log(
                        "[WebRTC] Connection state:",
                        pc.connectionState,
                    );
                    if (pc.connectionState === "failed") {
                        console.error("[WebRTC] ✗ Connection failed");
                        console.error(
                            "[WebRTC] Check firewall and network settings",
                        );
                    } else if (pc.connectionState === "connected") {
                        console.log("[WebRTC] ✓ Peer connection established");
                    }
                };

                pc.onicegatheringstatechange = () => {
                    console.log(
                        "[WebRTC] ICE gathering state:",
                        pc.iceGatheringState,
                    );
                };

                pc.onicecandidate = (event) => {
                    if (event.candidate) {
                        console.log("[WebRTC] ICE candidate:", {
                            type: event.candidate.type,
                            protocol: event.candidate.protocol,
                            address: event.candidate.address || "hidden",
                            port: event.candidate.port,
                        });

                        console.log("[WebRTC] → Sending ICE candidate");
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(
                                JSON.stringify({
                                    type: "candidate",
                                    candidate: event.candidate.candidate,
                                }),
                            );
                        } else {
                            console.warn(
                                "[WebRTC] Cannot send ICE candidate, WebSocket not open",
                            );
                        }
                    } else {
                        console.log("[WebRTC] ICE gathering complete");
                    }
                };

                console.log("[WebRTC] Creating offer...");
                const offer = await pc.createOffer({
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: true,
                });

                await pc.setLocalDescription(offer);
                console.log("[WebRTC] Local description set");

                console.log("[WebRTC] → Sending offer");
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(
                        JSON.stringify({
                            type: "offer",
                            sdp: offer.sdp,
                        }),
                    );
                } else {
                    console.error(
                        "[WebRTC] Cannot send offer, WebSocket not open:",
                        ws.readyState,
                    );
                    return;
                }

                if (ws.readyState === WebSocket.OPEN) {
                    sendStateUpdate(ws, {
                        isMuted,
                        isVideoOn,
                        screenSharing: isScreenSharing,
                    });
                }
            } catch (err) {
                console.error("[WebRTC] Media initialization error:", err);
                alert("Failed to access camera/microphone: " + err.message);
            }
        };

        return () => {
            console.log("[WebRTC] Cleanup called");
            // Don't cleanup on every re-render, only on unmount
            // This prevents issues with React StrictMode
        };
    }, [conferenceId, jwtToken]);

    const sendStateUpdate = (ws, state) => {
        const wsToUse = ws || wsRef.current;
        if (wsToUse?.readyState === WebSocket.OPEN) {
            console.log("[WebRTC] → Sending state update:", state);
            wsToUse.send(
                JSON.stringify({
                    type: "state_update",
                    state,
                }),
            );
        }
    };

    const toggleMute = () => {
        if (localAudioTrackRef.current) {
            const newMuted = !isMuted;
            localAudioTrackRef.current.enabled = !newMuted;
            setIsMuted(newMuted);
            console.log("[WebRTC] Microphone", newMuted ? "muted" : "unmuted");
            sendStateUpdate(null, {
                isMuted: newMuted,
                isVideoOn,
                screenSharing: isScreenSharing,
            });
        }
    };

    const toggleVideo = () => {
        console.log("[WebRTC] toggleVideo called, current state:", {
            isVideoOn,
            hasTrack: !!localVideoTrackRef.current,
            trackEnabled: localVideoTrackRef.current?.enabled,
        });

        if (!localVideoTrackRef.current) {
            console.error("[WebRTC] No video track available");
            return;
        }

        const newVideoOn = !isVideoOn;
        localVideoTrackRef.current.enabled = newVideoOn;
        setIsVideoOn(newVideoOn);
        console.log("[WebRTC] Video", newVideoOn ? "enabled" : "disabled");

        sendStateUpdate(null, {
            isMuted,
            isVideoOn: newVideoOn,
            screenSharing: isScreenSharing,
        });
    };

    const toggleScreenShare = async () => {
        console.log("[WebRTC] toggleScreenShare called, current state:", {
            isScreenSharing,
            hasPC: !!pcRef.current,
            isConnected,
        });

        if (
            !navigator.mediaDevices ||
            !navigator.mediaDevices.getDisplayMedia
        ) {
            console.error("[WebRTC] Screen sharing not supported");
            alert("Screen sharing is not supported in your browser");
            return;
        }

        if (!isConnected) {
            console.error("[WebRTC] WebSocket not connected");
            alert("Please wait for connection to establish");
            return;
        }

        if (!pcRef.current) {
            console.error("[WebRTC] PeerConnection not initialized");
            alert("Connection not ready. Please try again in a moment.");
            return;
        }

        if (isScreenSharing) {
            await stopScreenShare();
            return;
        }

        try {
            console.log("[WebRTC] Requesting screen share...");

            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    cursor: "always",
                },
                audio: false,
            });

            const screenTrack = screenStream.getVideoTracks()[0];

            if (!screenTrack) {
                console.error("[WebRTC] No screen track obtained");
                alert("Failed to get screen track");
                return;
            }

            console.log("[WebRTC] Screen track obtained:", screenTrack.id);

            // Label the track as screen share for identification
            screenTrack.contentHint = "detail";

            localScreenTrackRef.current = screenTrack;
            setLocalScreenStream(screenStream);

            // Add screen track as additional sender instead of replacing
            const screenSender = pcRef.current.addTrack(
                screenTrack,
                screenStream,
            );

            console.log("[WebRTC] Added screen share track to peer connection");

            // Handle user stopping share from browser UI
            screenTrack.onended = () => {
                console.log("[WebRTC] Screen share ended by user");
                stopScreenShare();
            };

            setIsScreenSharing(true);
            console.log("[WebRTC] Screen sharing started successfully");

            sendStateUpdate(null, {
                isMuted,
                isVideoOn,
                screenSharing: true,
            });
        } catch (err) {
            console.error("[WebRTC] Screen share error:", err);
            if (err.name === "NotAllowedError") {
                console.log("[WebRTC] User denied screen sharing permission");
            } else if (err.name === "NotFoundError") {
                alert("No screen available to share");
            } else if (err.name === "NotReadableError") {
                alert(
                    "Cannot access screen. It may be in use by another application.",
                );
            } else if (err.name === "AbortError") {
                console.log("[WebRTC] Screen sharing cancelled by user");
            } else {
                alert("Failed to share screen: " + err.message);
            }
        }
    };

    const stopScreenShare = async () => {
        console.log("[WebRTC] Stopping screen share...");

        if (localScreenTrackRef.current) {
            localScreenTrackRef.current.stop();

            // Remove the screen share sender instead of replacing
            const sender = pcRef.current
                ?.getSenders()
                .find((s) => s.track === localScreenTrackRef.current);

            if (sender) {
                try {
                    pcRef.current.removeTrack(sender);
                    console.log("[WebRTC] Screen share track removed");
                } catch (err) {
                    console.error("[WebRTC] Error removing track:", err);
                }
            }

            localScreenTrackRef.current = null;
        }

        setLocalScreenStream(null);
        setIsScreenSharing(false);
        sendStateUpdate(null, {
            isMuted,
            isVideoOn,
            screenSharing: false,
        });
    };

    const leaveCall = () => {
        console.log("[WebRTC] Leaving call...");
        if (wsRef.current) {
            wsRef.current.close();
        }
        if (pcRef.current) {
            pcRef.current.close();
        }
        if (localStream) {
            localStream.getTracks().forEach((t) => t.stop());
        }
    };

    useEffect(() => {
        if (localStream && myParticipantIdRef.current) {
            setParticipants((prev) => {
                const exists = prev.find(
                    (p) => p.id === myParticipantIdRef.current,
                );
                if (exists) {
                    return prev.map((p) =>
                        p.id === myParticipantIdRef.current
                            ? {
                                  ...p,
                                  stream: localStream,
                                  isMuted,
                                  isVideoOn,
                                  isScreenSharing,
                                  name: p.name || userName,
                              }
                            : p,
                    );
                }
                return [
                    ...prev,
                    {
                        id: myParticipantIdRef.current,
                        name: userName,
                        stream: localStream,
                        isMuted,
                        isVideoOn,
                        isScreenSharing,
                    },
                ];
            });
        }
    }, [localStream, isMuted, isVideoOn, isScreenSharing, userName]);

    // Cleanup on component unmount
    useEffect(() => {
        return () => {
            console.log("[WebRTC] Component unmounting, cleaning up...");
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.close();
            }
            if (pcRef.current) {
                pcRef.current.close();
            }
            if (localAudioTrackRef.current) {
                localAudioTrackRef.current.stop();
            }
            if (localVideoTrackRef.current) {
                localVideoTrackRef.current.stop();
            }
            if (localScreenTrackRef.current) {
                localScreenTrackRef.current.stop();
            }
        };
    }, []); // Empty deps - only on mount/unmount

    const switchDevices = async (audioDeviceId, videoDeviceId) => {
        try {
            console.log("[WebRTC] Switching devices...", {
                audioDeviceId,
                videoDeviceId,
            });

            const constraints = {
                audio: audioDeviceId
                    ? { deviceId: { exact: audioDeviceId } }
                    : true,
                video: videoDeviceId
                    ? {
                          deviceId: { exact: videoDeviceId },
                          width: { ideal: 1280 },
                          height: { ideal: 720 },
                      }
                    : true,
            };

            const newStream =
                await navigator.mediaDevices.getUserMedia(constraints);

            // Replace tracks in existing PeerConnection
            if (pcRef.current) {
                const senders = pcRef.current.getSenders();

                // Replace audio track
                const audioTrack = newStream.getAudioTracks()[0];
                if (audioTrack) {
                    const audioSender = senders.find(
                        (s) => s.track?.kind === "audio",
                    );
                    if (audioSender) {
                        await audioSender.replaceTrack(audioTrack);
                        localAudioTrackRef.current = audioTrack;
                        audioTrack.enabled = !isMuted;
                    }
                }

                // Replace video track
                const videoTrack = newStream.getVideoTracks()[0];
                if (videoTrack) {
                    const videoSender = senders.find(
                        (s) => s.track?.kind === "video",
                    );
                    if (videoSender) {
                        await videoSender.replaceTrack(videoTrack);
                        localVideoTrackRef.current = videoTrack;
                        videoTrack.enabled = isVideoOn;
                    }
                }
            }

            // Stop old tracks
            if (localStream) {
                localStream.getTracks().forEach((track) => track.stop());
            }

            setLocalStream(newStream);
            console.log("[WebRTC] Devices switched successfully");
        } catch (error) {
            console.error("[WebRTC] Failed to switch devices:", error);
            alert("Failed to switch devices: " + error.message);
        }
    };

    const sendMessage = (message) => {
        if (!message || !message.trim()) {
            console.warn("[WebRTC] Cannot send empty message");
            return;
        }

        if (wsRef.current?.readyState === WebSocket.OPEN) {
            console.log("[WebRTC] → Sending chat message:", message);
            wsRef.current.send(
                JSON.stringify({
                    type: "chat",
                    message: message.trim(),
                }),
            );
        } else {
            console.error("[WebRTC] WebSocket not connected");
        }
    };

    return {
        participants,
        localStream,
        localScreenStream,
        isMuted,
        isVideoOn,
        isScreenSharing,
        isConnected,
        messages,
        toggleMute,
        toggleVideo,
        toggleScreenShare,
        leaveCall,
        switchDevices,
        sendMessage,
    };
};
