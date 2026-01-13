const mediasoup = require("mediasoup");
const express = require("express");
const WebSocket = require("ws");
const http = require("http");
const { v4: uuidv4 } = require("uuid");
const config = require("./config");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let workers = [];
let nextWorkerIdx = 0;
const rooms = new Map();

// Initialize mediasoup workers
async function initializeWorkers() {
    console.log("[MediaSoup] Creating workers...");
    for (let i = 0; i < config.mediasoup.numWorkers; i++) {
        const worker = await mediasoup.createWorker({
            logLevel: config.mediasoup.worker.logLevel,
            logTags: config.mediasoup.worker.logTags,
            rtcMinPort: config.mediasoup.worker.rtcMinPort,
            rtcMaxPort: config.mediasoup.worker.rtcMaxPort,
        });

        worker.on("died", () => {
            console.error("[MediaSoup] Worker died, exiting in 2 seconds...");
            setTimeout(() => process.exit(1), 2000);
        });

        workers.push(worker);
        console.log(
            `[MediaSoup] Worker ${i + 1}/${config.mediasoup.numWorkers} created`,
        );
    }
}

// Get next worker (round-robin)
function getWorker() {
    const worker = workers[nextWorkerIdx];
    nextWorkerIdx = (nextWorkerIdx + 1) % workers.length;
    return worker;
}

// Room class
class Room {
    constructor(roomId) {
        this.id = roomId;
        this.router = null;
        this.peers = new Map();
    }

    async initialize() {
        const worker = getWorker();
        this.router = await worker.createRouter({
            mediaCodecs: config.mediasoup.router.mediaCodecs,
        });
        console.log(`[Room ${this.id}] Router created`);
    }

    addPeer(peer) {
        this.peers.set(peer.id, peer);
        console.log(
            `[Room ${this.id}] Peer ${peer.id} (${peer.name}) added. Total peers: ${this.peers.size}`,
        );
    }

    removePeer(peerId) {
        const peer = this.peers.get(peerId);
        if (peer) {
            peer.close();
            this.peers.delete(peerId);
            console.log(
                `[Room ${this.id}] Peer ${peerId} removed. Total peers: ${this.peers.size}`,
            );
        }
    }

    broadcast(fromPeerId, message) {
        for (const [peerId, peer] of this.peers) {
            if (
                peerId !== fromPeerId &&
                peer.ws.readyState === WebSocket.OPEN
            ) {
                peer.ws.send(JSON.stringify(message));
            }
        }
    }

    broadcastToAll(message) {
        for (const [peerId, peer] of this.peers) {
            if (peer.ws.readyState === WebSocket.OPEN) {
                peer.ws.send(JSON.stringify(message));
            }
        }
    }

    close() {
        console.log(`[Room ${this.id}] Closing room`);
        for (const peer of this.peers.values()) {
            peer.close();
        }
        this.peers.clear();
        if (this.router) {
            this.router.close();
        }
    }
}

// Peer class
class Peer {
    constructor(id, name, ws, room) {
        this.id = id;
        this.name = name;
        this.ws = ws;
        this.room = room;
        this.transports = new Map();
        this.producers = new Map();
        this.consumers = new Map();
        this.muted = true;
        this.videoOn = false;
        this.screenSharing = false;
    }

    async createWebRtcTransport(direction) {
        const transport = await this.room.router.createWebRtcTransport({
            listenIps: config.mediasoup.webRtcTransport.listenIps,
            enableUdp: config.mediasoup.webRtcTransport.enableUdp,
            enableTcp: config.mediasoup.webRtcTransport.enableTcp,
            preferUdp: config.mediasoup.webRtcTransport.preferUdp,
            initialAvailableOutgoingBitrate:
                config.mediasoup.webRtcTransport
                    .initialAvailableOutgoingBitrate,
        });

        if (config.mediasoup.webRtcTransport.maxIncomingBitrate) {
            await transport.setMaxIncomingBitrate(
                config.mediasoup.webRtcTransport.maxIncomingBitrate,
            );
        }

        transport.on("dtlsstatechange", (dtlsState) => {
            if (dtlsState === "closed") {
                console.log(`[Peer ${this.id}] Transport closed`);
                transport.close();
            }
        });

        this.transports.set(transport.id, transport);
        console.log(
            `[Peer ${this.id}] Created ${direction} transport: ${transport.id}`,
        );

        return {
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
        };
    }

    async connectTransport(transportId, dtlsParameters) {
        const transport = this.transports.get(transportId);
        if (!transport) {
            throw new Error(`Transport ${transportId} not found`);
        }
        await transport.connect({ dtlsParameters });
        console.log(`[Peer ${this.id}] Transport ${transportId} connected`);
    }

