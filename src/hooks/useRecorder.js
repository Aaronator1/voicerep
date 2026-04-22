import { useState, useRef, useCallback } from 'react';

/**
 * Core recording engine.
 * Exposes: startRecording, stopRecording, isRecording, error
 * On stop, calls onRecordingComplete(blob, durationMs). Playback is the
 * caller's responsibility — this hook no longer manages audio playback so that
 * the app can control play / pause / resume uniformly.
 */
export default function useRecorder({ onRecordingComplete }) {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState(null);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const startTimeRef = useRef(0);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);

  // Pick best available MIME type — prefer MP4/AAC (Safari) for compatibility
  const pickMimeType = useCallback(() => {
    const preferred = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
    for (const t of preferred) {
      if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return '';
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);

    try {
      // Unlock AudioContext on user gesture (iOS requirement)
      if (!audioContextRef.current) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
          audioContextRef.current = new AC();
          const buf = audioContextRef.current.createBuffer(1, 1, 22050);
          const src = audioContextRef.current.createBufferSource();
          src.buffer = buf;
          src.connect(audioContextRef.current.destination);
          src.start(0);
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 44100,
        },
      });
      streamRef.current = stream;

      const mimeType = pickMimeType();
      const options = mimeType ? { mimeType } : {};
      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const durationMs = performance.now() - startTimeRef.current;
        const blob = new Blob(chunksRef.current, {
          type: mimeType || 'audio/webm',
        });

        // Release mic
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        onRecordingComplete?.(blob, durationMs);
      };

      recorder.start(100);
      startTimeRef.current = performance.now();
      setIsRecording(true);
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setError('Microphone access denied. Please grant permission in your browser settings.');
      } else {
        setError(`Recording error: ${err.message}`);
      }
    }
  }, [onRecordingComplete, pickMimeType]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  return { isRecording, error, startRecording, stopRecording };
}
