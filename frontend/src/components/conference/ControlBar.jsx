// Updated ControlBar.jsx
import React, { useState } from "react";
import {
    Mic,
    MicOff,
    Video as VideoIcon,
    VideoOff,
    Monitor,
    PhoneOff,
    Settings,
    MessageSquare,
    ChevronUp,
    ChevronDown,
} from "lucide-react";

const ControlBar = ({
    isMuted,
    isVideoOn,
    isScreenSharing,
    onToggleMute,
    onToggleVideo,
    onToggleScreenShare,
    onLeaveCall,
    onToggleChat,
    title,
    duration,
    participantCount,
}) => {
    const [isHidden, setIsHidden] = useState(false);

    return (
        <div className="fixed inset-x-0 bottom-0">
            <div className="relative">
                {/* Круглая кнопка-пуллер с отступом 8px (0.5rem) от панели */}
                <button
                    onClick={() => setIsHidden(!isHidden)}
                    className={`
            absolute left-1/2 -translate-x-1/2 z-10
            w-12 h-12 flex items-center justify-center
            bg-gray-900 bg-opacity-95 border border-gray-700 shadow-xl rounded-full
            transition-all duration-300 ease-in-out
            hover:scale-110 hover:shadow-2xl
            ${
                isHidden
                    ? "top-full translate-y-[calc(-100%-0.5rem)]"
                    : "top-0 -translate-y-[calc(100%+0.5rem)]"
            }
          `}
                >
                    {isHidden ? (
                        <ChevronUp className="w-6 h-6 text-white" />
                    ) : (
                        <ChevronDown className="w-6 h-6 text-white" />
                    )}
                </button>

                {/* Основная панель */}
                <div
                    className={`
            relative z-20
            transition-all duration-300 ease-in-out overflow-hidden
            ${
                isHidden
                    ? "translate-y-full opacity-0 pointer-events-none"
                    : "translate-y-0 opacity-100 pointer-events-auto"
            }
          `}
                >
                    <div className="bg-gray-900 bg-opacity-95 backdrop-blur-sm border-t border-gray-700">
                        <div className="max-w-6xl mx-auto px-4 py-3">
                            <div className="flex items-center justify-between">
                                {/* Meeting Info */}
                                <div className="text-white">
                                    <p className="text-xs font-medium">
                                        {title || "Untitled Conference"}
                                    </p>
                                    <p className="text-xs text-gray-400">
                                        {duration || "00:00"}
                                    </p>
                                </div>

                                {/* Controls */}
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={onToggleMute}
                                        className={`p-3 rounded-full transition-colors ${
                                            isMuted
                                                ? "bg-red-600 hover:bg-red-700"
                                                : "bg-gray-700 hover:bg-gray-600"
                                        }`}
                                        title={isMuted ? "Unmute" : "Mute"}
                                    >
                                        {isMuted ? (
                                            <MicOff className="w-5 h-5 text-white" />
                                        ) : (
                                            <Mic className="w-5 h-5 text-white" />
                                        )}
                                    </button>

                                    <button
                                        onClick={onToggleVideo}
                                        className={`p-3 rounded-full transition-colors ${
                                            !isVideoOn
                                                ? "bg-red-600 hover:bg-red-700"
                                                : "bg-gray-700 hover:bg-gray-600"
                                        }`}
                                        title={
                                            isVideoOn
                                                ? "Turn off camera"
                                                : "Turn on camera"
                                        }
                                    >
                                        {isVideoOn ? (
                                            <VideoIcon className="w-5 h-5 text-white" />
                                        ) : (
                                            <VideoOff className="w-5 h-5 text-white" />
                                        )}
                                    </button>

                                    <button
                                        onClick={onToggleScreenShare}
                                        className={`p-3 rounded-full transition-colors ${
                                            isScreenSharing
                                                ? "bg-indigo-600 hover:bg-indigo-700"
                                                : "bg-gray-700 hover:bg-gray-600"
                                        }`}
                                        title="Share screen"
                                    >
                                        <Monitor className="w-5 h-5 text-white" />
                                    </button>

                                    <button
                                        onClick={onToggleChat}
                                        className="p-3 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors"
                                        title="Toggle chat"
                                    >
                                        <MessageSquare className="w-5 h-5 text-white" />
                                    </button>

                                    <button
                                        className="p-3 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors"
                                        title="Settings"
                                    >
                                        <Settings className="w-5 h-5 text-white" />
                                    </button>

                                    <button
                                        onClick={onLeaveCall}
                                        className="p-3 rounded-full bg-red-600 hover:bg-red-700 transition-colors"
                                        title="Leave call"
                                    >
                                        <PhoneOff className="w-5 h-5 text-white" />
                                    </button>
                                </div>

                                {/* Participants count */}
                                <div className="text-white text-right">
                                    <p className="text-xs font-medium">
                                        {participantCount || 0}{" "}
                                        {participantCount === 1
                                            ? "participant"
                                            : "participants"}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ControlBar;
