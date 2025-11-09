import React, { useState, useRef, useEffect, useCallback } from 'react';

// --- Type Definitions ---
type AspectRatio = '9:16' | '1:1' | '4:5';
type AppState = 'uploading' | 'editing' | 'processing' | 'done';
type WatermarkPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
type WatermarkType = 'text' | 'image';
type BackgroundType = 'color' | 'image';


// --- Helper Functions ---
const formatTime = (seconds: number): string => {
  if (isNaN(seconds) || seconds < 0) {
    return '00:00';
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};


const drawFrame = (
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement,
    cropZoom: number,
    watermark: {
        type: WatermarkType;
        text: string;
        image: HTMLImageElement | null;
        position: WatermarkPosition;
        opacity: number;
        imageSize: number;
        rotation: number;
        blur: number;
    },
    background: {
        type: BackgroundType;
        color: string;
        image: HTMLImageElement | null;
        blur: number;
    }
) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Draw Background
    if (background.type === 'image' && background.image) {
        ctx.save();
        if (background.blur > 0) {
            ctx.filter = `blur(${background.blur}px)`;
        }
        // Draw image to cover canvas (object-fit: cover)
        const img = background.image;
        const imgAspect = img.width / img.height;
        const canvasAspect = canvas.width / canvas.height;
        let sx=0, sy=0, sWidth=img.width, sHeight=img.height;

        if (imgAspect > canvasAspect) { // image wider than canvas
            sHeight = img.width / canvasAspect;
            sy = (img.height - sHeight) / 2;
        } else { // image taller than canvas
            sWidth = img.height * canvasAspect;
            sx = (img.width - sWidth) / 2;
        }
        ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
        ctx.restore();
    } else { // Solid color
        ctx.fillStyle = background.color;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // 2. Draw Video Frame
    const videoAspect = video.videoWidth / video.videoHeight;
    const canvasAspect = canvas.width / canvas.height;
    let baseWidth = video.videoWidth;
    let baseHeight = video.videoHeight;
    if (videoAspect > canvasAspect) { // Video is wider than canvas aspect ratio
        baseWidth = video.videoHeight * canvasAspect;
    } else { // Video is taller
        baseHeight = video.videoWidth / canvasAspect;
    }

    let sx_vid, sy_vid, sWidth_vid, sHeight_vid;
    let dx_vid, dy_vid, dWidth_vid, dHeight_vid;

    if (cropZoom >= 1) { // Zoom In
        sWidth_vid = baseWidth / cropZoom;
        sHeight_vid = baseHeight / cropZoom;
        sx_vid = (video.videoWidth - sWidth_vid) / 2;
        sy_vid = (video.videoHeight - sHeight_vid) / 2;
        dx_vid = 0; dy_vid = 0;
        dWidth_vid = canvas.width;
        dHeight_vid = canvas.height;
    } else { // Zoom Out
        sWidth_vid = baseWidth;
        sHeight_vid = baseHeight;
        sx_vid = (video.videoWidth - sWidth_vid) / 2;
        sy_vid = (video.videoHeight - sHeight_vid) / 2;
        dWidth_vid = canvas.width * cropZoom;
        dHeight_vid = canvas.height * cropZoom;
        dx_vid = (canvas.width - dWidth_vid) / 2;
        dy_vid = (canvas.height - dHeight_vid) / 2;
    }
    ctx.drawImage(video, sx_vid, sy_vid, sWidth_vid, sHeight_vid, dx_vid, dy_vid, dWidth_vid, dHeight_vid);


    // 3. Draw Watermark
    const margin = Math.round(canvas.height / 25) * 0.5;
    let element: { w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void } | null = null;

    if (watermark.type === 'text' && watermark.text.trim() !== '') {
        const fontSize = Math.round(canvas.height / 25);
        ctx.font = `bold ${fontSize}px Arial`;
        const textMetrics = ctx.measureText(watermark.text);
        
        element = {
            w: textMetrics.width,
            h: fontSize,
            draw: (c) => {
                c.font = `bold ${fontSize}px Arial`;
                c.fillStyle = `rgba(255, 255, 255, 1)`;
                c.textAlign = 'center';
                c.textBaseline = 'middle';
                c.fillText(watermark.text, 0, 0);
            }
        };
    } else if (watermark.type === 'image' && watermark.image) {
        const img = watermark.image;
        const maxW = canvas.width * (watermark.imageSize / 100);
        const imgAspect = img.width / img.height;
        
        element = {
            w: maxW,
            h: maxW / imgAspect,
            draw: (c) => {
                c.drawImage(img, -element!.w / 2, -element!.h / 2, element!.w, element!.h);
            }
        };
    }

    if (element) {
        let x = 0, y = 0;
        
        switch (watermark.position) {
            case 'top-left':      x = margin; y = margin; break;
            case 'top-right':     x = canvas.width - element.w - margin; y = margin; break;
            case 'bottom-left':   x = margin; y = canvas.height - element.h - margin; break;
            case 'center':        x = (canvas.width - element.w) / 2; y = (canvas.height - element.h) / 2; break;
            case 'bottom-right':
            default:              x = canvas.width - element.w - margin; y = canvas.height - element.h - margin; break;
        }
        
        ctx.save();
        if (watermark.blur > 0) ctx.filter = `blur(${watermark.blur}px)`;
        ctx.globalAlpha = watermark.opacity;
        ctx.translate(x + element.w / 2, y + element.h / 2);
        ctx.rotate(watermark.rotation * Math.PI / 180);
        element.draw(ctx);
        ctx.restore();
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

const positionClasses: Record<WatermarkPosition, string> = {
    'top-left': 'justify-start items-start',
    'top-right': 'justify-end items-start',
    'bottom-left': 'justify-start items-end',
    'bottom-right': 'justify-end items-end',
    'center': 'justify-center items-center',
};

interface WatermarkOverlayProps {
    type: WatermarkType;
    text: string;
    imageSrc: string | null;
    position: WatermarkPosition;
    opacity: number;
    imageSize: number;
    rotation: number;
    blur: number;
    videoRef: React.RefObject<HTMLVideoElement>;
}

const WatermarkOverlay: React.FC<WatermarkOverlayProps> = React.memo(({ type, text, imageSrc, position, opacity, imageSize, rotation, blur, videoRef }) => {
    const [fontSize, setFontSize] = useState(20);

    useEffect(() => {
        const calculateFontSize = () => {
            if (videoRef.current) {
                // Corresponds to the canvas font size logic: canvas.height / 25
                const newSize = Math.round(videoRef.current.clientHeight / 25);
                setFontSize(newSize);
            }
        };

        const videoEl = videoRef.current;
        if (!videoEl) return;
        
        const resizeObserver = new ResizeObserver(calculateFontSize);
        resizeObserver.observe(videoEl);

        calculateFontSize(); // Initial calculation

        return () => resizeObserver.disconnect();
    }, [videoRef]);

    const style: React.CSSProperties = {
        opacity,
        transform: `rotate(${rotation}deg)`,
        filter: blur > 0 ? `blur(${blur}px) drop-shadow(0 2px 4px rgba(0,0,0,0.5))` : 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
    };

    return (
        <div
            className={`absolute inset-0 flex p-2 pointer-events-none ${positionClasses[position]}`}
        >
            {type === 'text' && text.trim() !== '' && (
                <span
                    className="font-bold text-white"
                    style={{ ...style, fontSize: `${fontSize}px`, textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
                >
                    {text}
                </span>
            )}
            {type === 'image' && imageSrc && (
                <img
                    src={imageSrc}
                    alt="Watermark"
                    className="object-contain"
                    style={{ ...style, width: `${imageSize}%` }}
                />
            )}
        </div>
    );
});


// --- Main App Component ---
const aspectRatios: Record<AspectRatio, string> = {
  '9:16': 'aspect-[9/16]',
  '1:1': 'aspect-square',
  '4:5': 'aspect-[4/5]',
};

export default function App() {
  const [appState, setAppState] = useState<AppState>('uploading');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoSrc, setVideoSrc] = useState<string>('');
  const [outputSrc, setOutputSrc] = useState<string>('');
  
  const [duration, setDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const [cropZoom, setCropZoom] = useState(1);
  const [isUpscaled, setIsUpscaled] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  
  // Audio
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [musicVolume, setMusicVolume] = useState(0.5);
  const [videoVolume, setVideoVolume] = useState(1);
  
  // Background
  const [backgroundType, setBackgroundType] = useState<BackgroundType>('color');
  const [backgroundColor, setBackgroundColor] = useState('#000000');
  const [backgroundImageSrc, setBackgroundImageSrc] = useState<string | null>(null);
  const [backgroundBlur, setBackgroundBlur] = useState(8);

  // Watermark
  const [watermarkType, setWatermarkType] = useState<WatermarkType>('text');
  const [watermarkText, setWatermarkText] = useState<string>('@MyShort');
  const [watermarkImageSrc, setWatermarkImageSrc] = useState<string | null>(null);
  const [watermarkPosition, setWatermarkPosition] = useState<WatermarkPosition>('bottom-right');
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.7);
  const [watermarkImageSize, setWatermarkImageSize] = useState(20);
  const [watermarkRotation, setWatermarkRotation] = useState(0);
  const [watermarkBlur, setWatermarkBlur] = useState(0);
  
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const watermarkImageRef = useRef<HTMLImageElement | null>(null);
  const backgroundImageRef = useRef<HTMLImageElement | null>(null);
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

  const handleWatermarkImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        if (!file.type.startsWith('image/')) {
            setErrorMessage('Please select an image file for the watermark.');
            return;
        }
        if (watermarkImageSrc) URL.revokeObjectURL(watermarkImageSrc);
        const url = URL.createObjectURL(file);
        setWatermarkImageSrc(url);
    }
  };

  const handleBackgroundImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        if (!file.type.startsWith('image/')) {
            setErrorMessage('Please select an image file for the background.');
            return;
        }
        if (backgroundImageSrc) URL.revokeObjectURL(backgroundImageSrc);
        const url = URL.createObjectURL(file);
        setBackgroundImageSrc(url);
    }
  };


  const handleMusicFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        if (!file.type.startsWith('audio/')) {
            setErrorMessage('Please select an audio file.');
            return;
        }
        setMusicFile(file);
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

    drawFrame(canvas, video, cropZoom, 
      { 
        type: watermarkType,
        text: watermarkText, 
        image: watermarkImageRef.current,
        position: watermarkPosition, 
        opacity: watermarkOpacity,
        imageSize: watermarkImageSize,
        rotation: watermarkRotation,
        blur: watermarkBlur,
      },
      {
        type: backgroundType,
        color: backgroundColor,
        image: backgroundImageRef.current,
        blur: backgroundBlur,
      }
    );
  }, [aspectRatio, watermarkText, watermarkPosition, watermarkOpacity, watermarkType, watermarkImageSize, cropZoom, watermarkRotation, watermarkBlur, backgroundType, backgroundColor, backgroundBlur]);

  useEffect(() => {
    if (!watermarkImageSrc) {
        watermarkImageRef.current = null;
        drawPreview();
        return;
    }
    const img = new Image();
    img.onload = () => {
        watermarkImageRef.current = img;
        drawPreview();
    };
    img.onerror = () => setErrorMessage("Failed to load watermark image.");
    img.src = watermarkImageSrc;
  }, [watermarkImageSrc, drawPreview]);

  useEffect(() => {
    if (!backgroundImageSrc) {
        backgroundImageRef.current = null;
        drawPreview();
        return;
    }
    const img = new Image();
    img.onload = () => {
        backgroundImageRef.current = img;
        drawPreview();
    };
    img.onerror = () => setErrorMessage("Failed to load background image.");
    img.src = backgroundImageSrc;
  }, [backgroundImageSrc, drawPreview]);

  useEffect(() => {
    const video = videoRef.current;
    if (video && video.readyState >= 1) drawPreview();
    const handleSeek = () => drawPreview();
    video?.addEventListener('seeked', handleSeek);
    return () => video?.removeEventListener('seeked', handleSeek);
  }, [drawPreview]);


  const handleCreateShort = async () => {
    if (!videoRef.current || !canvasRef.current || trimEnd <= trimStart) {
        setErrorMessage("Invalid trim range.");
        return;
    }

    setAppState('processing');
    setProcessingProgress(0);
    setErrorMessage(null);

    const video = videoRef.current;
    const canvas = canvasRef.current; 

    const [aspectW, aspectH] = aspectRatio.split(':').map(Number);
    const outputHeight = isUpscaled ? 2160 : 1080;
    const outputWidth = Math.round(outputHeight * (aspectW / aspectH));
    canvas.width = outputWidth;
    canvas.height = outputHeight;

    // Audio Mixing
    const audioContext = new AudioContext();
    const destination = audioContext.createMediaStreamDestination();
    let musicAudioElement: HTMLAudioElement | null = null;
    let musicUrl: string | null = null;

    const videoAudioStream = (video as any).captureStream ? (video as any).captureStream() : (video as any).mozCaptureStream ? (video as any).mozCaptureStream() : new MediaStream();
    const originalVideoAudioTrack = videoAudioStream.getAudioTracks()[0];
    if(originalVideoAudioTrack){
        const videoSource = audioContext.createMediaStreamSource(new MediaStream([originalVideoAudioTrack]));
        const videoGain = audioContext.createGain();
        videoGain.gain.value = videoVolume;
        videoSource.connect(videoGain).connect(destination);
    }

    if(musicFile){
        musicUrl = URL.createObjectURL(musicFile);
        musicAudioElement = new Audio(musicUrl);
        musicAudioElement.crossOrigin = "anonymous";
        await new Promise<void>(resolve => { musicAudioElement!.oncanplaythrough = () => resolve(); });
        const musicStream = (musicAudioElement as any).captureStream ? (musicAudioElement as any).captureStream() : (musicAudioElement as any).mozCaptureStream ? (musicAudioElement as any).mozCaptureStream() : new MediaStream();
        const musicAudioTrack = musicStream.getAudioTracks()[0];
        if (musicAudioTrack) {
            const musicSource = audioContext.createMediaStreamSource(new MediaStream([musicAudioTrack]));
            const musicGain = audioContext.createGain();
            musicGain.gain.value = musicVolume;
            musicSource.connect(musicGain).connect(destination);
        }
    }

    const finalAudioTracks = destination.stream.getAudioTracks();
    const canvasVideoTrack = canvas.captureStream(30).getVideoTracks()[0];
    const combinedStream = new MediaStream([canvasVideoTrack, ...finalAudioTracks]);
    const recorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm; codecs=vp9,opus' });
    const chunks: Blob[] = [];

    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = () => {
        setProcessingProgress(100);
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        setOutputSrc(url);
        setAppState('done');
        if (musicUrl) URL.revokeObjectURL(musicUrl);
        audioContext.close();
    };
    
    recorder.start();
    
    video.currentTime = trimStart;
    if (musicAudioElement) musicAudioElement.currentTime = 0;
    
    const originalVolume = video.volume;
    const originalMuted = video.muted;
    video.muted = true;
    if(musicAudioElement) musicAudioElement.muted = true;

    try {
      await video.play();
      if(musicAudioElement) await musicAudioElement.play();

      const renderLoop = () => {
          if (video.currentTime >= trimEnd || video.paused) {
              recorder.stop();
              video.pause();
              if(musicAudioElement) musicAudioElement.pause();
              video.volume = originalVolume;
              video.muted = originalMuted;
              if (animationFrameId.current !== null) cancelAnimationFrame(animationFrameId.current);
              return;
          }
          
          const currentProgress = (video.currentTime - trimStart) / (trimEnd - trimStart);
          setProcessingProgress(Math.min(100, Math.round(currentProgress * 100)));

          drawFrame(canvas, video, cropZoom, 
            { type: watermarkType, text: watermarkText, image: watermarkImageRef.current, position: watermarkPosition, opacity: watermarkOpacity, imageSize: watermarkImageSize, rotation: watermarkRotation, blur: watermarkBlur },
            { type: backgroundType, color: backgroundColor, image: backgroundImageRef.current, blur: backgroundBlur }
          );
          animationFrameId.current = requestAnimationFrame(renderLoop);
      };
      animationFrameId.current = requestAnimationFrame(renderLoop);
    } catch (error) {
        console.error("Error during video playback for processing:", error);
        setErrorMessage("Failed to start video processing.");
        setAppState('editing'); 
        video.volume = originalVolume;
        video.muted = originalMuted;
        if(musicUrl) URL.revokeObjectURL(musicUrl);
        audioContext.close();
    }
  };

  const handleReset = () => {
      URL.revokeObjectURL(videoSrc);
      if(outputSrc) URL.revokeObjectURL(outputSrc);
      if (watermarkImageSrc) URL.revokeObjectURL(watermarkImageSrc);
      if (backgroundImageSrc) URL.revokeObjectURL(backgroundImageSrc);

      setVideoFile(null);
      setVideoSrc('');
      setOutputSrc('');
      setDuration(0);
      setTrimStart(0);
      setTrimEnd(0);
      setErrorMessage(null);
      setCropZoom(1);
      setIsUpscaled(false);
      setProcessingProgress(0);
      setMusicFile(null);
      setMusicVolume(0.5);
      setVideoVolume(1);
      
      setBackgroundType('color');
      setBackgroundColor('#000000');
      setBackgroundImageSrc(null);
      setBackgroundBlur(8);
      
      setWatermarkType('text');
      setWatermarkText('@MyShort');
      setWatermarkImageSrc(null);
      setWatermarkPosition('bottom-right');
      setWatermarkOpacity(0.7);
      setWatermarkImageSize(20);
      setWatermarkRotation(0);
      setWatermarkBlur(0);
      setAppState('uploading');
  };

  const renderContent = () => {
    switch (appState) {
      case 'editing':
      case 'processing':
        return (
          <div className="relative w-full max-w-7xl mx-auto p-4 md:p-8">
            <div className={`grid grid-cols-1 lg:grid-cols-2 gap-8 transition-all duration-300 ${appState === 'processing' ? 'blur-sm pointer-events-none' : ''}`}>
              {/* Left Column: Video, Controls and Preview */}
              <div className="flex flex-col space-y-6">
                <div className="bg-gray-800 p-4 rounded-lg shadow-lg">
                    <div className="relative">
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
                        {appState === 'editing' && (
                          <WatermarkOverlay 
                              type={watermarkType}
                              text={watermarkText}
                              imageSrc={watermarkImageSrc}
                              position={watermarkPosition}
                              opacity={watermarkOpacity}
                              imageSize={watermarkImageSize}
                              rotation={watermarkRotation}
                              blur={watermarkBlur}
                              videoRef={videoRef}
                          />
                        )}
                    </div>

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

                <div className="bg-gray-800 p-4 rounded-lg shadow-lg">
                    <h3 className="text-lg font-semibold mb-3 text-gray-200 text-center">Live Preview</h3>
                    <div className={`flex justify-center items-center bg-black rounded-md ${aspectRatios[aspectRatio]} max-h-[480px]`}>
                        <canvas ref={canvasRef} className="max-w-full max-h-full rounded-md"></canvas>
                    </div>
                </div>
              </div>


              {/* Right Column: Settings */}
              <div className="flex flex-col space-y-6">
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

                   {/* Framing Section */}
                  <div className="bg-gray-800 p-4 rounded-lg shadow-lg">
                      <h3 className="text-lg font-semibold mb-3 text-gray-200">Framing</h3>
                      <div>
                          <div className="flex justify-between items-center mb-1">
                              <label className="text-sm font-medium text-gray-300">Zoom</label>
                              <span className="text-sm text-indigo-400 font-mono">{cropZoom.toFixed(2)}x</span>
                          </div>
                          <input
                              type="range"
                              min="0.5"
                              max="3"
                              step="0.05"
                              value={cropZoom}
                              onChange={(e) => setCropZoom(parseFloat(e.target.value))}
                          />
                      </div>
                  </div>

                  {/* Background Section */}
                  <div className="bg-gray-800 p-4 rounded-lg shadow-lg">
                    <h3 className="text-lg font-semibold mb-3 text-gray-200">Background</h3>
                    <div className="flex bg-gray-700 rounded-md p-1 mb-4">
                      <button onClick={() => setBackgroundType('color')} className={`w-1/2 py-1.5 rounded text-sm font-semibold transition-colors ${backgroundType === 'color' ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-600'}`}>
                        Color
                      </button>
                      <button onClick={() => setBackgroundType('image')} className={`w-1/2 py-1.5 rounded text-sm font-semibold transition-colors ${backgroundType === 'image' ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-600'}`}>
                        Image
                      </button>
                    </div>
                    {backgroundType === 'color' ? (
                      <div className="flex items-center gap-4">
                        <label htmlFor="bgColor" className="text-sm font-medium text-gray-300">Solid Color</label>
                        <input
                          id="bgColor"
                          type="color"
                          value={backgroundColor}
                          onChange={(e) => setBackgroundColor(e.target.value)}
                          className="w-12 h-8 p-0 border-none rounded cursor-pointer bg-transparent"
                        />
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <label htmlFor="bgImage" className="text-sm font-medium text-gray-300 mb-2 block">Background Image</label>
                          <input
                            id="bgImage" type="file" accept="image/*" onChange={handleBackgroundImageSelect}
                            className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-gray-600 file:text-gray-200 hover:file:bg-gray-500 cursor-pointer"
                          />
                        </div>
                        {backgroundImageSrc && (
                          <>
                            <div className="flex items-center justify-between bg-gray-700 p-2 rounded-md">
                              <img src={backgroundImageSrc} className="w-10 h-10 object-cover rounded" alt="BG Preview"/>
                              <button onClick={() => { URL.revokeObjectURL(backgroundImageSrc); setBackgroundImageSrc(null);}}
                                className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-1 px-3 rounded transition-colors flex-shrink-0">
                                Remove
                              </button>
                            </div>
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="text-sm font-medium text-gray-300">Blur</label>
                                    <span className="text-sm text-indigo-400 font-mono">{backgroundBlur}px</span>
                                </div>
                                <input type="range" min="0" max="40" step="1" value={backgroundBlur}
                                    onChange={(e) => setBackgroundBlur(parseInt(e.target.value, 10))} />
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>


                  {/* Audio Mix Section */}
                   <div className="bg-gray-800 p-4 rounded-lg shadow-lg space-y-4">
                        <h3 className="text-lg font-semibold text-gray-200">Audio Mix</h3>
                        
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <label className="text-sm font-medium text-gray-300">Original Video Volume</label>
                                <span className="text-sm text-indigo-400 font-mono">{(videoVolume * 100).toFixed(0)}%</span>
                            </div>
                            <input
                                type="range" min="0" max="1" step="0.05" value={videoVolume}
                                onChange={(e) => setVideoVolume(parseFloat(e.target.value))}
                            />
                        </div>

                        <div className="border-t border-gray-700 pt-4">
                            <label htmlFor="musicFile" className="text-sm font-medium text-gray-300 mb-2 block">Add Background Music</label>
                            {!musicFile ? (
                                <input
                                    id="musicFile" type="file" accept="audio/*" onChange={handleMusicFileSelect}
                                    className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-gray-600 file:text-gray-200 hover:file:bg-gray-500 cursor-pointer"
                                />
                            ) : (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between bg-gray-700 p-2 rounded-md">
                                        <p className="text-sm text-gray-300 truncate pr-2">{musicFile.name}</p>
                                        <button
                                            onClick={() => setMusicFile(null)}
                                            className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-1 px-3 rounded transition-colors flex-shrink-0"
                                        >Remove</button>
                                    </div>
                                    <div>
                                        <div className="flex justify-between items-center mb-1">
                                            <label className="text-sm font-medium text-gray-300">Music Volume</label>
                                            <span className="text-sm text-indigo-400 font-mono">{(musicVolume * 100).toFixed(0)}%</span>
                                        </div>
                                        <input
                                            type="range" min="0" max="1" step="0.05" value={musicVolume}
                                            onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
                                            className="w-full"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                   {/* Output Quality Section */}
                  <div className="bg-gray-800 p-4 rounded-lg shadow-lg">
                      <h3 className="text-lg font-semibold mb-3 text-gray-200">Output Quality</h3>
                      <div className="flex items-center justify-between">
                          <div>
                              <label htmlFor="upscaleToggle" className="font-medium text-gray-300">Upscale to 4K</label>
                              <p className="text-xs text-gray-500">Improves resolution but takes longer to process.</p>
                          </div>
                          <label htmlFor="upscaleToggle" className="relative inline-flex items-center cursor-pointer">
                              <input
                                  type="checkbox"
                                  id="upscaleToggle"
                                  className="sr-only peer"
                                  checked={isUpscaled}
                                  onChange={(e) => setIsUpscaled(e.target.checked)}
                              />
                              <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-focus:ring-4 peer-focus:ring-indigo-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                          </label>
                      </div>
                  </div>

                  {/* Watermark Section */}
                  <div className="bg-gray-800 p-4 rounded-lg shadow-lg">
                    <h3 className="text-lg font-semibold mb-3 text-gray-200">Watermark</h3>
                     <div className="flex bg-gray-700 rounded-md p-1 mb-4">
                        <button onClick={() => setWatermarkType('text')} className={`w-1/2 py-1.5 rounded text-sm font-semibold transition-colors ${watermarkType === 'text' ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-600'}`}>
                            Text
                        </button>
                        <button onClick={() => setWatermarkType('image')} className={`w-1/2 py-1.5 rounded text-sm font-semibold transition-colors ${watermarkType === 'image' ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-600'}`}>
                            Image
                        </button>
                    </div>

                    <div className="space-y-4">
                        {watermarkType === 'text' ? (
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
                        ) : (
                             <div>
                                <label htmlFor="watermarkImage" className="text-sm font-medium text-gray-300 mb-2 block">Image File</label>
                                {watermarkImageSrc ? (
                                    <div className="flex items-center gap-4">
                                        <img src={watermarkImageSrc} alt="Watermark Preview" className="w-16 h-16 object-contain rounded-md bg-gray-900 p-1 border border-gray-600" />
                                        <button
                                            onClick={() => {
                                                if (watermarkImageSrc) URL.revokeObjectURL(watermarkImageSrc);
                                                setWatermarkImageSrc(null);
                                                const input = document.getElementById('watermarkImage') as HTMLInputElement;
                                                if (input) input.value = '';
                                            }}
                                            className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-1 px-3 rounded transition-colors"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                ) : (
                                    <input
                                        id="watermarkImage"
                                        type="file"
                                        accept="image/*"
                                        onChange={handleWatermarkImageSelect}
                                        className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-gray-600 file:text-gray-200 hover:file:bg-gray-500 cursor-pointer"
                                    />
                                )}
                            </div>
                        )}

                        {watermarkType === 'image' && (
                             <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="text-sm font-medium text-gray-300">Size</label>
                                    <span className="text-sm text-indigo-400 font-mono">{watermarkImageSize}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="5"
                                    max="50"
                                    step="1"
                                    value={watermarkImageSize}
                                    onChange={(e) => setWatermarkImageSize(parseInt(e.target.value, 10))}
                                />
                            </div>
                        )}

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
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <label className="text-sm font-medium text-gray-300">Rotation</label>
                                <span className="text-sm text-indigo-400 font-mono">{watermarkRotation}°</span>
                            </div>
                            <input
                                type="range"
                                min="-180"
                                max="180"
                                step="1"
                                value={watermarkRotation}
                                onChange={(e) => setWatermarkRotation(parseInt(e.target.value, 10))}
                            />
                        </div>
                         <div>
                            <div className="flex justify-between items-center mb-1">
                                <label className="text-sm font-medium text-gray-300">Blur</label>
                                <span className="text-sm text-indigo-400 font-mono">{watermarkBlur}px</span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="20"
                                step="1"
                                value={watermarkBlur}
                                onChange={(e) => setWatermarkBlur(parseInt(e.target.value, 10))}
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
              <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-lg z-10">
                <div className="w-16 h-16 border-4 border-t-indigo-500 border-gray-600 rounded-full animate-spin mb-6"></div>
                <h2 className="text-3xl font-bold text-white mb-4">Creating your short...</h2>
                <div className="w-full max-w-md px-4">
                    <div className="w-full bg-gray-700 rounded-full h-2.5 mb-1 shadow-inner">
                        <div 
                            className="bg-indigo-500 h-2.5 rounded-full transition-all duration-150" 
                            style={{ width: `${processingProgress}%` }}
                        ></div>
                    </div>
                    <p className="text-gray-300 text-center font-mono">{processingProgress}% complete</p>
                </div>
                <p className="text-gray-400 mt-4 text-sm">This may take a moment. Please keep this tab open.</p>
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
