import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Calendar as CalendarIcon, History, LogIn } from 'lucide-react';
import Navbar from '../components/layout/Navbar';
import ConferenceCard from '../components/dashboard/ConferenceCard';
import CreateConferenceModal from '../components/dashboard/CreateConferenceModal';
import JoinConferenceModal from '../components/dashboard/JoinConferenceModal'; // ← НОВОЕ
import { conferenceService } from '../services/conferenceService';

const DashboardPage = () => {
  const navigate = useNavigate();
  const [conferences, setConferences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false); // ← НОВОЕ
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadConferences();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const loadConferences = async () => {
    try {
      setLoading(true);
      const statusFilter = filter === 'all' ? '' : filter;
      const data = await conferenceService.getConferences(statusFilter);
      setConferences(data || []);
    } catch (error) {
      console.error('Failed to load conferences:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateConference = async (title, startTime) => {
    try {
      await conferenceService.createConference(title, startTime);
      await loadConferences();
    } catch (error) {
      console.error('Failed to create conference:', error);
      throw error;
    }
  };

  // ← НОВОЕ: Join conference handler
  const handleJoinConference = async (readableId) => {
    try {
      const result = await conferenceService.joinByReadableId(readableId);
      // Перенаправить на комнату конференции
      navigate(`/conference/${result.conference.id}`);
    } catch (error) {
      console.error('Failed to join conference:', error);
      throw error;
    }
  };

  const handleDeleteConference = async (id) => {
    if (!window.confirm('Are you sure you want to delete this conference?')) {
      return;
    }

    try {
      await conferenceService.deleteConference(id);
      await loadConferences();
    } catch (error) {
      console.error('Failed to delete conference:', error);
    }
  };

  const handleStartConference = async (id) => {
    try {
      await conferenceService.startConference(id);
      await loadConferences();
    } catch (error) {
      console.error('Failed to start conference:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero Section */}
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-8 mb-8 text-white">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h1 className="text-3xl font-bold mb-2">Video meetings</h1>
              <p className="text-indigo-100">Free. Unlimited. For everyone.</p>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center gap-2 px-6 py-3 bg-white text-indigo-600 rounded-lg font-medium hover:bg-indigo-50 transition-colors"
              >
                <Plus className="w-5 h-5" />
                Create Meeting
              </button>
              
              {/* НОВОЕ: Кнопка Join */}
              <button
                onClick={() => setIsJoinModalOpen(true)}
                className="flex items-center gap-2 px-6 py-3 bg-indigo-700 text-white rounded-lg font-medium hover:bg-indigo-800 transition-colors border-2 border-white border-opacity-30"
              >
                <LogIn className="w-5 h-5" />
                Join
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === 'all'
                ? 'bg-indigo-100 text-indigo-700'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('scheduled')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === 'scheduled'
                ? 'bg-indigo-100 text-indigo-700'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <CalendarIcon className="w-4 h-4" />
            Scheduled
          </button>
          <button
            onClick={() => setFilter('ended')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === 'ended'
                ? 'bg-indigo-100 text-indigo-700'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <History className="w-4 h-4" />
            History
          </button>
        </div>

        {/* Conferences Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
        ) : conferences.length === 0 ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
              <CalendarIcon className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">No meetings yet</h3>
            <p className="text-gray-500 mb-4">Create your first meeting to get started</p>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Meeting
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {conferences.map((conference) => (
              <ConferenceCard
                key={conference.id}
                conference={conference}
                onDelete={handleDeleteConference}
                onStart={handleStartConference}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <CreateConferenceModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreateConference={handleCreateConference}
      />
      
      {/* НОВОЕ: Join Modal */}
      <JoinConferenceModal
        isOpen={isJoinModalOpen}
        onClose={() => setIsJoinModalOpen(false)}
        onJoinConference={handleJoinConference}
      />
    </div>
  );
};

export default DashboardPage;