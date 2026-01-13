import React from "react";

const ConnectionStatus = ({ isConnected }) => {
    if (isConnected) return null; // Don't show anything when connected

    return (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50">
            <div className="flex items-center gap-2 px-4 py-2 bg-yellow-500 text-white rounded-lg shadow-lg animate-pulse">
                <div className="w-3 h-3 rounded-full bg-white/70"></div>
                <span className="text-sm font-medium">
                    Connecting to server...
                </span>
            </div>
        </div>
    );
};

export default ConnectionStatus;
