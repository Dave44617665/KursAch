import React, { useState, useEffect } from 'react';
import { Mic, Video, X } from 'lucide-react';

const DeviceSelector = ({ onSelectDevice, onClose }) => {
    const [audioDevices, setAudioDevices] = useState([]);
    const [videoDevices, setVideoDevices] = useState([]);
    const [selectedAudio, setSelectedAudio] = useState('');
    const [selectedVideo, setSelectedVideo] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadDevices();
    }, []);

    const loadDevices = async () => {
        try {
            // Request permissions first
            await navigator.mediaDevices.getUserMedia({ audio: true, video: true });

            const devices = await navigator.mediaDevices.enumerateDevices();
            const audio = devices.filter(d => d.kind === 'audioinput');
            const video = devices.filter(d => d.kind === 'videoinput');

            setAudioDevices(audio);
            setVideoDevices(video);

            // Set default devices
            if (audio.length > 0) {
                setSelectedAudio(audio[0].deviceId);
            }
            if (video.length > 0) {
                setSelectedVideo(video[0].deviceId);
            }

            setLoading(false);
        } catch (error) {
            console.error('Failed to enumerate devices:', error);
            setLoading(false);
        }
    };

    const handleApply = () => {
        if (selectedAudio || selectedVideo) {
            onSelectDevice({
                audioDeviceId: selectedAudio,
                videoDeviceId: selectedVideo
            });
        }
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 w-96 shadow-2xl">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-white text-lg font-semibold">Device Settings</h3>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {loading ? (
                    <div className="text-center text-gray-400 py-8">
                        Loading devices...
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Microphone Selection */}
                        <div>
                            <label className="flex items-center gap-2 text-white text-sm mb-2">
                                <Mic className="w-4 h-4" />
                                Microphone
                            </label>
                            <select
                                value={selectedAudio}
                                onChange={(e) => setSelectedAudio(e.target.value)}
                                className="w-full bg-gray-700 text-white rounded px-3 py-2 border border-gray-600 focus:border-indigo-500 outline-none transition-colors"
                            >
                                {audioDevices.length === 0 ? (
                                    <option>No microphones found</option>
                                ) : (
                                    audioDevices.map(device => (
                                        <option key={device.deviceId} value={device.deviceId}>
                                            {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
                                        </option>
                                    ))
                                )}
                            </select>
                        </div>

                        {/* Camera Selection */}
                        <div>
                            <label className="flex items-center gap-2 text-white text-sm mb-2">
                                <Video className="w-4 h-4" />
                                Camera
                            </label>
                            <select
                                value={selectedVideo}
                                onChange={(e) => setSelectedVideo(e.target.value)}
                                className="w-full bg-gray-700 text-white rounded px-3 py-2 border border-gray-600 focus:border-indigo-500 outline-none transition-colors"
                            >
                                {videoDevices.length === 0 ? (
                                    <option>No cameras found</option>
                                ) : (
                                    videoDevices.map(device => (
                                        <option key={device.deviceId} value={device.deviceId}>
                                            {device.label || `Camera ${device.deviceId.slice(0, 8)}`}
                                        </option>
                                    ))
                                )}
                            </select>
                        </div>
                    </div>
                )}

                <div className="flex gap-3 mt-6">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleApply}
                        disabled={loading || (!selectedAudio && !selectedVideo)}
                        className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Apply
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DeviceSelector;
