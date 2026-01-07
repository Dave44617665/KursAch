import React from 'react';
import { Mic, MicOff, Video as VideoIcon, VideoOff, User } from 'lucide-react';

const ParticipantTile = ({ participant }) => {
  return (
    <div className="relative bg-gray-900 rounded-lg overflow-hidden aspect-video">
      {/* Video placeholder */}
      {participant.isVideoOn ? (
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
          <div className="w-24 h-24 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
            <User className="w-12 h-12 text-white" />
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-2">
              <User className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-white font-medium">{participant.name}</p>
          </div>
        </div>
      )}

      {/* Name badge */}
      <div className="absolute bottom-3 left-3 bg-black bg-opacity-60 px-3 py-1 rounded-lg flex items-center gap-2">
        <span className="text-white text-sm font-medium">{participant.name}</span>
        {participant.isMuted ? (
          <MicOff className="w-4 h-4 text-red-400" />
        ) : (
          <Mic className="w-4 h-4 text-green-400" />
        )}
      </div>

      {/* Screen sharing indicator */}
      {participant.isScreenSharing && (
        <div className="absolute top-3 right-3 bg-indigo-600 px-2 py-1 rounded text-xs text-white font-medium">
          Presenting
        </div>
      )}
    </div>
  );
};

const VideoGrid = ({ participants }) => {
  const getGridClass = () => {
    const count = participants.length;
    if (count === 1) return 'grid-cols-1';
    if (count === 2) return 'grid-cols-2';
    if (count <= 4) return 'grid-cols-2 grid-rows-2';
    return 'grid-cols-3';
  };

  return (
    <div className={`grid ${getGridClass()} gap-4 h-full p-4`}>
      {participants.map((participant) => (
        <ParticipantTile key={participant.id} participant={participant} />
      ))}
    </div>
  );
};

export default VideoGrid;