    async produce(transportId, kind, rtpParameters, appData) {
        const transport = this.transports.get(transportId);
        if (!transport) {
            throw new Error(`Transport ${transportId} not found`);
        }

        const producer = await transport.produce({
            kind,
            rtpParameters,
            appData,
        });

        this.producers.set(producer.id, producer);
        console.log(
            `[Peer ${this.id}] Created producer: ${producer.id} (${kind})`,
        );

        producer.on("transportclose", () => {
            console.log(
                `[Peer ${this.id}] Producer transport closed: ${producer.id}`,
            );
            this.producers.delete(producer.id);
        });

        // Notify other peers about new producer
        this.room.broadcast(this.id, {
            type: "newProducer",
            producerId: producer.id,
            producerPeerId: this.id,
            producerName: this.name,
            kind: producer.kind,
        });

        return producer.id;
    }

    async consume(producerPeerId, producerId, rtpCapabilities) {
        const producerPeer = this.room.peers.get(producerPeerId);
        if (!producerPeer) {
            throw new Error(`Producer peer ${producerPeerId} not found`);
        }

        const producer = producerPeer.producers.get(producerId);
        if (!producer) {
            throw new Error(`Producer ${producerId} not found`);
        }

        if (
            !this.room.router.canConsume({
                producerId: producer.id,
                rtpCapabilities,
            })
        ) {
            throw new Error("Cannot consume");
        }

        // Get recv transport
        let recvTransport = null;
        for (const transport of this.transports.values()) {
            if (transport.appData.consuming) {
                recvTransport = transport;
                break;
            }
        }

        if (!recvTransport) {
            throw new Error("No recv transport available");
        }

        const consumer = await recvTransport.consume({
            producerId: producer.id,
            rtpCapabilities,
            paused: false,
        });

        this.consumers.set(consumer.id, consumer);
        console.log(
            `[Peer ${this.id}] Created consumer: ${consumer.id} for producer: ${producerId}`,
        );

        consumer.on("transportclose", () => {
            console.log(
                `[Peer ${this.id}] Consumer transport closed: ${consumer.id}`,
            );
            this.consumers.delete(consumer.id);
        });

        consumer.on("producerclose", () => {
            console.log(
                `[Peer ${this.id}] Consumer producer closed: ${consumer.id}`,
            );
            this.consumers.delete(consumer.id);
            this.ws.send(
                JSON.stringify({
                    type: "consumerClosed",
                    consumerId: consumer.id,
                }),
            );
        });

        return {
            id: consumer.id,
            producerId: producer.id,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
            type: consumer.type,
            producerPaused: consumer.producerPaused,
        };
    }

    close() {
        console.log(`[Peer ${this.id}] Closing peer`);

        for (const consumer of this.consumers.values()) {
            consumer.close();
        }
        this.consumers.clear();

        for (const producer of this.producers.values()) {
            producer.close();
        }
        this.producers.clear();

        for (const transport of this.transports.values()) {
            transport.close();
        }
        this.transports.clear();

        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.close();
        }
    }
}

