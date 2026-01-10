import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, Users, Video, Trash2 } from 'lucide-react';
import { format } from 'date-fns';

const ConferenceCard = ({ conference, onDelete, onStart }) => {
  const navigate = useNavigate();

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'ended':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'active':
        return 'Live';
      case 'ended':
        return 'Ended';
      default:
        return 'Scheduled';
    }
  };

  const handleJoin = () => {
    if (conference.status === 'active') {
      navigate(`/conference/${conference.id}`);
    } else {
      onStart(conference.id);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {conference.title}
          </h3>
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(conference.status)}`}>
            {getStatusText(conference.status)}
          </span>
        </div>
        
        {conference.status !== 'active' && (
          <button
            onClick={() => onDelete(conference.id)}
            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Info */}
      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Calendar className="w-4 h-4" />
          <span>{format(new Date(conference.start_time), 'MMM dd, yyyy')}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Clock className="w-4 h-4" />
          <span>{format(new Date(conference.start_time), 'HH:mm')}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Users className="w-4 h-4" />
          <span>{conference.participants?.length || 0} participants</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {conference.status === 'scheduled' && (
          <button
            onClick={handleJoin}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
          >
            <Video className="w-4 h-4" />
            Start Meeting
          </button>
        )}
        
        {conference.status === 'active' && (
          <button
            onClick={handleJoin}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
          >
            <Video className="w-4 h-4" />
            Join Meeting
          </button>
        )}

        {conference.status === 'ended' && (
          <button
            disabled
            className="flex-1 px-4 py-2 bg-gray-100 text-gray-400 rounded-lg font-medium cursor-not-allowed"
          >
            Meeting Ended
          </button>
        )}
      </div>
    </div>
  );
};

export default ConferenceCard;