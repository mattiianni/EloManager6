import React from 'react';
import { SFIcon } from './SFIcon.tsx';

const BeatTheBoxAnimation: React.FC = () => {
 return (
 <>
 <style>
 {`
 @keyframes box-bounce {
 0%, 100% { transform: translateY(0) scale(1); }
 50% { transform: translateY(-20px) scale(1.1); }
 }
 
 @keyframes box-rotate {
 0% { transform: rotateY(0deg); }
 100% { transform: rotateY(360deg); }
 }
 
 @keyframes box-glow {
 0%, 100% { box-shadow: 0 0 20px rgba(59, 130, 246, 0.5); }
 50% { box-shadow: 0 0 40px rgba(59, 130, 246, 0.8); }
 }

 .beat-box-container {
 display: flex;
 justify-content: center;
 margin-bottom: 40px;
 }

 .beat-box {
 width: 80px;
 height: 80px;
 background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
 border-radius: 12px;
 border: 3px solid #60a5fa;
 display: flex;
 align-items: center;
 justify-content: center;
 font-size: 32px;
 font-weight: bold;
 color: white;
 animation: box-bounce 1.5s ease-in-out infinite, box-glow 2s ease-in-out infinite;
 position: relative;
 }
 
 .beat-box:nth-child(1) {
 animation-delay: 0s;
 }
 .beat-box:nth-child(2) {
 animation-delay: 0.2s;
 }
 .beat-box:nth-child(3) {
 animation-delay: 0.4s;
 }
 .beat-box:nth-child(4) {
 animation-delay: 0.6s;
 }
 
 @keyframes progress-fill-box {
 0% { width: 0%; }
 100% { width: 100%; }
 }

 .progress-bar-inner-box {
 height: 100%;
 background: linear-gradient(90deg, #3b82f6 0%, #2563eb 50%, #1d4ed8 100%);
 border-radius: 4px;
 animation: progress-fill-box 3s ease-out forwards;
 box-shadow: 0 0 10px rgba(59, 130, 246, 0.5);
 }
 
 @keyframes pulse-text {
 0%, 100% { opacity: 1; }
 50% { opacity: 0.6; }
 }
 
 .pulse-text {
 animation: pulse-text 1.5s ease-in-out infinite;
 }
 `}
 </style>
 <div className="fixed inset-0 bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 bg-opacity-95 flex flex-col items-center justify-center z-50 backdrop-blur-sm">
 {/* Box Animation */}
 <div className="beat-box-container">
 <div className="beat-box">
  <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white drop-shadow-sm">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" fill="rgba(255, 255, 255, 0.25)" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
 </div>
 </div>
 
 {/* Title */}
 <h2 className="text-3xl font-bold text-white mb-2 tracking-wider pulse-text">
 Box in Preparazione...
 </h2>
 
 <p className="text-ios-blue text-sm mb-8">
 Distribuzione giocatori nei box
 </p>
 
 {/* Progress Bar */}
 <div className="w-80 h-3 bg-gray-700 rounded-full overflow-hidden shadow-lg">
 <div className="progress-bar-inner-box"></div>
 </div>
 </div>
 </>
 );
};

export default BeatTheBoxAnimation;
