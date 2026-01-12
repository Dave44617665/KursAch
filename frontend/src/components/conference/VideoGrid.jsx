import React from "react";
import { Mic, MicOff, User, Monitor } from "lucide-react";

const ParticipantTile = ({
    participant,
    size = "normal",
    showScreenShare = false,
}) => {
    const isSmall = size === "small";
    const videoRef = React.useRef(null);
    const screenRef = React.useRef(null);

    React.useEffect(() => {
        if (videoRef.current && participant.stream) {
            console.log(
                `[VideoGrid] Setting stream for participant ${participant.name} (${participant.id})`,
                participant.stream,
                "Audio tracks:",
                participant.stream.getAudioTracks().length,
                "Video tracks:",
                participant.stream.getVideoTracks().length,
            );
            videoRef.current.srcObject = participant.stream;

            // Добавляем обработчик для отладки воспроизведения
            videoRef.current.onloadedmetadata = () => {
                console.log(
                    `[VideoGrid] ✓ Video metadata loaded for ${participant.name}`,
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
    }, [participant.stream, participant.name, participant.id]);

    React.useEffect(() => {
        if (screenRef.current && participant.screenStream) {
            console.log(
                `[VideoGrid] Setting screen stream for participant ${participant.name} (${participant.id})`,
                participant.screenStream,
            );
            screenRef.current.srcObject = participant.screenStream;

            // Добавляем обработчик для отладки воспроизведения экрана
            screenRef.current.onloadedmetadata = () => {
                console.log(
                    `[VideoGrid] ✓ Screen metadata loaded for ${participant.name}`,
                );
            };
            screenRef.current.onplay = () => {
                console.log(
                    `[VideoGrid] ✓ Screen started playing for ${participant.name}`,
                );
            };
        }
    }, [participant.screenStream, participant.name, participant.id]);

    const streamToShow =
        showScreenShare && participant.screenStream
            ? participant.screenStream
            : participant.stream;

    // Проверяем наличие видео треков в потоке
    const hasVideoTracks =
        streamToShow && streamToShow.getVideoTracks().length > 0;
    const hasActiveTracks =
        streamToShow &&
        streamToShow.getTracks().some((t) => t.readyState === "live");

    const isVideoAvailable =
        showScreenShare && participant.screenStream
            ? hasVideoTracks && hasActiveTracks
            : participant.stream &&
              participant.isVideoOn &&
              hasVideoTracks &&
              hasActiveTracks;

    return (
        <div
            className={`
        relative bg-gray-900 rounded-lg overflow-hidden aspect-video flex items-center justify-center
        ${participant.isSpeaking ? "ring-4 ring-blue-500 ring-offset-4 ring-offset-gray-900" : ""}
        animate-appear
      `}
        >
            {/* Video element */}
            {isVideoAvailable ? (
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
                    onCanPlay={() =>
                        console.log(
                            `[VideoGrid] Video can play for ${participant.name}`,
                        )
                    }
                />
            ) : participant.isVideoOn ? (
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                    <div
                        className={`${isSmall ? "w-1/3 max-w-24" : "w-1/3 max-w-64"} aspect-square bg-white bg-opacity-20 rounded-full flex items-center justify-center`}
                    >
                        <User
                            className={`${isSmall ? "w-1/2" : "w-1/2"} text-white`}
                        />
                    </div>
                </div>
            ) : (
                <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
                    <div className="text-center">
                        <div
                            className={`${isSmall ? "w-20 max-w-20" : "w-32 max-w-32"} aspect-square bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-3`}
                        >
                            <User
                                className={`${isSmall ? "w-10" : "w-16"} text-gray-400`}
                            />
                        </div>
                        <p
                            className={`${isSmall ? "text-xs" : "text-base"} text-white font-medium`}
                        >
                            {participant.name}
                        </p>
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
                {participant.isMuted ? (
                    <MicOff
                        className={`${isSmall ? "w-3 h-3" : "w-4 h-4"} text-red-400`}
                    />
                ) : (
                    <Mic
                        className={`${isSmall ? "w-3 h-3" : "w-4 h-4"} text-green-400`}
                    />
                )}
            </div>

            {/* Screen sharing indicator */}
            {showScreenShare && participant.isScreenSharing && (
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
    // Add local stream to participants list if not already there
    const allParticipants = React.useMemo(() => {
        const hasLocalStream = participants.some(
            (p) => p.stream === localStream,
        );
        if (localStream && !hasLocalStream) {
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
                ...participants,
            ];
        }
        return participants.map((p) => {
            if (p.stream === localStream) {
                return {
                    ...p,
                    screenStream: localScreenStream,
                    isMuted: isMuted,
                    isVideoOn: isVideoOn,
                    isScreenSharing: isScreenSharing,
                    isOwn: true,
                };
            }
            return {
                ...p,
                isOwn: false,
            };
        });
    }, [participants, localStream, isScreenSharing, isMuted, isVideoOn]);

    const presenting = allParticipants.find((p) => p.isScreenSharing);
    const others = allParticipants.filter((p) => !p.isScreenSharing);

    // Режим презентации - показываем экран презентующего большим, а веб-камеры всех (включая презентующего) внизу
    if (presenting) {
        return (
            <div className="flex flex-col h-full">
                {/* Большая плитка с экраном презентующего */}
                <div className="flex-1 p-6 min-h-0">
                    <div className="h-full max-w-5xl mx-auto">
                        <ParticipantTile
                            participant={presenting}
                            size="normal"
                            showScreenShare={true}
                        />
                    </div>
                </div>

                {/* Полоса с веб-камерами всех участников (включая презентующего) */}
                <div className="h-64 bg-gray-950 border-t-2 border-gray-700 overflow-x-auto">
                    <div className="flex gap-6 p-6 min-w-max items-center">
                        {/* Сначала показываем веб-камеру презентующего */}
                        <div className="flex-shrink-0 w-80">
                            <ParticipantTile
                                participant={{
                                    ...presenting,
                                    screenStream: null,
                                    isScreenSharing: false,
                                }}
                                size="small"
                                showScreenShare={false}
                            />
                        </div>
                        {/* Затем остальных участников */}
                        {others.map((participant) => (
                            <div
                                key={participant.id}
                                className="flex-shrink-0 w-80"
                            >
                                <ParticipantTile
                                    participant={participant}
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

    // Обычный режим — все плитки равного размера
    return (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-6 h-full p-6 overflow-y-auto">
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
