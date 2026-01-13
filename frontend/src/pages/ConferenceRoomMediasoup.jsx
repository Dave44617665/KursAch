import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useMediasoup } from "../hooks/useMediasoup";
import VideoGrid from "../components/conference/VideoGrid";
import ControlBar from "../components/conference/ControlBar";
import ChatPanel from "../components/conference/ChatPanel";
import ConnectionStatus from "../components/conference/ConnectionStatus";

const ConferenceRoomMediasoup = () => {
    const { id: conferenceId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [conferenceInfo, setConferenceInfo] = useState(null);
    const [duration, setDuration] = useState("00:00");

    const userName = user?.nickname || user?.email || "Guest";

    const {
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
    } = useMediasoup(
        conferenceId,
        localStorage.getItem("access_token"),
        userName,
    );

    useEffect(() => {
        document.title = conferenceInfo?.name || "Conference";
    }, [conferenceInfo]);

    useEffect(() => {
        const startTime = Date.now();
        const interval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            setDuration(
                `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`,
            );
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    const handleLeaveCall = async () => {
        leaveCall();
        navigate("/dashboard");
    };

    // Логирование для отладки
    React.useEffect(() => {
        console.log("[ConferenceRoomMediasoup] State updated:", {
            participantsCount: participants.length,
            hasLocalStream: !!localStream,
            isConnected,
            participants: participants.map((p) => ({
                id: p.id,
                name: p.name,
                hasStream: !!p.stream,
                audioTracks: p.stream?.getAudioTracks().length || 0,
                videoTracks: p.stream?.getVideoTracks().length || 0,
            })),
        });
    }, [participants, localStream, isConnected]);

    return (
        <div className="h-screen bg-gray-950 flex flex-col overflow-hidden">
            <ConnectionStatus isConnected={isConnected} />

            <div className="flex-1 flex overflow-hidden">
                <div
                    className={`flex-1 transition-all duration-300 ${
                        isChatOpen ? "mr-80" : ""
                    }`}
                >
                    <VideoGrid
                        participants={participants}
                        localStream={localStream}
                        localScreenStream={null}
                        isScreenSharing={isScreenSharing}
                        isMuted={isMuted}
                        isVideoOn={isVideoOn}
                    />
                </div>

                {isChatOpen && (
                    <ChatPanel
                        messages={messages}
                        onSendMessage={sendMessage}
                        onClose={() => setIsChatOpen(false)}
                    />
                )}
            </div>

            <ControlBar
                isMuted={isMuted}
                isVideoOn={isVideoOn}
                isScreenSharing={isScreenSharing}
                onToggleMute={toggleMute}
                onToggleVideo={toggleVideo}
                onToggleScreenShare={toggleScreenShare}
                onLeaveCall={handleLeaveCall}
                onToggleChat={() => setIsChatOpen(!isChatOpen)}
                onSettings={() => setIsSettingsOpen(true)}
                isConnected={isConnected}
                title={conferenceInfo?.name}
                duration={duration}
                participantCount={participants.length + 1}
            />
        </div>
    );
};

export default ConferenceRoomMediasoup;
