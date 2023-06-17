import { path as FFMPEG } from "@ffmpeg-installer/ffmpeg";
import { path as FFPROBE } from "@ffprobe-installer/ffprobe";
import SOX from "sox-static";

import { spawn } from 'child_process';

import { TextRenderer } from "./text.mjs";

import { MsEdgeTTS } from "msedge-tts";
import { getAudioDurationInSeconds } from "get-audio-duration";

import fs from "fs";

/**
 * Execute a shell command.
 * @param {string} command Command to execute
 * @param {string[]} args Command arguments
 * @param {boolean} log Whether to show command output or not
 * @returns {Promise<number>} Exit code
 */
const run_command = (command, args, log = false) => new Promise((resolve) => {
    if (log) console.log(command, ...args);

    const process = spawn(
        command,
        args,
        { stdio: (log) ? ('inherit') : (undefined) }
    );

    process.on('exit', (code) => resolve(code));
});

/** Where the temporary folder is placed */
const TEMP_DIR = './temp';

/**
 * Stores information about a video
 * @typedef {Object} VideoInfo
 * 
 * @property {string} out_path
 * 
 * @property {string[]} lines
 * 
 * @property {number} fps
 * @property {number} width
 * @property {number} height
 * 
 * @property {string} font
 * @property {number} font_size
 * @property {string} font_color
 * 
 * @property {string} voice
 * @property {number} voice_speed
 * 
 * @property {string} background_footage
 * @property {string[]} background_music
*/

/**
 * Create a video using the given information
 * @param {VideoInfo} video_info
 */
export async function create_video(video_info) {

    // Create temp directory
    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

    // Generate assets
    {

        const promises = [];

        const text_renderer = new TextRenderer(
            video_info.font,
            video_info.font_size,
            video_info.font_color,
        );

        const tts = new MsEdgeTTS();
        await tts.setMetadata(video_info.voice, 'audio-24khz-48kbitrate-mono-mp3');

        for (let i = 0; i < video_info.lines.length; i++) {
            const line = video_info.lines[i];

            promises.push(
                // Subtitle
                text_renderer.render_text(
                    `${TEMP_DIR}/subtitle_${i}.png`,
                    line,
                    Math.floor(video_info.width * 0.75),
                ),

                // Text-to-speech
                tts.toFile(
                    `${TEMP_DIR}/subtitle_${i}.mp3`,
                    `<prosody rate="${(video_info.voice_speed - 1) * 100}%">${line.replace(/ - /g, '...')}</prosody>`,
                )
            );
        }

        // Wait for all assets to finish generating
        await Promise.all(promises);
    }

    // Edit video
    let position = 0;

    let image_inputs = [];
    let image_filters = [];

    let audio_inputs = [];

    for (let i = 0; i < video_info.lines.length; i++) {

        // Get paths to video assets
        const subtitle_path = `${TEMP_DIR}/subtitle_${i}.png`;
        const voiceover_path = `${TEMP_DIR}/subtitle_${i}.mp3`;

        // Get the length of the current subtitle in seconds.
        let subtitle_length_seconds;
        try {
            // Sometimes, for whatever reason, some text-to-speech clips are silent.
            // Usually this will happen due to the line just being a few characters. 
            // EX: '-', '***', etc.
            // If a blank subtitle audio file is empty, then this will throw an error.
            subtitle_length_seconds = await getAudioDurationInSeconds(voiceover_path, FFPROBE);

            // If it doesn't throw an error, then we can add it to the voiceover safely.
            audio_inputs.push(
                `|sox ${TEMP_DIR}/subtitle_${i}.mp3 -p pad ${position / video_info.fps}`,
            );
        }
        catch {
            // Oh noes! It did throw an error...
            console.warn("Empty subtitle!", subtitle_path, video_info.lines[i]);

            // If it does throw an error, we can't really just skip a subtitle.
            // It messes up the creation of video filters.
            // So, we'll just pretend it was one second long, and everything is fine.
            subtitle_length_seconds = 1;
        }

        // Get the length of the subtitle in frames.
        const subtitle_length = Math.ceil(subtitle_length_seconds * video_info.fps);

        // Add the subtitle as an input to ffmpeg.
        image_inputs.push('-i', subtitle_path);

        // Get the start and end positions of our subtitle (again, in frames)
        let subtitle_start = position;
        let subtitle_end = position + subtitle_length - 1;

        // Add it as an ffmpeg filter
        image_filters.push(
            `[${i + 2}:v]overlay=W/2-w/2:H/2-h/2:enable='between(n,${subtitle_start},${subtitle_end})'[tmp]`
        );

        // Keep moving forward
        position += subtitle_length;

    }

    let music_inputs = [];
    let music_filters = [];

    for (let i = 0; i < video_info.background_music.length; i++) {

        // Get the path to the current background track
        const music_path = video_info.background_music[i];

        // Add it as an ffmpeg audio input
        music_inputs.push('-i', music_path);

        // Add it onto the first song
        if (i > 0) music_filters.push(
            `[${i}]acrossfade=d=8:c1=tri:c2=tri[tmp]`
        );

    }

    // Create base audio file
    await run_command(SOX, [
        '-n',                                   // New audio file
        '-r', 24000,                            // Sample rate 24000hz
        `${TEMP_DIR}/silence.wav`,              // Out path
        'trim', 0.0, position / video_info.fps, // Length of video (seconds)
    ], true);

    // Mix music together
    await run_command(FFMPEG, [
        '-y',

        // No video input
        '-vn',

        // Use all music tracks as input
        ...music_inputs,

        // Apply our transition filters
        '-filter_complex', '[0]' + music_filters.join(';[tmp]'),
        '-map', '[tmp]',

        // Sample rate of 24000hz
        '-ar', 24000,

        // Out path
        `${TEMP_DIR}/music.wav`,
    ], true);

    // Mix voiceover
    await run_command(SOX, [
        '-m', // Mix audio

        // Use our silent track as a base, and add all our voicovers on top.
        '-v', '0', `${TEMP_DIR}/silence.wav`,
        ...audio_inputs,

        '--multi-threaded',

        `${TEMP_DIR}/voiceover.wav`, // Out path
    ], true);

    // Mix final audio file
    await run_command(SOX, [
        '-m', // Mix audio

        '-v', 0.05, `${TEMP_DIR}/music.wav`, // Our music track goes first...
        '-v', 1.0, `${TEMP_DIR}/voiceover.wav`, // ...and our voiceover track goes on top.

        // Out path
        `${TEMP_DIR}/audio.wav`,

        // Clip the audio to the length of our video
        'trim', 0.0, position / video_info.fps
    ], true);

    // Generate video
    await run_command(FFMPEG, [
        '-y',

        // Set length of video
        '-ss', 0,
        '-to', position / video_info.fps,

        // Take in all of our inputs
        '-i', video_info.background_footage,
        '-i', `${TEMP_DIR}/audio.wav`,
        ...image_inputs,

        // Apply the subtitles to the video
        '-filter_complex', '[0:v]' + image_filters.join(';[tmp]'),
        '-map', '[tmp]',

        // Use our previously generated audio
        '-map', '1:a',

        // Export path
        video_info.out_path,
    ], true);

    // Delete our temp directory
    if (fs.existsSync(TEMP_DIR)) fs.rmSync(TEMP_DIR, { recursive: true, force: true });
}