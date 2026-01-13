import { useState, useEffect, useRef, useCallback } from "react";
import * as mediasoupClient from "mediasoup-client";

export const useMediasoup = (
    conferenceId,
    jwtToken = localStorage.getItem("access_token"),
    userName = "You",
) => {
    const [participants, setParticipants] = useState([]);
    const [localStream, setLocalStream] = useState(null);
    const [localScreenStream, setLocalScreenStream] = useState(null);
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
    const localScreenStreamRef = useRef(null);
    const myPeerIdRef = useRef(null);
    const participantsStreamsRef = useRef(new Map());
    const pendingConsumersRef = useRef([]);

    useEffect(() => {
        console.log("[MediaSoup] Hook initialized", {
            conferenceId,
            userName,
            hasToken: !!jwtToken,
            token: jwtToken ? `${jwtToken.substring(0, 20)}...` : "NULL",
            location: window.location.href,
            hostname: window.location.hostname,
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
                // Всегда используем production адрес через nginx proxy
                const protocol =
                    window.location.protocol === "https:" ? "wss:" : "ws:";
                const host = window.location.host;
                const wsUrl = `${protocol}//${host}/mediasoup/`;

                console.log("[MediaSoup] Connecting to:", wsUrl);
                console.log("[MediaSoup] Protocol:", protocol);
                console.log("[MediaSoup] Host:", host);

                ws = new WebSocket(wsUrl);
                wsRef.current = ws;

                ws.onopen = async () => {
                    console.log(
                        "[MediaSoup] ✓ WebSocket connected successfully",
                    );
                    setIsConnected(true);

                    // Generate peer ID
                    myPeerIdRef.current = `peer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

                    console.log(
                        "[MediaSoup] Sending join message with peerId:",
                        myPeerIdRef.current,
                    );

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
                        console.log(
                            "[MediaSoup] ← Received message:",
                            data.type,
                            data,
                        );

                        await handleMessage(data, ws);
                    } catch (error) {
                        console.error(
                            "[MediaSoup] Error handling message:",
                            error,
                        );
                    }
                };

                ws.onerror = (error) => {
                    console.error("[MediaSoup] ✗ WebSocket error:", error);
                    console.error("[MediaSoup] WebSocket URL:", ws.url);
                    console.error(
                        "[MediaSoup] WebSocket readyState:",
                        ws.readyState,
                    );
                    setIsConnected(false);
                };

                ws.onclose = (event) => {
                    console.log("[MediaSoup] WebSocket closed", {
                        code: event.code,
                        reason: event.reason,
                        wasClean: event.wasClean,
                    });
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
            console.log("[MediaSoup] Joined room, creating device.. .");
            console.log(
                "[MediaSoup] Router RTP Capabilities:",
                data.rtpCapabilities,
            );

            try {
                // Create mediasoup device
                const device = new mediasoupClient.Device();
                await device.load({
                    routerRtpCapabilities: data.rtpCapabilities,
                });
                deviceRef.current = device;
                console.log("[MediaSoup] ✓ Device created");
                console.log(
                    "[MediaSoup] Device RTP Capabilities:",
                    device.rtpCapabilities,
                );
                console.log(
                    "[MediaSoup] Device SCTP Capabilities:",
                    device.sctpCapabilities,
                );

                // Get local media
                console.log("[MediaSoup] Requesting user media...");
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
                stream.getAudioTracks().forEach((track) => {
                    track.enabled = false;
                    console.log(
                        "[MediaSoup] Audio track:",
                        track.id,
                        "enabled:",
                        track.enabled,
                        "readyState:",
                        track.readyState,
                    );
                });
                stream.getVideoTracks().forEach((track) => {
                    track.enabled = false;
                    console.log(
                        "[MediaSoup] Video track:",
                        track.id,
                        "enabled:",
                        track.enabled,
                        "readyState:",
                        track.readyState,
                    );
                });

                console.log("[MediaSoup] ✓ Local stream obtained", {
                    audioTracks: stream.getAudioTracks().length,
                    videoTracks: stream.getVideoTracks().length,
                });

                // Create send transport
                console.log("[MediaSoup] → Requesting send transport...");
                ws.send(
                    JSON.stringify({
                        type: "createWebRtcTransport",
                        direction: "send",
                        appData: { producing: true },
                    }),
                );

                // Create recv transport
                console.log("[MediaSoup] → Requesting recv transport.. .");
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
                            screenStream: null,
                            isMuted: p.muted !== undefined ? p.muted : true,
                            isVideoOn:
                                p.videoOn !== undefined ? p.videoOn : false,
                            isScreenSharing:
                                p.screenSharing !== undefined
                                    ? p.screenSharing
                                    : false,
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
            } catch (error) {
                console.error("[MediaSoup] Error in handleJoined:", error);
            }
        };

        const handleTransportCreated = async (data) => {
            const { direction, transportParams } = data;
            console.log(`[MediaSoup] ← Transport created:  ${direction}`);
            console.log(`[MediaSoup] Transport params: `, transportParams);

            try {
                if (direction === "send") {
                    const transport =
                        deviceRef.current.createSendTransport(transportParams);
                    sendTransportRef.current = transport;

                    console.log(
                        "[MediaSoup] Send transport created:",
                        transport.id,
                    );

                    transport.on(
                        "connect",
                        async ({ dtlsParameters }, callback, errback) => {
                            try {
                                console.log(
                                    "[MediaSoup] → Send transport connecting...",
                                );
                                wsRef.current.send(
                                    JSON.stringify({
                                        type: "connectWebRtcTransport",
                                        transportId: transport.id,
                                        dtlsParameters,
                                    }),
                                );
                                callback();
                                console.log(
                                    "[MediaSoup] ✓ Send transport connected",
                                );
                            } catch (error) {
                                console.error(
                                    "[MediaSoup] Send transport connect error:",
                                    error,
                                );
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
                                console.log(
                                    `[MediaSoup] → Producing ${kind}...`,
                                );
                                console.log(
                                    `[MediaSoup] RTP Parameters:`,
                                    rtpParameters,
                                );

                                const response = await new Promise(
                                    (resolve, reject) => {
                                        const timeout = setTimeout(() => {
                                            reject(
                                                new Error("Produce timeout"),
                                            );
                                        }, 10000);

                                        const handler = (event) => {
                                            const msg = JSON.parse(event.data);
                                            if (msg.type === "produced") {
                                                clearTimeout(timeout);
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
                                    },
                                );

                                console.log(
                                    `[MediaSoup] ✓ Producer created: ${response.producerId}`,
                                );
                                callback({ id: response.producerId });
                            } catch (error) {
                                console.error(
                                    `[MediaSoup] Produce error: `,
                                    error,
                                );
                                errback(error);
                            }
                        },
                    );

                    transport.on("connectionstatechange", (state) => {
                        console.log(
                            `[MediaSoup] Send transport connection state: ${state}`,
                        );
                    });

                    transport.on("icestatechange", (state) => {
                        console.log(
                            `[MediaSoup] Send transport ICE state: ${state}`,
                        );
                    });

                    // Produce audio and video
                    if (localStreamRef.current) {
                        const audioTrack =
                            localStreamRef.current.getAudioTracks()[0];
                        const videoTrack =
                            localStreamRef.current.getVideoTracks()[0];

                        if (audioTrack) {
                            console.log(
                                "[MediaSoup] Creating audio producer...",
                            );
                            const audioProducer = await transport.produce({
                                track: audioTrack,
                            });
                            producersRef.current.set("audio", audioProducer);
                            console.log(
                                "[MediaSoup] ✓ Audio producer created:",
                                audioProducer.id,
                            );

                            audioProducer.on("trackended", () => {
                                console.log("[MediaSoup] Audio track ended");
                            });

                            audioProducer.on("transportclose", () => {
                                console.log(
                                    "[MediaSoup] Audio producer transport closed",
                                );
                            });
                        }

                        if (videoTrack) {
                            console.log(
                                "[MediaSoup] Creating video producer...",
                            );
                            const videoProducer = await transport.produce({
                                track: videoTrack,
                            });
                            producersRef.current.set("video", videoProducer);
                            console.log(
                                "[MediaSoup] ✓ Video producer created:",
                                videoProducer.id,
                            );

                            videoProducer.on("trackended", () => {
                                console.log("[MediaSoup] Video track ended");
                            });

                            videoProducer.on("transportclose", () => {
                                console.log(
                                    "[MediaSoup] Video producer transport closed",
                                );
                            });
                        }
                    }
                } else if (direction === "recv") {
                    const transport =
                        deviceRef.current.createRecvTransport(transportParams);
                    recvTransportRef.current = transport;

                    console.log(
                        "[MediaSoup] Recv transport created:",
                        transport.id,
                    );

                    transport.on(
                        "connect",
                        async ({ dtlsParameters }, callback, errback) => {
                            try {
                                console.log(
                                    "[MediaSoup] → Recv transport connecting...",
                                );
                                wsRef.current.send(
                                    JSON.stringify({
                                        type: "connectWebRtcTransport",
                                        transportId: transport.id,
                                        dtlsParameters,
                                    }),
                                );
                                callback();
                                console.log(
                                    "[MediaSoup] ✓ Recv transport connected",
                                );
                            } catch (error) {
                                console.error(
                                    "[MediaSoup] Recv transport connect error:",
                                    error,
                                );
                                errback(error);
                            }
                        },
                    );

                    transport.on("connectionstatechange", (state) => {
                        console.log(
                            `[MediaSoup] Recv transport connection state: ${state}`,
                        );
                    });

                    transport.on("icestatechange", (state) => {
                        console.log(
                            `[MediaSoup] Recv transport ICE state: ${state}`,
                        );
                    });

                    // Consume pending producers now that recv transport is ready
                    if (pendingConsumersRef.current.length > 0) {
                        console.log(
                            `[MediaSoup] Consuming ${pendingConsumersRef.current.length} pending producers`,
                        );
                        for (const pending of pendingConsumersRef.current) {
                            console.log(
                                `[MediaSoup] → Requesting consume for producer ${pending.producerId} (${pending.kind})`,
                            );
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
            } catch (error) {
                console.error(
                    `[MediaSoup] Error creating ${direction} transport:`,
                    error,
                );
            }
        };

        const handleNewProducer = async (data, ws) => {
            const { producerId, producerPeerId, kind, producerName } = data;
            console.log(
                `[MediaSoup] ← New producer: ${producerId} (${kind}) from ${producerPeerId} (${producerName})`,
            );

            if (!deviceRef.current || !recvTransportRef.current) {
                console.warn(
                    "[MediaSoup] Device or recv transport not ready, queuing producer",
                );
                pendingConsumersRef.current.push({
                    producerPeerId,
                    producerId,
                    kind,
                });
                return;
            }

            // Consume the producer
            console.log(
                `[MediaSoup] → Requesting consume for producer ${producerId}`,
            );
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
                `[MediaSoup] ← Consumed:  ${consumerParams.id} (${consumerParams.kind}) from peer ${producerPeerId}`,
            );
            console.log("[MediaSoup] Consumer params:", consumerParams);

            try {
                const consumer =
                    await recvTransportRef.current.consume(consumerParams);
                consumersRef.current.set(consumer.id, consumer);

                console.log(`[MediaSoup] ✓ Consumer created: ${consumer.id}`);
                console.log(`[MediaSoup] Consumer track: `, consumer.track);
                console.log(
                    `[MediaSoup] Track readyState:`,
                    consumer.track.readyState,
                );
                console.log(
                    `[MediaSoup] Track enabled:`,
                    consumer.track.enabled,
                );

                // Resume consumer
                console.log(`[MediaSoup] → Resuming consumer ${consumer.id}`);
                wsRef.current.send(
                    JSON.stringify({
                        type: "resumeConsumer",
                        consumerId: consumer.id,
                    }),
                );

                // Add track to participant stream
                const track = consumer.track;
                updateParticipantStream(
                    producerPeerId,
                    track,
                    consumerParams.kind,
                );

                consumer.on("trackended", () => {
                    console.log(
                        "[MediaSoup] Consumer track ended:",
                        consumer.id,
                    );
                });

                consumer.on("transportclose", () => {
                    console.log(
                        "[MediaSoup] Consumer transport closed:",
                        consumer.id,
                    );
                });
            } catch (error) {
                console.error("[MediaSoup] Error in handleConsumed:", error);
            }
        };

        const updateParticipantStream = (producerPeerId, track, kind) => {
            console.log(
                `[MediaSoup] updateParticipantStream called for peer ${producerPeerId}, track kind: ${kind}, track enabled: ${track.enabled}, readyState: ${track.readyState}`,
            );

            setParticipants((prev) => {
                const updated = [...prev];
                const idx = updated.findIndex((p) => p.id === producerPeerId);

                if (idx === -1) {
                    console.warn(
                        `[MediaSoup] Participant with ID ${producerPeerId} not found! `,
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
                    console.log(
                        `[MediaSoup] Updated existing stream for ${participant.name}`,
                    );
                } else {
                    newStream = new MediaStream([track]);
                    console.log(
                        `[MediaSoup] Created new stream for ${participant.name}`,
                    );
                }

                updated[idx] = {
                    ...participant,
                    stream: newStream,
                };

                console.log(
                    `[MediaSoup] ✓ Added ${track.kind} track to ${participant.name}`,
                );
                console.log(
                    `[MediaSoup] Stream tracks: ${newStream.getAudioTracks().length} audio, ${newStream.getVideoTracks().length} video`,
                );

                return updated;
            });
        };

        const handlePeerJoined = (data) => {
            const { peerId, peerName, muted, videoOn, screenSharing } = data;
            console.log("[MediaSoup] ← Peer joined:", peerName, {
                peerId,
                muted,
                videoOn,
                screenSharing,
            });

            setParticipants((prev) => {
                if (prev.find((p) => p.id === peerId)) {
                    console.log(
                        `[MediaSoup] Peer ${peerName} already exists, skipping`,
                    );
                    return prev;
                }
                return [
                    ...prev,
                    {
                        id: peerId,
                        name: peerName,
                        stream: null,
                        screenStream: null,
                        isMuted: muted !== undefined ? muted : true,
                        isVideoOn: videoOn !== undefined ? videoOn : false,
                        isScreenSharing:
                            screenSharing !== undefined ? screenSharing : false,
                    },
                ];
            });
        };

        const handlePeerLeft = (data) => {
            const { peerId } = data;
            console.log("[MediaSoup] ← Peer left:", peerId);

            setParticipants((prev) => prev.filter((p) => p.id !== peerId));
        };

        const handlePeerStateUpdate = (data) => {
            const { peerId, muted, videoOn, screenSharing } = data;
            console.log("[MediaSoup] ← Peer state update:", {
                peerId,
                muted,
                videoOn,
                screenSharing,
            });

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
            console.log("[MediaSoup] ← Consumer closed:", consumerId);
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

            // Stop screen stream
            if (localScreenStreamRef.current) {
                localScreenStreamRef.current
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
            const newMutedState = !audioTrack.enabled;
            setIsMuted(newMutedState);

            console.log("[MediaSoup] Toggled mute:", newMutedState);

            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(
                    JSON.stringify({
                        type: "stateUpdate",
                        muted: newMutedState,
                    }),
                );
            }
        }
    }, []);

    const toggleVideo = useCallback(() => {
        if (!localStreamRef.current) {
            console.error("[MediaSoup] No local stream available");
            return;
        }

        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            const newVideoState = videoTrack.enabled;
            setIsVideoOn(newVideoState);

            console.log("[MediaSoup] Toggled video:", newVideoState);

            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(
                    JSON.stringify({
                        type: "stateUpdate",
                        videoOn: newVideoState,
                    }),
                );
            }
        } else {
            console.error("[MediaSoup] No video track found");
        }
    }, []);

    const toggleScreenShare = useCallback(async () => {
        console.log("[MediaSoup] Screen share toggle called", {
            isScreenSharing,
            hasSendTransport: !!sendTransportRef.current,
        });

        try {
            if (isScreenSharing) {
                // Stop screen sharing
                console.log("[MediaSoup] Stopping screen share");

                // Close screen producer
                const screenProducer = producersRef.current.get("screen");
                if (screenProducer) {
                    screenProducer.close();
                    producersRef.current.delete("screen");
                    console.log("[MediaSoup] Screen producer closed");
                }

                // Stop screen tracks
                if (localScreenStreamRef.current) {
                    localScreenStreamRef.current
                        .getTracks()
                        .forEach((track) => {
                            track.stop();
                            console.log(
                                "[MediaSoup] Stopped screen track:",
                                track.kind,
                            );
                        });
                    localScreenStreamRef.current = null;
                    setLocalScreenStream(null);
                }

                setIsScreenSharing(false);

                // Notify server
                if (
                    wsRef.current &&
                    wsRef.current.readyState === WebSocket.OPEN
                ) {
                    wsRef.current.send(
                        JSON.stringify({
                            type: "stateUpdate",
                            screenSharing: false,
                        }),
                    );
                }
            } else {
                // Start screen sharing
                console.log("[MediaSoup] Starting screen share");

                // Check if send transport exists
                if (!sendTransportRef.current) {
                    throw new Error("Send transport not available");
                }

                // Get screen stream
                const screenStream =
                    await navigator.mediaDevices.getDisplayMedia({
                        video: {
                            width: { ideal: 1920 },
                            height: { ideal: 1080 },
                            frameRate: { ideal: 30 },
                        },
                        audio: false,
                    });

                localScreenStreamRef.current = screenStream;
                setLocalScreenStream(screenStream);

                console.log("[MediaSoup] Screen stream obtained", {
                    videoTracks: screenStream.getVideoTracks().length,
                });

                // Handle stream ended (user stopped sharing via browser UI)
                screenStream.getVideoTracks()[0].onended = () => {
                    console.log("[MediaSoup] Screen share track ended by user");
                    toggleScreenShare(); // Stop screen sharing
                };

                // Produce screen video using existing send transport
                const screenTrack = screenStream.getVideoTracks()[0];
                if (screenTrack && sendTransportRef.current) {
                    const screenProducer =
                        await sendTransportRef.current.produce({
                            track: screenTrack,
                            appData: { screen: true },
                        });
                    producersRef.current.set("screen", screenProducer);
                    console.log("[MediaSoup] Screen producer created");
                }

                setIsScreenSharing(true);

                // Notify server
                if (
                    wsRef.current &&
                    wsRef.current.readyState === WebSocket.OPEN
                ) {
                    wsRef.current.send(
                        JSON.stringify({
                            type: "stateUpdate",
                            screenSharing: true,
                        }),
                    );
                }
            }
        } catch (error) {
            console.error("[MediaSoup] Screen share error:", error);

            // Clean up on error
            if (localScreenStreamRef.current) {
                localScreenStreamRef.current
                    .getTracks()
                    .forEach((track) => track.stop());
                localScreenStreamRef.current = null;
                setLocalScreenStream(null);
            }

            setIsScreenSharing(false);

            // Show user-friendly error message
            if (error.name === "NotAllowedError") {
                alert("Screen sharing permission denied");
            } else if (error.name === "NotFoundError") {
                alert("No screen available to share");
            } else {
                alert("Failed to start screen sharing: " + error.message);
            }
        }
    }, [isScreenSharing]);

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
        if (localScreenStreamRef.current) {
            localScreenStreamRef.current
                .getTracks()
                .forEach((track) => track.stop());
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
        sendMessage,
    };
};
