import React, { useState, useRef, useEffect, useCallback } from 'react';

// --- Type Definitions ---
type AspectRatio = '9:16' | '1:1' | '4:5';
type AppState = 'uploading' | 'editing' | 'processing' | 'done';
type WatermarkPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';


// --- Helper Functions ---
const formatTime = (seconds: number): string => {
  if (isNaN(seconds) || seconds < 0) {
    return '00:00';
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};

// FIX: Extracted drawing logic to a reusable helper function to fix a rendering resolution bug.
const drawFrame = (
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement,
    watermark: { text: string; position: WatermarkPosition; opacity: number }
) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const videoAspect = video.videoWidth / video.videoHeight;
    const canvasAspect = canvas.width / canvas.height;
    let sx = 0, sy = 0, sWidth = video.videoWidth, sHeight = video.videoHeight;

    if (videoAspect > canvasAspect) { // Video is wider
      sWidth = video.videoHeight * canvasAspect;
      sx = (video.videoWidth - sWidth) / 2;
    } else { // Video is taller
      sHeight = video.videoWidth / canvasAspect;
      sy = (video.videoHeight - sHeight) / 2;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);

    // --- Draw Watermark ---
    if (watermark.text.trim() !== '') {
        const fontSize = Math.round(canvas.height / 25); // Scale font size with output resolution
        const margin = fontSize * 0.5;
        ctx.font = `bold ${fontSize}px Arial`;
        ctx.fillStyle = `rgba(255, 255, 255, ${watermark.opacity})`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left'; // Reset alignment

        switch (watermark.position) {
            case 'top-left':
                ctx.textAlign = 'left';
                ctx.fillText(watermark.text, margin, margin + fontSize / 2);
                break;
            case 'top-right':
                ctx.textAlign = 'right';
                ctx.fillText(watermark.text, canvas.width - margin, margin + fontSize / 2);
                break;
            case 'bottom-left':
                ctx.textAlign = 'left';
                ctx.fillText(watermark.text, margin, canvas.height - margin - fontSize / 2);
                break;
            case 'center':
                ctx.textAlign = 'center';
                ctx.fillText(watermark.text, canvas.width / 2, canvas.height / 2);
                break;
            case 'bottom-right':
            default:
                ctx.textAlign = 'right';
                ctx.fillText(watermark.text, canvas.width - margin, canvas.height - margin - fontSize / 2);
                break;
        }
    }
};

// --- SVG Icons ---
const UploadIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
  </svg>
);

const ScissorsIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3.75H6A2.25 2.25 0 0 0 3.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0 1 20.25 6v1.5m0 9V18A2.25 2.25 0 0 1 18 20.25h-1.5m-9 0H6A2.25 2.25 0 0 1 3.75 18v-1.5M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
);

const DownloadIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
);

const ArrowPathIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 11.667 0l3.181-3.183m-11.667-11.667a8.25 8.25 0 0 0-11.667 0l-3.181 3.183" />
    </svg>
);

// --- Child Components defined outside App to prevent re-renders ---
interface FileUploadScreenProps {
  onFileSelect: (file: File) => void;
  setErrorMessage: (message: string) => void;
}

const FileUploadScreen: React.FC<FileUploadScreenProps> = ({ onFileSelect, setErrorMessage }) => {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('video/')) {
        setErrorMessage('Invalid file type. Please upload a video file.');
        return;
      }
      onFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (!file.type.startsWith('video/')) {
        setErrorMessage('Invalid file type. Please upload a video file.');
        return;
      }
      onFileSelect(file);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full">
      <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-500 mb-4">Video to Short Converter</h1>
      <p className="text-gray-400 mb-8 max-w-lg text-center">Instantly trim, crop, and add audio to your videos for portrait shorts. All processing happens securely in your browser.</p>
      <label
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className="relative w-full max-w-lg h-64 border-2 border-dashed border-gray-600 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-indigo-500 hover:bg-gray-800/50 transition-colors"
      >
        <UploadIcon className="w-16 h-16 text-gray-500 mb-4" />
        <span className="text-gray-400 font-semibold">Drag & drop a video file here</span>
        <span className="text-gray-500 mt-2">or click to select a file</span>
        <input type="file" accept="video/*" className="opacity-0 absolute inset-0 w-full h-full" onChange={handleFileChange} />
      </label>
    </div>
  );
};