// WebSocket connection handler
wss.on("connection", (ws) => {
    console.log("[WebSocket] New connection");

    let peer = null;
    let room = null;

    ws.on("message", async (message) => {
        try {
            const data = JSON.parse(message.toString());
            console.log(`[WebSocket] Received: ${data.type}`);

            switch (data.type) {
                case "join":
                    {
                        const { roomId, peerId, peerName } = data;

                        // Get or create room
                        if (!rooms.has(roomId)) {
                            room = new Room(roomId);
                            await room.initialize();
                            rooms.set(roomId, room);
                        } else {
                            room = rooms.get(roomId);
                        }

                        // Create peer
                        peer = new Peer(peerId, peerName, ws, room);
                        room.addPeer(peer);

                        // Get router RTP capabilities
                        const rtpCapabilities = room.router.rtpCapabilities;

                        // Get other peers info
                        const peers = [];
                        for (const [id, p] of room.peers) {
                            if (id !== peerId) {
                                const producers = [];
                                for (const [
                                    producerId,
                                    producer,
                                ] of p.producers) {
                                    producers.push({
                                        id: producerId,
                                        kind: producer.kind,
                                    });
                                }
                                peers.push({
                                    id: p.id,
                                    name: p.name,
                                    muted: p.muted,
                                    videoOn: p.videoOn,
                                    screenSharing: p.screenSharing,
                                    producers,
                                });
                            }
                        }

                        ws.send(
                            JSON.stringify({
                                type: "joined",
                                peerId,
                                rtpCapabilities,
                                peers,
                            }),
                        );

                        // Notify others
                        room.broadcast(peerId, {
                            type: "peerJoined",
                            peerId,
                            peerName,
                            muted: peer.muted,
                            videoOn: peer.videoOn,
                            screenSharing: peer.screenSharing,
                        });
                    }
                    break;

                case "getRouterRtpCapabilities":
                    {
                        ws.send(
                            JSON.stringify({
                                type: "routerRtpCapabilities",
                                rtpCapabilities: room.router.rtpCapabilities,
                            }),
                        );
                    }
                    break;

                case "createWebRtcTransport":
                    {
                        const { direction, appData } = data;
                        const transportParams =
                            await peer.createWebRtcTransport(direction);

                        // Store appData
                        const transport = peer.transports.get(
                            transportParams.id,
                        );
                        transport.appData = appData || {};

                        ws.send(
                            JSON.stringify({
                                type: "webRtcTransportCreated",
                                direction,
                                transportParams,
                            }),
                        );
                    }
                    break;

                case "connectWebRtcTransport":
                    {
                        const { transportId, dtlsParameters } = data;
                        await peer.connectTransport(
                            transportId,
                            dtlsParameters,
                        );
                        ws.send(
                            JSON.stringify({
                                type: "webRtcTransportConnected",
                                transportId,
                            }),
                        );
                    }
                    break;

                case "produce":
                    {
                        const { transportId, kind, rtpParameters, appData } =
                            data;
                        const producerId = await peer.produce(
                            transportId,
                            kind,
                            rtpParameters,
                            appData,
                        );
                        ws.send(
                            JSON.stringify({
                                type: "produced",
                                producerId,
                            }),
                        );
                    }
                    break;

                case "consume":
                    {
                        const { producerPeerId, producerId, rtpCapabilities } =
                            data;
                        const consumerParams = await peer.consume(
                            producerPeerId,
                            producerId,
                            rtpCapabilities,
                        );
                        ws.send(
                            JSON.stringify({
                                type: "consumed",
                                consumerParams,
                                producerPeerId,
                            }),
                        );
                    }
                    break;

                case "resumeConsumer":
                    {
                        const { consumerId } = data;
                        const consumer = peer.consumers.get(consumerId);
                        if (consumer) {
                            await consumer.resume();
                            console.log(
                                `[Peer ${peer.id}] Consumer ${consumerId} resumed`,
                            );
                        }
                    }
                    break;

                case "stateUpdate":
                    {
                        const { muted, videoOn, screenSharing } = data;
                        if (peer) {
                            peer.muted =
                                muted !== undefined ? muted : peer.muted;
                            peer.videoOn =
                                videoOn !== undefined ? videoOn : peer.videoOn;
                            peer.screenSharing =
                                screenSharing !== undefined
                                    ? screenSharing
                                    : peer.screenSharing;

                            room.broadcast(peer.id, {
                                type: "peerStateUpdate",
                                peerId: peer.id,
                                muted: peer.muted,
                                videoOn: peer.videoOn,
                                screenSharing: peer.screenSharing,
                            });
                        }
                    }
                    break;

                default:
                    console.warn(
                        `[WebSocket] Unknown message type: ${data.type}`,
                    );
            }
        } catch (error) {
            console.error("[WebSocket] Error handling message:", error);
            ws.send(
                JSON.stringify({
                    type: "error",
                    error: error.message,
                }),
            );
        }
    });

    ws.on("close", () => {
        console.log("[WebSocket] Connection closed");
        if (peer && room) {
            room.removePeer(peer.id);
            room.broadcast(peer.id, {
                type: "peerLeft",
                peerId: peer.id,
            });

            // Clean up empty rooms
            if (room.peers.size === 0) {
                console.log(`[Room ${room.id}] Room is empty, closing`);
                room.close();
                rooms.delete(room.id);
            }
        }
    });

    ws.on("error", (error) => {
        console.error("[WebSocket] Error:", error);
    });
});

// Express routes
app.get("/health", (req, res) => {
    res.json({ status: "ok", rooms: rooms.size, workers: workers.length });
});

app.get("/rooms", (req, res) => {
    const roomsInfo = [];
    for (const [roomId, room] of rooms) {
        roomsInfo.push({
            id: roomId,
            peers: room.peers.size,
        });
    }
    res.json({ rooms: roomsInfo });
});

// Start server
async function start() {
    try {
        await initializeWorkers();

        server.listen(config.httpPort, config.httpIp, () => {
            console.log(
                `[Server] MediaSoup server running on ${config.httpIp}:${config.httpPort}`,
            );
            console.log(`[Server] WebSocket ready for connections`);
        });
    } catch (error) {
        console.error("[Server] Failed to start:", error);
        process.exit(1);
    }
}

start();
