export type TrackKind = "original" | "youtube";

export type OriginalTrack = {
  kind: "original";
  songId: string;
};

export type YoutubeTrack = {
  kind: "youtube";
  videoId: string;
  title: string;
  channel: string;
  karaokeLikely: boolean;
};

export type Track = OriginalTrack | YoutubeTrack;

export type Summary = {
  title: string;
  kind: TrackKind;
  total: number | null;
  tune: number;
  firmness: number;
  presence: number;
  phrase: string;
  lineScores: number[];
  heard: boolean;
};

export type LyricWord = {
  text: string;
  at: number;
  midi: number;
};

export type LyricLine = {
  words: LyricWord[];
};

export type ChordHit = {
  at: number;
  dur: number;
  bass: number;
  notes: number[];
};

export type Song = {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  key: string;
  style: "straight" | "bounce";
  duration: number;
  lines: LyricLine[];
  chords: ChordHit[];
};

export type TimedLine = {
  text: string;
  at: number;
};

export type SearchHit = {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  karaokeLikely: boolean;
};
