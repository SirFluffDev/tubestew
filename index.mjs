import { Youtube } from "./youtube.mjs";
import readline from 'readline';

const SCOPES = [
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/youtube.upload',
];

const youtube = new Youtube('./youtube/', SCOPES);
await youtube.authorize();

console.log("");

let rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.question("Path to video file: ", (path) => {
    rl.question("Video title: ", (video_title) => {
        rl.question("Video description: ", (video_description) => {
            console.log(path, video_title, video_description);

            youtube.upload_video(path, {
                title: video_title, 
                description: video_description
            });

            rl.close();
        });
    });
});