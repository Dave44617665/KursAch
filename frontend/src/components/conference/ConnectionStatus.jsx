import React from "react";

export default function ConnectionStatus({ isConnected }) {
    return (
        <div className="fixed top-4 right-4 z-50">
            <div
                className={`flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg transition-all ${
                    isConnected
                        ? "bg-green-500 text-white"
                        : "bg-yellow-500 text-white animate-pulse"
                }`}
            >
                <div
                    className={`w-3 h-3 rounded-full ${
                        isConnected ? "bg-white" : "bg-white/70"
                    }`}
                ></div>
                <span className="text-sm font-medium">
                    {isConnected ? "Connected" : "Connecting..."}
                </span>
            </div>
        </div>
    );
}
