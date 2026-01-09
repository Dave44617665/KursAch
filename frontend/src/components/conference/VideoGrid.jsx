import React from 'react';
import { Mic, MicOff, User } from 'lucide-react';

const ParticipantTile = ({ participant, size = 'normal' }) => {
  const isSmall = size === 'small';

  return (
    <div
      className={`
        relative bg-gray-900 rounded-lg overflow-hidden aspect-video flex items-center justify-center
        ${participant.isSpeaking ? 'ring-4 ring-blue-500 ring-offset-4 ring-offset-gray-900' : ''}
        animate-appear
      `}
    >
      {/* Video placeholder */}
      {participant.isVideoOn ? (
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
          <div className={`${isSmall ? 'w-1/3 max-w-24' : 'w-1/3 max-w-64'} aspect-square bg-white bg-opacity-20 rounded-full flex items-center justify-center`}>
            <User className={`${isSmall ? 'w-1/2' : 'w-1/2'} text-white`} />
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
          <div className="text-center">
            <div className={`${isSmall ? 'w-20 max-w-20' : 'w-32 max-w-32'} aspect-square bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-3`}>
              <User className={`${isSmall ? 'w-10' : 'w-16'} text-gray-400`} />
            </div>
            <p className={`${isSmall ? 'text-xs' : 'text-base'} text-white font-medium`}>{participant.name}</p>
          </div>
        </div>
      )}

      {/* Name badge */}
      <div className="absolute bottom-3 left-3 bg-black bg-opacity-60 px-3 py-1 rounded-lg flex items-center gap-2">
        <span className={`${isSmall ? 'text-xs' : 'text-sm'} text-white font-medium`}>
          {participant.name}
        </span>
        {participant.isMuted ? (
          <MicOff className={`${isSmall ? 'w-3 h-3' : 'w-4 h-4'} text-red-400`} />
        ) : (
          <Mic className={`${isSmall ? 'w-3 h-3' : 'w-4 h-4'} text-green-400`} />
        )}
      </div>

      {/* Screen sharing indicator */}
      {participant.isScreenSharing && (
        <div className="absolute top-3 right-3 bg-indigo-600 px-3 py-1.5 rounded text-sm text-white font-medium">
          Presenting
        </div>
      )}
    </div>
  );
};

const VideoGrid = ({ participants }) => {
  const presentingParticipant = participants.find(p => p.isScreenSharing);
  const otherParticipants = participants.filter(p => !p.isScreenSharing);

  // Режим презентации (оставляем без изменений)
  if (presentingParticipant) {
    return (
      <div className="flex flex-col h-full">
        {/* Большая плитка презентующего */}
        <div className="flex-1 p-6 min-h-0">
          <div className="h-full max-w-5xl mx-auto">
            <ParticipantTile participant={presentingParticipant} size="normal" />
          </div>
        </div>

        {/* Полоса с остальными участниками */}
        {otherParticipants.length > 0 && (
          <div className="h-64 bg-gray-950 border-t-2 border-gray-700 overflow-x-auto">
            <div className="flex gap-6 p-6 min-w-max items-center">
              {otherParticipants.map((participant) => (
                <div key={participant.id} className="flex-shrink-0 w-80">
                  <ParticipantTile participant={participant} size="small" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Обычный режим — все плитки равного размера, автоматически заполняют пространство
  return (
    <div
      className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-6 h-full p-6 overflow-y-auto"
    >
      {participants.map((participant) => (
        <ParticipantTile key={participant.id} participant={participant} size="normal" />
      ))}
    </div>
  );
};

export default VideoGrid;