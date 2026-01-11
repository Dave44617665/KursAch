import React, { useState, useEffect, useRef } from "react";
import { X, Send, Paperclip, User, File, Download } from "lucide-react";

const ChatPanel = ({
    isOpen,
    onClose,
    messages = [],
    onSendMessage,
    myParticipantId,
}) => {
    const [message, setMessage] = useState("");
    const [selectedFile, setSelectedFile] = useState(null);
    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = (e) => {
        e.preventDefault();
        if ((!message.trim() && !selectedFile) || !onSendMessage) return;

        if (selectedFile) {
            // Send file
            const reader = new FileReader();
            reader.onload = () => {
                const fileData = {
                    type: "file",
                    name: selectedFile.name,
                    size: selectedFile.size,
                    data: reader.result,
                    mimeType: selectedFile.type,
                };
                onSendMessage(JSON.stringify(fileData));
                setSelectedFile(null);
            };
            reader.readAsDataURL(selectedFile);
        } else {
            // Send text message
            onSendMessage(message);
        }
        setMessage("");
    };

    const handleFileSelect = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            // Limit file size to 10MB
            if (file.size > 10 * 1024 * 1024) {
                alert("File size must be less than 10MB");
                return;
            }
            setSelectedFile(file);
        }
    };

    const handleDownloadFile = (fileData) => {
        try {
            const link = document.createElement("a");
            link.href = fileData.data;
            link.download = fileData.name;
            link.click();
        } catch (error) {
            console.error("Failed to download file:", error);
        }
    };

    const formatFileSize = (bytes) => {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
        return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    };

    const parseMessage = (msg) => {
        try {
            const parsed = JSON.parse(msg.message);
            if (parsed.type === "file") {
                return { isFile: true, fileData: parsed };
            }
        } catch {
            // Not a file, regular message
        }
        return { isFile: false, text: msg.message };
    };

    const formatTime = (timestamp) => {
        try {
            const date = new Date(timestamp);
            return date.toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
            });
        } catch {
            return "";
        }
    };

    if (!isOpen) return null;

    return (
        <div className="absolute right-0 top-0 bottom-0 w-80 bg-white border-l border-gray-200 flex flex-col z-10">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <h3 className="font-semibold text-gray-900">
                    In-call messages
                </h3>
                <button
                    onClick={onClose}
                    className="p-1 hover:bg-gray-100 rounded transition-colors"
                >
                    <X className="w-5 h-5 text-gray-500" />
                </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                        No messages yet. Start the conversation!
                    </div>
                ) : (
                    messages.map((msg) => {
                        const isOwn = msg.participantId === myParticipantId;
                        const { isFile, fileData, text } = parseMessage(msg);
                        return (
                            <div
                                key={msg.id}
                                className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
                            >
                                <div
                                    className={`flex ${isOwn ? "flex-row-reverse" : "flex-row"} gap-2 items-end max-w-[70%]`}
                                >
                                    {/* Avatar */}
                                    <div
                                        className={`flex-shrink-0 w-8 h-8 rounded-full ${isOwn ? "bg-indigo-600" : "bg-gray-600"} flex items-center justify-center`}
                                    >
                                        <User className="w-5 h-5 text-white" />
                                    </div>

                                    <div
                                        className={`${isOwn ? "items-end" : "items-start"} flex flex-col gap-1`}
                                    >
                                        {!isOwn && (
                                            <span className="text-xs font-medium text-gray-900">
                                                {msg.name}
                                            </span>
                                        )}

                                        {isFile ? (
                                            <div
                                                className={`px-4 py-3 rounded-lg ${
                                                    isOwn
                                                        ? "bg-indigo-600 text-white"
                                                        : "bg-gray-100 text-gray-900"
                                                } cursor-pointer hover:opacity-90 transition-opacity`}
                                                onClick={() =>
                                                    handleDownloadFile(fileData)
                                                }
                                            >
                                                <div className="flex items-center gap-3">
                                                    <File
                                                        className={`w-5 h-5 ${isOwn ? "text-white" : "text-gray-600"}`}
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium truncate">
                                                            {fileData.name}
                                                        </p>
                                                        <p
                                                            className={`text-xs ${isOwn ? "text-indigo-200" : "text-gray-500"}`}
                                                        >
                                                            {formatFileSize(
                                                                fileData.size,
                                                            )}
                                                        </p>
                                                    </div>
                                                    <Download
                                                        className={`w-4 h-4 ${isOwn ? "text-white" : "text-gray-600"}`}
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            <div
                                                className={`px-4 py-2 rounded-lg ${
                                                    isOwn
                                                        ? "bg-indigo-600 text-white"
                                                        : "bg-gray-100 text-gray-900"
                                                }`}
                                            >
                                                <p className="text-sm whitespace-pre-wrap break-words">
                                                    {text}
                                                </p>
                                            </div>
                                        )}

                                        <span className="text-xs text-gray-500">
                                            {formatTime(msg.timestamp)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form
                onSubmit={handleSend}
                className="p-4 border-t border-gray-200"
            >
                {selectedFile && (
                    <div className="mb-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <File className="w-4 h-4 text-indigo-600" />
                            <span className="text-sm text-gray-900 truncate max-w-[200px]">
                                {selectedFile.name}
                            </span>
                            <span className="text-xs text-gray-500">
                                {formatFileSize(selectedFile.size)}
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setSelectedFile(null)}
                            className="p-1 hover:bg-indigo-100 rounded transition-colors"
                        >
                            <X className="w-4 h-4 text-gray-500" />
                        </button>
                    </div>
                )}
                <div className="flex items-center gap-2">
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        className="hidden"
                    />
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Attach file"
                    >
                        <Paperclip className="w-5 h-5" />
                    </button>
                    <input
                        type="text"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Send a message..."
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                        autoFocus={isOpen}
                        disabled={!!selectedFile}
                    />
                    <button
                        type="submit"
                        disabled={!message.trim() && !selectedFile}
                        className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Send className="w-5 h-5" />
                    </button>
                </div>
            </form>
        </div>
    );
};

export default ChatPanel;