// --- Main App Component ---
export default function App() {
  const [appState, setAppState] = useState<AppState>('uploading');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoSrc, setVideoSrc] = useState<string>('');
  const [outputSrc, setOutputSrc] = useState<string>('');
  
  const [duration, setDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');

  const [watermarkText, setWatermarkText] = useState<string>('@MyShort');
  const [watermarkPosition, setWatermarkPosition] = useState<WatermarkPosition>('bottom-right');
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.7);
  
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // FIX: Explicitly initialize useRef with null to prevent potential "Expected 1 arguments, but got 0" error.
  const animationFrameId = useRef<number | null>(null);

  const handleFileSelect = (file: File) => {
    setErrorMessage(null);
    setVideoFile(file);
    const url = URL.createObjectURL(file);
    setVideoSrc(url);
    setAppState('editing');
  };
  
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const videoDuration = videoRef.current.duration;
      setDuration(videoDuration);
      setTrimStart(0);
      setTrimEnd(Math.min(videoDuration, 60)); // Default to 60s or less
    }
  };

  const drawPreview = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;

    const [aspectW, aspectH] = aspectRatio.split(':').map(Number);
    const canvasHeight = 480;
    const canvasWidth = Math.round(canvasHeight * (aspectW / aspectH));
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    drawFrame(canvas, video, { text: watermarkText, position: watermarkPosition, opacity: watermarkOpacity });
  }, [aspectRatio, watermarkText, watermarkPosition, watermarkOpacity]);

  useEffect(() => {
    const video = videoRef.current;
    if (video && video.readyState >= 1) { // HAVE_METADATA
      drawPreview();
    }
    
    const handleSeek = () => drawPreview();
    video?.addEventListener('seeked', handleSeek);

    return () => {
      video?.removeEventListener('seeked', handleSeek);
    };
  }, [drawPreview]);


  const handleCreateShort = async () => {
    if (!videoRef.current || !canvasRef.current || trimEnd <= trimStart) {
        setErrorMessage("Invalid trim range.");
        return;
    }

    setAppState('processing');
    setErrorMessage(null);

    const video = videoRef.current;
    const canvas = canvasRef.current; 

    const [aspectW, aspectH] = aspectRatio.split(':').map(Number);
    const outputHeight = 1080; // HD quality
    const outputWidth = Math.round(outputHeight * (aspectW / aspectH));
    canvas.width = outputWidth;
    canvas.height = outputHeight;

    // --- Stream Setup ---
    // 1. Get video track from the canvas (our visual output)
    const canvasVideoTrack = canvas.captureStream(30).getVideoTracks()[0];

    // 2. Get audio track directly from the source video element
    // Note: `captureStream` is experimental and may require prefixes in some browsers.
    const sourceStream = (video as any).captureStream ? (video as any).captureStream() : (video as any).mozCaptureStream ? (video as any).mozCaptureStream() : null;
    const audioTrack = sourceStream?.getAudioTracks()[0];

    // 3. Combine tracks into a new stream for the recorder
    const tracks = [canvasVideoTrack];
    if (audioTrack) {
        tracks.push(audioTrack);
    } else {
        console.warn("No audio track found in the source video. The output will be silent.");
    }
    const combinedStream = new MediaStream(tracks);
    
    // --- Media Recorder ---
    const recorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm; codecs=vp9,opus' });
    const chunks: Blob[] = [];

    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        setOutputSrc(url);
        setAppState('done');
    };
    
    recorder.start();
    
    // --- Processing Loop ---
    // To capture audio via captureStream, the element cannot be muted.
    // We set volume to 0 as a workaround to silence it for the user.
    video.currentTime = trimStart;
    const originalVolume = video.volume;
    const originalMuted = video.muted;
    video.muted = false;
    video.volume = 0;
    
    try {
      await video.play();

      const renderLoop = () => {
          if (video.currentTime >= trimEnd || video.paused) {
              recorder.stop();
              video.pause();

              // Restore original video volume/muted state
              video.volume = originalVolume;
              video.muted = originalMuted;
              
              if (animationFrameId.current !== null) {
                  cancelAnimationFrame(animationFrameId.current);
              }
              return;
          }
          drawFrame(canvas, video, { text: watermarkText, position: watermarkPosition, opacity: watermarkOpacity });
          animationFrameId.current = requestAnimationFrame(renderLoop);
      };

      animationFrameId.current = requestAnimationFrame(renderLoop);
    } catch (error) {
        console.error("Error during video playback for processing:", error);
        setErrorMessage("Failed to start video processing.");
        setAppState('editing'); // Revert state
        // Restore original video volume/muted state
        video.volume = originalVolume;
        video.muted = originalMuted;
    }
  };

  const handleReset = () => {
      URL.revokeObjectURL(videoSrc);
      if(outputSrc) URL.revokeObjectURL(outputSrc);
      setVideoFile(null);
      setVideoSrc('');
      setOutputSrc('');
      setDuration(0);
      setTrimStart(0);
      setTrimEnd(0);
      setErrorMessage(null);
      setWatermarkText('@MyShort');
      setWatermarkPosition('bottom-right');
      setWatermarkOpacity(0.7);
      setAppState('uploading');
  };

  const renderContent = () => {
    switch (appState) {
      case 'editing':
      case 'processing':
        return (
          <div className="relative w-full max-w-7xl mx-auto p-4 md:p-8">
            <div className={`grid grid-cols-1 lg:grid-cols-2 gap-8 transition-all duration-300 ${appState === 'processing' ? 'blur-sm pointer-events-none' : ''}`}>
              {/* Left Column: Video and Controls */}
              <div className="bg-gray-800 p-4 rounded-lg shadow-lg">
                  <video
                    ref={videoRef}
                    src={videoSrc}
                    className="w-full rounded-md bg-black"
                    onLoadedMetadata={handleLoadedMetadata}
                    onTimeUpdate={() => {
                        if(appState === 'editing' && videoRef.current && videoRef.current.currentTime > trimEnd) {
                            videoRef.current.currentTime = trimStart;
                        }
                    }}
                    controls={appState === 'editing'}
                  ></video>

                <div className="mt-4 space-y-4">
                    <div>
                      <div className="flex justify-between items-center mb-2">
                          <label className="text-sm font-medium text-gray-300">Trim Start</label>
                          <span className="text-sm text-indigo-400 font-mono">{formatTime(trimStart)}</span>
                      </div>
                      <input type="range" min="0" max={duration} value={trimStart} step="0.1" onChange={e => {
                          const newStart = parseFloat(e.target.value);
                          setTrimStart(newStart);
                          if(videoRef.current) videoRef.current.currentTime = newStart;
                          if(newStart >= trimEnd) setTrimEnd(newStart + 0.1);
                      }}/>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-2">
                          <label className="text-sm font-medium text-gray-300">Trim End</label>
                          <span className="text-sm text-indigo-400 font-mono">{formatTime(trimEnd)}</span>
                      </div>
                      <input type="range" min="0" max={duration} value={trimEnd} step="0.1" onChange={e => {
                          const newEnd = parseFloat(e.target.value);
                          setTrimEnd(newEnd);
                          if(videoRef.current) videoRef.current.currentTime = newEnd;
                          if(newEnd <= trimStart) setTrimStart(newEnd - 0.1);
                      }}/>
                    </div>
                </div>
              </div>

              {/* Right Column: Preview and Settings */}
              <div className="flex flex-col space-y-6">
                  <div className="bg-gray-800 p-4 rounded-lg shadow-lg">
                      <h3 className="text-lg font-semibold mb-3 text-gray-200">Live Preview</h3>
                      <div className="flex justify-center items-center bg-black rounded-md aspect-[9/16] max-h-[480px]">
                          <canvas ref={canvasRef} className="max-w-full max-h-full rounded-md"></canvas>
                      </div>
                  </div>

                  <div className="bg-gray-800 p-4 rounded-lg shadow-lg">
                      <h3 className="text-lg font-semibold mb-3 text-gray-200">Aspect Ratio</h3>
                      <div className="grid grid-cols-3 gap-3">
                        {(['9:16', '1:1', '4:5'] as AspectRatio[]).map(ar => (
                          <button key={ar} onClick={() => setAspectRatio(ar)} className={`py-3 px-2 rounded-md transition-colors text-sm font-semibold ${aspectRatio === ar ? 'bg-indigo-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}>
                            {ar}
                          </button>
                        ))}
                      </div>
                  </div>

                  {/* Watermark Section */}
                  <div className="bg-gray-800 p-4 rounded-lg shadow-lg">
                    <h3 className="text-lg font-semibold mb-3 text-gray-200">Watermark</h3>
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="watermarkText" className="text-sm font-medium text-gray-300 mb-1 block">Text</label>
                            <input
                                id="watermarkText"
                                type="text"
                                value={watermarkText}
                                onChange={(e) => setWatermarkText(e.target.value)}
                                placeholder="e.g., @yourname"
                                className="w-full bg-gray-700 border border-gray-600 text-white rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-300 mb-2 block">Position</label>
                            <div className="grid grid-cols-2 gap-2">
                                {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as WatermarkPosition[]).map(pos => (
                                    <button
                                        key={pos}
                                        onClick={() => setWatermarkPosition(pos)}
                                        className={`py-2 px-2 rounded-md transition-colors text-xs font-semibold capitalize ${watermarkPosition === pos ? 'bg-indigo-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}
                                    >
                                        {pos.replace('-', ' ')}
                                    </button>
                                ))}
                            </div>
                            <button
                                onClick={() => setWatermarkPosition('center')}
                                className={`w-full mt-2 py-2 px-2 rounded-md transition-colors text-xs font-semibold capitalize ${watermarkPosition === 'center' ? 'bg-indigo-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}
                            >
                                Center
                            </button>
                        </div>
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <label className="text-sm font-medium text-gray-300">Opacity</label>
                                <span className="text-sm text-indigo-400 font-mono">{watermarkOpacity.toFixed(2)}</span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={watermarkOpacity}
                                onChange={(e) => setWatermarkOpacity(parseFloat(e.target.value))}
                            />
                        </div>
                    </div>
                  </div>


                   <button onClick={handleCreateShort} className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white font-bold py-4 px-6 rounded-lg shadow-lg hover:bg-indigo-700 transition-transform transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed" disabled={trimEnd - trimStart <= 0}>
                      <ScissorsIcon className="w-6 h-6"/>
                      Create Short
                  </button>
                  <button onClick={handleReset} className="w-full text-center text-sm text-gray-400 hover:text-indigo-400 transition">Start Over</button>
              </div>
            </div>
            {appState === 'processing' && (
              <div className="absolute inset-0 bg-gray-900/75 flex flex-col items-center justify-center rounded-lg z-10">
                <div className="w-16 h-16 border-4 border-t-indigo-500 border-gray-600 rounded-full animate-spin mb-6"></div>
                <h2 className="text-3xl font-bold text-white mb-2">Creating your short...</h2>
                <p className="text-gray-400">This may take a moment. Please keep this tab open.</p>
              </div>
            )}
          </div>
        );
      case 'done':
        return (
            <div className="flex flex-col items-center justify-center h-full text-center p-4">
                <h2 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-blue-500 mb-6">Your Short is Ready!</h2>
                <video src={outputSrc} className="max-w-sm w-full rounded-lg shadow-2xl mb-8 border-2 border-gray-700" controls autoPlay loop></video>
                <div className="flex flex-col sm:flex-row gap-4">
                     <a href={outputSrc} download={`${videoFile?.name.split('.')[0]}_short.webm`} className="flex items-center justify-center gap-2 bg-green-600 text-white font-bold py-3 px-8 rounded-lg shadow-lg hover:bg-green-700 transition-transform transform hover:scale-105">
                        <DownloadIcon className="w-6 h-6" />
                        Download
                    </a>
                    <button onClick={handleReset} className="flex items-center justify-center gap-2 bg-gray-700 text-white font-bold py-3 px-8 rounded-lg shadow-lg hover:bg-gray-600 transition-transform transform hover:scale-105">
                        <ArrowPathIcon className="w-6 h-6" />
                        Create Another
                    </button>
                </div>
            </div>
        );
      case 'uploading':
      default:
        return <FileUploadScreen onFileSelect={handleFileSelect} setErrorMessage={setErrorMessage} />;
    }
  };

  return (
    <main className="min-h-screen w-full flex flex-col items-center justify-center p-4 bg-gray-900">
      {errorMessage && (
        <div className="absolute top-5 bg-red-500 text-white py-2 px-4 rounded-md shadow-lg animate-pulse" role="alert">
          {errorMessage}
        </div>
      )}
      {renderContent()}
    </main>
  );
}
