import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { anchorLine, currentLineIndex, parseLyricInput, shiftLines } from "../lib/lyrics.ts";
import { describePitch, detectPitch, midiToFreq } from "../lib/pitch.ts";
import { createAcc, finalize, phraseFor, pushFrame } from "../lib/score.ts";
import { getSong, listSongs } from "../lib/songs.ts";
import { buildSearchQuery, karaokeLikely, parseYouTubeId, safeThumbnail, watchUrl } from "../lib/youtube.ts";

describe("youtube", () => {
  it("reads ids from the usual links", () => {
    assert.equal(parseYouTubeId("dQw4w9WgXcQ"), "dQw4w9WgXcQ");
    assert.equal(parseYouTubeId("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
    assert.equal(parseYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10"), "dQw4w9WgXcQ");
    assert.equal(parseYouTubeId("https://m.youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
    assert.equal(parseYouTubeId("https://example.com/watch?v=dQw4w9WgXcQ"), null);
    assert.equal(watchUrl("dQw4w9WgXcQ"), "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    assert.equal(watchUrl("javascript:alert(1)"), null);
  });

  it("asks youtube for a karaoke or instrumental version", () => {
    assert.equal(buildSearchQuery("  luz  ", "karaoke"), "luz karaoke");
    assert.equal(buildSearchQuery("janela", "instrumental"), "janela instrumental OR playback");
    assert.equal(buildSearchQuery("a", "karaoke"), null);
    assert.equal(karaokeLikely("Luz do Palco karaoke"), true);
    assert.equal(karaokeLikely("Clipe oficial"), false);
    assert.match(safeThumbnail("dQw4w9WgXcQ", "https://evil.example/x"), /^https:\/\/i\.ytimg\.com\/vi\/dQw4w9WgXcQ\//);
  });
});

describe("pitch", () => {
  it("names A4 and hears a pure tone", () => {
    const named = describePitch(440);
    assert.equal(named.label, "Lá 4");
    assert.equal(named.midi, 69);
    const sampleRate = 44100;
    const buffer = new Float32Array(4096);
    for (let i = 0; i < buffer.length; i++) buffer[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate);
    const heard = detectPitch(buffer, sampleRate);
    assert.ok(heard);
    assert.ok(Math.abs((heard ?? 0) - 440) < 2);
    assert.ok(Math.abs(midiToFreq(60) - 261.63) < 0.1);
  });

  it("ignores silence", () => {
    assert.equal(detectPitch(new Float32Array(2048), 44100), null);
  });
});

describe("lyrics", () => {
  it("keeps LRC times and spreads plain lines", () => {
    const timed = parseLyricInput("[00:05.00] primeira\n[00:12.50] segunda\n", 80);
    assert.deepEqual(timed.map((line) => line.at), [5, 12.5]);
    const plain = parseLyricInput("um\ndois\ntrês\n", 100);
    assert.equal(plain.length, 3);
    assert.ok(plain[0].at < plain[1].at && plain[1].at < plain[2].at);
    assert.ok(plain[2].at < 100);
  });

  it("anchors a line without crossing the neighbors", () => {
    const lines = [
      { text: "a", at: 2 },
      { text: "b", at: 6 },
      { text: "c", at: 10 },
    ];
    const next = anchorLine(lines, 1, 3);
    assert.ok(next[0].at <= next[1].at - 0.3);
    assert.ok(next[1].at <= next[2].at - 0.3);
    const shifted = shiftLines(lines, -5);
    assert.equal(shifted[0].at, 0);
    assert.equal(currentLineIndex(lines, 6.1), 1);
  });
});

describe("songs and score", () => {
  it("keeps every word inside the song", () => {
    for (const song of listSongs()) {
      assert.equal(song.lines.length, 8);
      assert.ok(song.duration > 30);
      let previous = -1;
      for (const line of song.lines) {
        for (const word of line.words) {
          assert.ok(word.at > previous);
          assert.ok(word.at < song.duration);
          assert.ok(word.midi >= 55 && word.midi <= 74);
          previous = word.at;
        }
      }
      assert.ok(getSong(song.id));
    }
  });

  it("scores a steady in-tune voice and stays quiet without a mic", () => {
    const acc = createAcc(true);
    for (let i = 0; i < 40; i++) {
      pushFrame(acc, { voiced: true, centsAbs: 8, noteActive: true, midiFloat: 64 + (i % 2) * 0.02 });
    }
    const summary = finalize(acc, "Luz do Palco", "original", true);
    assert.ok(summary.total != null && summary.total >= 80);
    assert.equal(summary.phrase, phraseFor(summary.total));

    const silent = createAcc(true);
    pushFrame(silent, { voiced: false, centsAbs: null, noteActive: true, midiFloat: null });
    const missed = finalize(silent, "Luz do Palco", "original", false);
    assert.equal(missed.total, null);
    assert.equal(missed.heard, false);
  });
});
