import { useState, useEffect, useRef, useCallback } from "react";
import * as mediasoupClient from "mediasoup-client";

export const useMediasoup = (
    conferenceId,
    jwtToken = localStorage.getItem("access_token"),
    userName = "You",
) => {
    const [participants, setParticipants] = useState([]);
    const [localStream, setLocalStream] = useState(null);
    const [isMuted, setIsMuted] = useState(true);
    const [isVideoOn, setIsVideoOn] = useState(false);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [messages, setMessages] = useState([]);

    const wsRef = useRef(null);
    const deviceRef = useRef(null);
    const sendTransportRef = useRef(null);
    const recvTransportRef = useRef(null);
    const producersRef = useRef(new Map());
    const consumersRef = useRef(new Map());
    const localStreamRef = useRef(null);
    const myPeerIdRef = useRef(null);
    const participantsStreamsRef = useRef(new Map());
    const pendingConsumersRef = useRef([]);

    useEffect(() => {
        console.log("[MediaSoup] Hook initialized", {
            conferenceId,
            userName,
            hasToken: !!jwtToken,
            token: jwtToken ? `${jwtToken.substring(0, 20)}...` : "NULL",
        });

        if (!jwtToken) {
            console.error("[MediaSoup] Missing JWT token");
            return;
        }

        if (!conferenceId) {
            console.error("[MediaSoup] Missing conferenceId");
            return;
        }

        let ws = null;

        const connect = async () => {
            try {
                // Connect WebSocket
                const wsProtocol =
                    window.location.protocol === "https:" ? "wss:" : "ws:";
                // В dev режиме подключаемся напрямую к порту 3000, в production через nginx
                const isDev = process.env.NODE_ENV === "development";
                const wsUrl = isDev
                    ? `ws://localhost:3000`
                    : `${wsProtocol}//81.30.105.33:3000`;

                console.log("[MediaSoup] Connecting to:", wsUrl);
                ws = new WebSocket(wsUrl);
                wsRef.current = ws;

                ws.onopen = async () => {
                    console.log("[MediaSoup] WebSocket connected");
                    setIsConnected(true);

                    // Generate peer ID
                    myPeerIdRef.current = `peer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

                    // Join room
                    ws.send(
                        JSON.stringify({
                            type: "join",
                            roomId: conferenceId,
                            peerId: myPeerIdRef.current,
                            peerName: userName,
                        }),
                    );
                };

                ws.onmessage = async (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        console.log("[MediaSoup] Received:", data.type);

                        await handleMessage(data, ws);
                    } catch (error) {
                        console.error(
                            "[MediaSoup] Error handling message:",
                            error,
                        );
                    }
                };

                ws.onerror = (error) => {
                    console.error("[MediaSoup] WebSocket error:", error);
                    setIsConnected(false);
                };

                ws.onclose = () => {
                    console.log("[MediaSoup] WebSocket closed");
                    setIsConnected(false);
                };
            } catch (error) {
                console.error("[MediaSoup] Connection error:", error);
            }
        };

        const handleMessage = async (data, ws) => {
            switch (data.type) {
                case "joined":
                    await handleJoined(data, ws);
                    break;

                case "webRtcTransportCreated":
                    await handleTransportCreated(data);
                    break;

                case "produced":
                    console.log(
                        "[MediaSoup] Producer created:",
                        data.producerId,
                    );
                    break;

                case "newProducer":
                    await handleNewProducer(data, ws);
                    break;

                case "consumed":
                    await handleConsumed(data);
                    break;

                case "peerJoined":
                    handlePeerJoined(data);
                    break;

                case "peerLeft":
                    handlePeerLeft(data);
                    break;

                case "peerStateUpdate":
                    handlePeerStateUpdate(data);
                    break;

                case "consumerClosed":
                    handleConsumerClosed(data);
                    break;

                case "error":
                    console.error("[MediaSoup] Server error:", data.error);
                    break;

                default:
                    console.warn(
                        "[MediaSoup] Unknown message type:",
                        data.type,
                    );
            }
        };

        const handleJoined = async (data, ws) => {
            console.log("[MediaSoup] Joined room, creating device...");

            // Create mediasoup device
            const device = new mediasoupClient.Device();
            await device.load({ routerRtpCapabilities: data.rtpCapabilities });
            deviceRef.current = device;
            console.log("[MediaSoup] Device created");

            // Get local media
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                },
            });

            localStreamRef.current = stream;
            setLocalStream(stream);

            // Set initial track states - audio muted, video off by default
            stream.getAudioTracks().forEach((track) => (track.enabled = false));
            stream.getVideoTracks().forEach((track) => (track.enabled = false));

            console.log("[MediaSoup] Local stream obtained", {
                audioTracks: stream.getAudioTracks().length,
                videoTracks: stream.getVideoTracks().length,
            });

            // Create send transport
            ws.send(
                JSON.stringify({
                    type: "createWebRtcTransport",
                    direction: "send",
                    appData: { producing: true },
                }),
            );

            // Create recv transport
            ws.send(
                JSON.stringify({
                    type: "createWebRtcTransport",
                    direction: "recv",
                    appData: { consuming: true },
                }),
            );

            // Add existing peers
            if (data.peers && data.peers.length > 0) {
                console.log(
                    "[MediaSoup] Adding existing peers:",
                    data.peers.length,
                );
                setParticipants(
                    data.peers.map((p) => ({
                        id: p.id,
                        name: p.name,
                        stream: null,
                        isMuted: p.muted,
                        isVideoOn: p.videoOn,
                        isScreenSharing: p.screenSharing,
                    })),
                );

                // Store pending consumers to consume after recv transport is ready
                for (const peer of data.peers) {
                    if (peer.producers && peer.producers.length > 0) {
                        for (const producer of peer.producers) {
                            pendingConsumersRef.current.push({
                                producerPeerId: peer.id,
                                producerId: producer.id,
                                kind: producer.kind,
                            });
                            console.log(
                                `[MediaSoup] Queued producer ${producer.id} (${producer.kind}) from peer ${peer.id} for consumption`,
                            );
                        }
                    }
                }
            }
        };

        const handleTransportCreated = async (data) => {
            const { direction, transportParams } = data;
            console.log(`[MediaSoup] Transport created: ${direction}`);

            if (direction === "send") {
                const transport =
                    deviceRef.current.createSendTransport(transportParams);
                sendTransportRef.current = transport;

                transport.on(
                    "connect",
                    async ({ dtlsParameters }, callback, errback) => {
                        try {
                            console.log(
                                "[MediaSoup] Send transport connecting...",
                            );
                            wsRef.current.send(
                                JSON.stringify({
                                    type: "connectWebRtcTransport",
                                    transportId: transport.id,
                                    dtlsParameters,
                                }),
                            );
                            callback();
                        } catch (error) {
                            errback(error);
                        }
                    },
                );

                transport.on(
                    "produce",
                    async (
                        { kind, rtpParameters, appData },
                        callback,
                        errback,
                    ) => {
                        try {
                            console.log(`[MediaSoup] Producing ${kind}...`);

                            const response = await new Promise((resolve) => {
                                const handler = (event) => {
                                    const msg = JSON.parse(event.data);
                                    if (msg.type === "produced") {
                                        wsRef.current.removeEventListener(
                                            "message",
                                            handler,
                                        );
                                        resolve(msg);
                                    }
                                };
                                wsRef.current.addEventListener(
                                    "message",
                                    handler,
                                );

                                wsRef.current.send(
                                    JSON.stringify({
                                        type: "produce",
                                        transportId: transport.id,
                                        kind,
                                        rtpParameters,
                                        appData,
                                    }),
                                );
                            });

                            callback({ id: response.producerId });
                        } catch (error) {
                            errback(error);
                        }
                    },
                );

                // Produce audio and video
                if (localStreamRef.current) {
                    const audioTrack =
                        localStreamRef.current.getAudioTracks()[0];
                    const videoTrack =
                        localStreamRef.current.getVideoTracks()[0];

                    if (audioTrack) {
                        const audioProducer = await transport.produce({
                            track: audioTrack,
                        });
                        producersRef.current.set("audio", audioProducer);
                        console.log("[MediaSoup] Audio producer created");
                    }

                    if (videoTrack) {
                        const videoProducer = await transport.produce({
                            track: videoTrack,
                        });
                        producersRef.current.set("video", videoProducer);
                        console.log("[MediaSoup] Video producer created");
                    }
                }
            } else if (direction === "recv") {
                const transport =
                    deviceRef.current.createRecvTransport(transportParams);
                recvTransportRef.current = transport;

                transport.on(
                    "connect",
                    async ({ dtlsParameters }, callback, errback) => {
                        try {
                            console.log(
                                "[MediaSoup] Recv transport connecting...",
                            );
                            wsRef.current.send(
                                JSON.stringify({
                                    type: "connectWebRtcTransport",
                                    transportId: transport.id,
                                    dtlsParameters,
                                }),
                            );
                            callback();
                        } catch (error) {
                            errback(error);
                        }
                    },
                );

                // Consume pending producers now that recv transport is ready
                if (pendingConsumersRef.current.length > 0) {
                    console.log(
                        `[MediaSoup] Consuming ${pendingConsumersRef.current.length} pending producers`,
                    );
                    for (const pending of pendingConsumersRef.current) {
                        ws.send(
                            JSON.stringify({
                                type: "consume",
                                producerPeerId: pending.producerPeerId,
                                producerId: pending.producerId,
                                rtpCapabilities:
                                    deviceRef.current.rtpCapabilities,
                            }),
                        );
                    }
                    pendingConsumersRef.current = [];
                }
            }
        };

        const handleNewProducer = async (data, ws) => {
            const { producerId, producerPeerId, kind } = data;
            console.log(
                `[MediaSoup] New producer: ${producerId} (${kind}) from ${producerPeerId}`,
            );

            if (!deviceRef.current || !recvTransportRef.current) {
                console.warn(
                    "[MediaSoup] Device or recv transport not ready, queuing producer",
                );
                // Queue for later consumption
                pendingConsumersRef.current.push({
                    producerPeerId,
                    producerId,
                    kind,
                });
                return;
            }

            // Consume the producer
            ws.send(
                JSON.stringify({
                    type: "consume",
                    producerPeerId,
                    producerId,
                    rtpCapabilities: deviceRef.current.rtpCapabilities,
                }),
            );
        };

        const handleConsumed = async (data) => {
            const { consumerParams, producerPeerId } = data;
            console.log(
                `[MediaSoup] Consuming: ${consumerParams.id} (${consumerParams.kind}) from peer ${producerPeerId}`,
            );

            const consumer =
                await recvTransportRef.current.consume(consumerParams);
            consumersRef.current.set(consumer.id, consumer);

            // Resume consumer
            wsRef.current.send(
                JSON.stringify({
                    type: "resumeConsumer",
                    consumerId: consumer.id,
                }),
            );

            // Add track to participant stream
            const track = consumer.track;
            updateParticipantStream(producerPeerId, track, consumerParams.kind);

            consumer.on("trackended", () => {
                console.log("[MediaSoup] Consumer track ended:", consumer.id);
            });

            consumer.on("transportclose", () => {
                console.log(
                    "[MediaSoup] Consumer transport closed:",
                    consumer.id,
                );
            });
        };

        const updateParticipantStream = (producerPeerId, track, kind) => {
            console.log(
                `[MediaSoup] updateParticipantStream called for peer ${producerPeerId}, track kind: ${kind}`,
            );

            setParticipants((prev) => {
                console.log(
                    `[MediaSoup] Current participants:`,
                    prev.map((p) => ({
                        id: p.id,
                        name: p.name,
                        hasStream: !!p.stream,
                        audioTracks: p.stream?.getAudioTracks().length || 0,
                        videoTracks: p.stream?.getVideoTracks().length || 0,
                    })),
                );

                const updated = [...prev];

                // Find participant by peer ID
                const idx = updated.findIndex((p) => p.id === producerPeerId);

                if (idx === -1) {
                    console.warn(
                        `[MediaSoup] Participant with ID ${producerPeerId} not found!`,
                    );
                    return prev;
                }

                const participant = updated[idx];
                let newStream;

                if (participant.stream) {
                    // Replace track of the same kind if it exists
                    const existingTracks = participant.stream
                        .getTracks()
                        .filter((t) => t.kind !== track.kind);
                    newStream = new MediaStream([...existingTracks, track]);
                } else {
                    newStream = new MediaStream([track]);
                }

                updated[idx] = {
                    ...participant,
                    stream: newStream,
                };

                console.log(
                    `[MediaSoup] ✓ Added ${track.kind} track to ${participant.name}, stream now has ${newStream.getAudioTracks().length} audio, ${newStream.getVideoTracks().length} video tracks`,
                );

                return updated;
            });
        };

        const handlePeerJoined = (data) => {
            const { peerId, peerName, muted, videoOn, screenSharing } = data;
            console.log("[MediaSoup] Peer joined:", peerName);

            setParticipants((prev) => {
                if (prev.find((p) => p.id === peerId)) {
                    return prev;
                }
                return [
                    ...prev,
                    {
                        id: peerId,
                        name: peerName,
                        stream: null,
                        isMuted: muted,
                        isVideoOn: videoOn,
                        isScreenSharing: screenSharing,
                    },
                ];
            });
        };

        const handlePeerLeft = (data) => {
            const { peerId } = data;
            console.log("[MediaSoup] Peer left:", peerId);

            setParticipants((prev) => prev.filter((p) => p.id !== peerId));
        };

        const handlePeerStateUpdate = (data) => {
            const { peerId, muted, videoOn, screenSharing } = data;

            setParticipants((prev) =>
                prev.map((p) => {
                    if (p.id === peerId) {
                        return {
                            ...p,
                            isMuted: muted !== undefined ? muted : p.isMuted,
                            isVideoOn:
                                videoOn !== undefined ? videoOn : p.isVideoOn,
                            isScreenSharing:
                                screenSharing !== undefined
                                    ? screenSharing
                                    : p.isScreenSharing,
                        };
                    }
                    return p;
                }),
            );
        };

        const handleConsumerClosed = (data) => {
            const { consumerId } = data;
            console.log("[MediaSoup] Consumer closed:", consumerId);
            consumersRef.current.delete(consumerId);
        };

        connect();

        return () => {
            console.log("[MediaSoup] Cleaning up...");

            // Close producers
            for (const producer of producersRef.current.values()) {
                producer.close();
            }
            producersRef.current.clear();

            // Close consumers
            for (const consumer of consumersRef.current.values()) {
                consumer.close();
            }
            consumersRef.current.clear();

            // Close transports
            if (sendTransportRef.current) {
                sendTransportRef.current.close();
            }
            if (recvTransportRef.current) {
                recvTransportRef.current.close();
            }

            // Stop local stream
            if (localStreamRef.current) {
                localStreamRef.current
                    .getTracks()
                    .forEach((track) => track.stop());
            }

            // Close WebSocket
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, [conferenceId, jwtToken, userName]);

    const toggleMute = useCallback(() => {
        if (!localStreamRef.current) return;

        const audioTrack = localStreamRef.current.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            setIsMuted(!audioTrack.enabled);

            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(
                    JSON.stringify({
                        type: "stateUpdate",
                        muted: !audioTrack.enabled,
                    }),
                );
            }
        }
    }, []);

    const toggleVideo = useCallback(() => {
        if (!localStreamRef.current) return;

        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            setIsVideoOn(videoTrack.enabled);

            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(
                    JSON.stringify({
                        type: "stateUpdate",
                        videoOn: videoTrack.enabled,
                    }),
                );
            }
        }
    }, []);

    const toggleScreenShare = useCallback(async () => {
        console.log("[MediaSoup] Screen share toggle - not implemented yet");
        // TODO: Implement screen sharing
    }, []);

    const leaveCall = useCallback(() => {
        console.log("[MediaSoup] Leaving call");

        // Close all
        for (const producer of producersRef.current.values()) {
            producer.close();
        }
        for (const consumer of consumersRef.current.values()) {
            consumer.close();
        }
        if (sendTransportRef.current) {
            sendTransportRef.current.close();
        }
        if (recvTransportRef.current) {
            recvTransportRef.current.close();
        }
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach((track) => track.stop());
        }
        if (wsRef.current) {
            wsRef.current.close();
        }

        setIsConnected(false);
    }, []);

    const sendMessage = useCallback((message) => {
        console.log("[MediaSoup] Sending message:", message);
        // TODO: Implement chat
    }, []);

    return {
        participants,
        localStream,
        isMuted,
        isVideoOn,
        isScreenSharing,
        isConnected,
        messages,
        toggleMute,
        toggleVideo,
        toggleScreenShare,
        leaveCall,
        sendMessage,
    };
};
