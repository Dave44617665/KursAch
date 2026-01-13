import React from "react";
import { Mic, MicOff, User, Monitor, VideoOff } from "lucide-react";

const ParticipantTile = ({
    participant,
    size = "normal",
    showScreenShare = false,
}) => {
    const isSmall = size === "small";
    const videoRef = React.useRef(null);
    const screenRef = React.useRef(null);
    const audioRef = React.useRef(null);

    // Attach stream to video element
    React.useEffect(() => {
        if (videoRef.current && participant.stream && !showScreenShare) {
            console.log(
                `[VideoGrid] Setting stream for participant ${participant.name} (${participant.id})`,
                {
                    stream: participant.stream,
                    audioTracks: participant.stream.getAudioTracks().length,
                    videoTracks: participant.stream.getVideoTracks().length,
                    videoTrackEnabled:
                        participant.stream.getVideoTracks()[0]?.enabled,
                },
            );
            videoRef.current.srcObject = participant.stream;

            // Debug handlers
            videoRef.current.onloadedmetadata = () => {
                console.log(
                    `[VideoGrid] ✓ Video metadata loaded for ${participant.name}`,
                );
                videoRef.current
                    .play()
                    .catch((e) =>
                        console.error(`[VideoGrid] Failed to play video: `, e),
                    );
            };

            videoRef.current.onplay = () => {
                console.log(
                    `[VideoGrid] ✓ Video started playing for ${participant.name}`,
                );
            };

            videoRef.current.onerror = (e) => {
                console.error(
                    `[VideoGrid] ✗ Video error for ${participant.name}:`,
                    e,
                );
            };
        }

        return () => {
            if (videoRef.current) {
                videoRef.current.srcObject = null;
            }
        };
    }, [participant.stream, participant.name, participant.id, showScreenShare]);

    // Attach screen stream to screen video element
    React.useEffect(() => {
        if (screenRef.current && participant.screenStream) {
            console.log(
                `[VideoGrid] Setting screen stream for participant ${participant.name}`,
            );
            screenRef.current.srcObject = participant.screenStream;

            screenRef.current.onloadedmetadata = () => {
                console.log(
                    `[VideoGrid] ✓ Screen metadata loaded for ${participant.name}`,
                );
                screenRef.current
                    .play()
                    .catch((e) =>
                        console.error(`[VideoGrid] Failed to play screen:`, e),
                    );
            };

            screenRef.current.onplay = () => {
                console.log(
                    `[VideoGrid] ✓ Screen started playing for ${participant.name}`,
                );
            };
        }

        return () => {
            if (screenRef.current) {
                screenRef.current.srcObject = null;
            }
        };
    }, [participant.screenStream, participant.name, participant.id]);

    // Attach audio stream to audio element (only for remote participants)
    React.useEffect(() => {
        if (!participant.isOwn && audioRef.current && participant.stream) {
            const audioTracks = participant.stream.getAudioTracks();
            if (audioTracks.length > 0) {
                console.log(
                    `[VideoGrid] Setting audio stream for participant ${participant.name}`,
                    {
                        audioTracks: audioTracks.length,
                        enabled: audioTracks[0].enabled,
                    },
                );

                // Create audio-only stream
                const audioStream = new MediaStream(audioTracks);
                audioRef.current.srcObject = audioStream;

                audioRef.current.onloadedmetadata = () => {
                    console.log(
                        `[VideoGrid] ✓ Audio metadata loaded for ${participant.name}`,
                    );
                    audioRef.current
                        .play()
                        .catch((e) =>
                            console.error(
                                `[VideoGrid] Failed to play audio: `,
                                e,
                            ),
                        );
                };

                audioRef.current.onplay = () => {
                    console.log(
                        `[VideoGrid] ✓ Audio started playing for ${participant.name}`,
                    );
                };

                audioRef.current.onerror = (e) => {
                    console.error(
                        `[VideoGrid] ✗ Audio error for ${participant.name}:`,
                        e,
                    );
                };
            }
        }

        return () => {
            if (audioRef.current) {
                audioRef.current.srcObject = null;
            }
        };
    }, [participant.stream, participant.name, participant.isOwn]);

    // Determine which stream to show for video
    const streamToShow =
        showScreenShare && participant.screenStream
            ? participant.screenStream
            : participant.stream;

    // Check if video should be shown
    const shouldShowVideo =
        showScreenShare && participant.screenStream
            ? true // Always show screen share
            : participant.isOwn
              ? participant.isVideoOn && streamToShow
              : streamToShow &&
                streamToShow.getVideoTracks().length > 0 &&
                streamToShow.getVideoTracks()[0].enabled &&
                streamToShow.getVideoTracks()[0].readyState === "live";

    // Determine muted state
    const isMuted = participant.isOwn
        ? participant.isMuted
        : participant.isMuted !== undefined
          ? participant.isMuted
          : true;

    return (
        <div
            className={`
        relative bg-gray-900 rounded-lg overflow-hidden aspect-video flex items-center justify-center
        ${participant.isSpeaking ? "ring-4 ring-blue-500 ring-offset-4 ring-offset-gray-900" : ""}
        animate-appear
      `}
        >
            {/* Audio element (hidden, only for remote participants) */}
            {!participant.isOwn && (
                <audio ref={audioRef} autoPlay playsInline className="hidden" />
            )}

            {/* Video element */}
            {shouldShowVideo ? (
                <video
                    ref={
                        showScreenShare && participant.screenStream
                            ? screenRef
                            : videoRef
                    }
                    autoPlay
                    playsInline
                    muted={participant.isOwn || false}
                    className="absolute inset-0 w-full h-full object-cover"
                />
            ) : (
                <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
                    <div className="text-center">
                        <div
                            className={`${isSmall ? "w-20 max-w-20" : "w-32 max-w-32"} aspect-square bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-3`}
                        >
                            {participant.isOwn && !participant.isVideoOn ? (
                                <VideoOff
                                    className={`${isSmall ? "w-10" : "w-16"} text-gray-400`}
                                />
                            ) : (
                                <User
                                    className={`${isSmall ? "w-10" : "w-16"} text-gray-400`}
                                />
                            )}
                        </div>
                        <p
                            className={`${isSmall ? "text-xs" : "text-base"} text-white font-medium`}
                        >
                            {participant.name}
                        </p>
                        {participant.isOwn && !participant.isVideoOn && (
                            <p className="text-xs text-gray-400 mt-1">
                                Camera is off
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* Name badge */}
            <div className="absolute bottom-3 left-3 bg-black bg-opacity-60 px-3 py-1 rounded-lg flex items-center gap-2">
                <span
                    className={`${isSmall ? "text-xs" : "text-sm"} text-white font-medium`}
                >
                    {participant.name}
                </span>
                {isMuted ? (
                    <MicOff
                        className={`${isSmall ? "w-3 h-3" : "w-4 h-4"} text-red-400`}
                    />
                ) : (
                    <Mic
                        className={`${isSmall ? "w-3 h-3" : "w-4 h-4"} text-green-400`}
                    />
                )}
            </div>

            {/* Video off indicator for remote participants */}
            {!participant.isOwn && !shouldShowVideo && !showScreenShare && (
                <div className="absolute top-3 right-3 bg-gray-700 px-2 py-1 rounded text-xs text-gray-300 flex items-center gap-1">
                    <VideoOff className="w-3 h-3" />
                    Camera off
                </div>
            )}

            {/* Screen sharing indicator */}
            {showScreenShare && participant.screenStream && (
                <div className="absolute top-3 right-3 bg-indigo-600 px-3 py-1.5 rounded text-sm text-white font-medium flex items-center gap-1">
                    <Monitor className="w-4 h-4" />
                    Screen
                </div>
            )}
        </div>
    );
};

const VideoGrid = ({
    participants,
    localStream,
    localScreenStream,
    isScreenSharing,
    isMuted,
    isVideoOn,
}) => {
    // Build complete participants list including local user
    const allParticipants = React.useMemo(() => {
        console.log("[VideoGrid] Building participants list:", {
            participantsCount: participants.length,
            hasLocalStream: !!localStream,
            hasLocalScreenStream: !!localScreenStream,
            isVideoOn,
            isMuted,
            isScreenSharing,
            participants: participants.map((p) => ({
                id: p.id,
                name: p.name,
                hasStream: !!p.stream,
                hasScreenStream: !!p.screenStream,
                videoTracks: p.stream?.getVideoTracks().length || 0,
                audioTracks: p.stream?.getAudioTracks().length || 0,
                isVideoOn: p.isVideoOn,
                isMuted: p.isMuted,
                isScreenSharing: p.isScreenSharing,
            })),
        });

        // Always add local participant if we have a local stream
        if (localStream) {
            const remoteParticipants = participants.map((p) => ({
                ...p,
                isOwn: false,
                // Use state from hook for remote participants
                isMuted: p.isMuted !== undefined ? p.isMuted : true,
                isVideoOn: p.isVideoOn !== undefined ? p.isVideoOn : false,
                isScreenSharing:
                    p.isScreenSharing !== undefined ? p.isScreenSharing : false,
            }));

            return [
                {
                    id: "local",
                    name: "You",
                    stream: localStream,
                    screenStream: localScreenStream,
                    isMuted: isMuted,
                    isVideoOn: isVideoOn,
                    isScreenSharing: isScreenSharing,
                    isOwn: true,
                },
                ...remoteParticipants,
            ];
        }

        // If no local stream, just show remote participants
        return participants.map((p) => ({
            ...p,
            isOwn: false,
            isMuted: p.isMuted !== undefined ? p.isMuted : true,
            isVideoOn: p.isVideoOn !== undefined ? p.isVideoOn : false,
            isScreenSharing:
                p.isScreenSharing !== undefined ? p.isScreenSharing : false,
        }));
    }, [
        participants,
        localStream,
        localScreenStream,
        isScreenSharing,
        isMuted,
        isVideoOn,
    ]);

    // Find participant who is sharing screen
    const presenting = allParticipants.find(
        (p) => p.isScreenSharing && p.screenStream,
    );
    const others = allParticipants.filter((p) => p.id !== presenting?.id);

    // Presentation mode - show ONLY screen at top, all webcams (including presenter) at bottom
    if (presenting) {
        console.log("[VideoGrid] Presentation mode active:", {
            presenter: presenting.name,
            hasScreenStream: !!presenting.screenStream,
            othersCount: others.length,
        });

        return (
            <div className="flex flex-col h-full">
                {/* Large tile with ONLY presenter's screen */}
                <div className="flex-1 p-6 min-h-0">
                    <div className="h-full max-w-6xl mx-auto">
                        <ParticipantTile
                            participant={presenting}
                            size="normal"
                            showScreenShare={true}
                        />
                    </div>
                </div>

                {/* Bottom bar with all webcams */}
                <div className="h-48 bg-gray-950 border-t-2 border-gray-700 overflow-x-auto">
                    <div className="flex gap-4 p-4 min-w-max items-center h-full">
                        {/* Show ALL participants including presenter (webcam only) */}
                        {allParticipants.map((participant) => (
                            <div
                                key={participant.id}
                                className="flex-shrink-0 w-64 h-full"
                            >
                                <ParticipantTile
                                    participant={{
                                        ...participant,
                                        screenStream: null,
                                        isScreenSharing: false,
                                    }}
                                    size="small"
                                    showScreenShare={false}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // Normal mode - all tiles equal size in grid
    const getGridClass = () => {
        const count = allParticipants.length;
        if (count === 1)
            return "grid-cols-1 grid-rows-1 max-w-4xl mx-auto p-12";
        if (count === 2) return "grid-cols-2 grid-rows-1 max-w-6xl mx-auto p-8";
        if (count <= 4) return "grid-cols-2 grid-rows-2 max-w-6xl mx-auto p-6";
        if (count <= 6) return "grid-cols-3 grid-rows-2 max-w-7xl mx-auto p-6";
        if (count <= 9) return "grid-cols-3 grid-rows-3 max-w-7xl mx-auto p-4";
        return "grid-cols-4 auto-rows-fr p-4";
    };

    return (
        <div className={`grid ${getGridClass()} gap-6 h-full overflow-y-auto`}>
            {allParticipants.map((participant) => (
                <ParticipantTile
                    key={participant.id}
                    participant={participant}
                    size="normal"
                    showScreenShare={false}
                />
            ))}
        </div>
    );
};

export default VideoGrid;
