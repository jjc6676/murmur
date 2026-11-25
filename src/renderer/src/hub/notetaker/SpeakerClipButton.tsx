import { useEffect, useRef, useState } from 'react';
import { Play, Square } from 'lucide-react';
import { api } from '../../lib/api';
import { Button } from '../../ui';

export function SpeakerClipButton({ meetingId, speaker, speakerName }: { meetingId: string; speaker: string; speakerName: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => () => {
    audioRef.current?.pause();
    audioRef.current = null;
  }, []);

  const toggle = async () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setPlaying(false);
      return;
    }
    const source = await api.meetings.getSpeakerClip(meetingId, speaker);
    if (!source) {
      setUnavailable(true);
      return;
    }
    const audio = new Audio(source);
    audioRef.current = audio;
    audio.addEventListener('ended', () => {
      audioRef.current = null;
      setPlaying(false);
    }, { once: true });
    await audio.play();
    setPlaying(true);
  };

  return (
    <Button
      size="sm"
      variant="ghost"
      icon={playing ? <Square size={12} /> : <Play size={12} />}
      disabled={unavailable}
      title={unavailable ? 'No saved local audio is available' : undefined}
      onClick={() => void toggle()}
    >
      {playing ? `Stop ${speakerName} clip` : unavailable ? 'Clip unavailable' : `Play ${speakerName} clip`}
    </Button>
  );
}
