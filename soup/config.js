module.exports = {
    // HTTP server
    httpIp: "0.0.0.0",
    httpPort: 3000,

    // mediasoup settings
    mediasoup: {
        // Worker settings
        numWorkers: 4,
        worker: {
            rtcMinPort: 40000,
            rtcMaxPort: 49999,
            logLevel: "warn",
            logTags: ["info", "ice", "dtls", "rtp", "srtp", "rtcp"],
        },

        // Router settings
        router: {
            mediaCodecs: [
                {
                    kind: "audio",
                    mimeType: "audio/opus",
                    clockRate: 48000,
                    channels: 2,
                },
                {
                    kind: "video",
                    mimeType: "video/VP8",
                    clockRate: 90000,
                    parameters: {
                        "x-google-start-bitrate": 1000,
                    },
                },
                {
                    kind: "video",
                    mimeType: "video/VP9",
                    clockRate: 90000,
                    parameters: {
                        "profile-id": 2,
                        "x-google-start-bitrate": 1000,
                    },
                },
                {
                    kind: "video",
                    mimeType: "video/H264",
                    clockRate: 90000,
                    parameters: {
                        "packetization-mode": 1,
                        "profile-level-id": "42e01f",
                        "level-asymmetry-allowed": 1,
                        "x-google-start-bitrate": 1000,
                    },
                },
            ],
        },

        // WebRTC transport settings
        webRtcTransport: {
            listenIps: [
                {
                    ip: "0.0.0.0",
                    announcedIp: process.env.ANNOUNCED_IP || "81.30.105.33",
                },
            ],
            enableUdp: true,
            enableTcp: false,
            preferUdp: true,
            maxIncomingBitrate: 1500000,
            initialAvailableOutgoingBitrate: 1000000,
        },
    },
};
