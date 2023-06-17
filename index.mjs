import { create_video } from "./classes/video.mjs";
import { VOICES } from "./classes/voice.mjs";

import { Reddit, TIME_FRAMES } from "./classes/reddit.mjs";
import BadWordsFilter from "bad-words";

import { Youtube, VIDEO_CATEGORIES, SCOPES } from "./classes/youtube.mjs";

import fs from "fs";

/**
 * @typedef {Object} VideoInfo
 * 
 * @property {string} title
 * @property {string} description
 * @property {lines} string[]
 */

/**
 * Template functions for helping create videos.
 */
const video_templates = {
    /**
     * A "reddit stories" video based off of a subreddit's tops posts whithin the given time frame.
     * @param {string} subreddit The subreddit to scrape stories from.
     * @param {string} time_frame The time frame to scrape stories from.
     * @param {number} number_of_stories The amount of stories to use.
     */
    'reddit': async (subreddit, time_frame, number_of_stories) => {

        console.debug(`Scraping r/${subreddit}...`);

        let reddit = new Reddit();

        await reddit.open();
        let posts = await reddit.scrape_subreddit(subreddit, time_frame, number_of_stories);
        await reddit.close();

        const title = `Reddit Stories - r/${subreddit}`;
        let description = `Stories and posts taken from the '${subreddit}' subreddit.\nThe original posts are linked below.\n`;

        let lines = [
            "Reddit Stories",
            `r/${subreddit}`,
        ];

        // Create a profanity filter
        let filter = new BadWordsFilter();
        filter.removeWords("god"); // No clue why this is normally filtered out...
        filter.addWords("smartass"); // ...and why this isn't.

        console.debug("Filtering profanity and writing script...");

        for (let i = 0; i < posts.length; i++) {
            const post = posts[i];

            // Split post into individual sentences
            let post_lines = filter.clean(post.body)
                .replace(/\n/g, '|')
                .split('|');

            for (let i = 0; i < post_lines.length; i++) {
                const line = post_lines[i];

                // If line is too long...
                if (line.length > 700) {
                    // ...BLACK MAGIC (split into sentences)
                    // This prevents massive paragraphs with no line breaks from trailing off of the screen.
                    let new_lines = line
                        .match(/(?=[^])(?:\P{Sentence_Terminal}|\p{Sentence_Terminal}(?!['"`\p{Close_Punctuation}\p{Final_Punctuation}\s]))*(?:\p{Sentence_Terminal}+['"`\p{Close_Punctuation}\p{Final_Punctuation}]*|$)/guy)
                        .map(line => line.trim());

                    // Insert sentences in place of ginormous paragraph
                    post_lines.splice(i, 1, ...new_lines);
                }
            }

            // Add video lines for post
            lines.push(
                `Story #${i + 1}`,
                filter.clean(post.title), // Filter title

                ...(post_lines.filter(str => !(str.length <= 1) ))
            );

            // Credit post in description
            description += `\n${post.title} - ${post.author}\n ${post.url}\n`;
        }

        return {
            title,
            description,
            lines,
        };
    },
}

const video_info = await video_templates.reddit('talesfromretail', TIME_FRAMES.PAST_MONTH, 10);
fs.writeFileSync('./script.txt', video_info.lines.join('\n'));
console.log(video_info.lines);

// Get all music by Lakey Inspired and randomly sort it.
const MUSIC_DIR = './assets/music/Lakey Inspired/';
const background_music = fs.readdirSync(MUSIC_DIR)
    .map(value => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => MUSIC_DIR + value);

// Create the video
await create_video({
    out_path: './out.mp4',

    lines: video_info.lines,

    fps: 24,
    width: 1280,
    height: 720,

    voice: VOICES.US_ROGER,
    voice_speed: 1.2,

    font: './assets/fonts/poppins.ttf',
    font_size: 30,
    font_color: '#f4f4f4',

    background_footage: './assets/clips/gameplay_24_2.mp4',
    background_music,
});

// Upload to YouTube
const youtube = new Youtube(
    './secret/yt_client_secret.json',
    './secret/yt_api_key.json',
    './secret/yt_user_token.json',
    [
        SCOPES.UPLOAD
    ]
);

await youtube.authorize();

await youtube.upload_video(
    './out.mp4',

    {
        snippet: {
            title: video_info.title,
            description: video_info.description,
            categoryId: VIDEO_CATEGORIES.ENTERTAINMENT,
        },
        status: {
            privacyStatus: 'unlisted',
            license: 'youtube',
            selfDeclaredMadeForKids: false,
        }
    }
);